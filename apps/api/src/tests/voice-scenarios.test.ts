import { afterEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../../prisma/generated/client.js";
import { buildInterviewerBehaviorPrompt } from "@interviewer-ai/prompts";
import type { ServerEnvironment } from "@interviewer-ai/config";

import type { ConversationEventPublisher } from "../modules/conversation/events.js";
import { ConversationService } from "../modules/conversation/service.js";
import type { InterviewService } from "../modules/interviews/service.js";

import {
  buildAgentClosingDirective,
  buildAgentMoveOnDirective,
  isInjectedUserEcho,
} from "../modules/conversation/agent-directives.js";
import { recordAgentSilenceStruggle } from "../modules/conversation/agent-memory.js";
import {
  resolveSilenceStage,
  SilenceLadder,
  type SilenceStage,
} from "../modules/conversation/silence-ladder.js";
import { silenceClosingText, silenceNudgeText } from "../modules/conversation/silence-copy.js";
import {
  registerSessionDirector,
  sessionDirectorFor,
} from "../modules/conversation/session-director.js";
import { InterviewUsageService } from "../services/interview-usage.service.js";
import { InterviewSessionSweeper } from "../services/session-expiry-sweeper.js";

/**
 * Phase 3: turn-taking, silence policy and duration enforcement.
 *
 * The three experienced failure scenarios are scripted here against the ladder
 * that drives them — silent candidate, post-answer dead air, and greeting lag —
 * plus the expiry safety net and the provider usage ledger that billing reads.
 */

describe("silence ladder policy", () => {
  it("nudges twice, then changes topic, then closes once the budget is spent", () => {
    const policy = { maxNudges: 2, maxMoveOns: 3 };
    expect(resolveSilenceStage({ ...policy, strikes: 1, moveOns: 0 })).toEqual({
      kind: "NUDGE",
      strike: 1,
    });
    expect(resolveSilenceStage({ ...policy, strikes: 2, moveOns: 0 })).toEqual({
      kind: "NUDGE",
      strike: 2,
    });
    expect(resolveSilenceStage({ ...policy, strikes: 3, moveOns: 0 })).toEqual({
      kind: "MOVE_ON",
    });
    expect(resolveSilenceStage({ ...policy, strikes: 3, moveOns: 3 })).toEqual({ kind: "CLOSE" });
    // Defensive: strikes beyond the ladder width do nothing rather than loop.
    expect(resolveSilenceStage({ ...policy, strikes: 4, moveOns: 0 })).toBeNull();
  });
});

describe("silence ladder scenarios", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function createLadder(options: { maxMoveOns?: number } = {}) {
    const stages: SilenceStage[] = [];
    const ladder = new SilenceLadder({
      nudgeDelayMs: 9_000,
      speechPendingDelayMs: 20_000,
      maxNudges: 2,
      maxMoveOns: options.maxMoveOns ?? 3,
      onStage: (_key, stage) => {
        stages.push(stage);
      },
    });
    return { ladder, stages };
  }

  it("silent candidate: two nudges, then a move-on turn", async () => {
    vi.useFakeTimers();
    const { ladder, stages } = createLadder();
    ladder.arm("conversation-1");
    await vi.advanceTimersByTimeAsync(9_000);
    expect(stages).toEqual([{ kind: "NUDGE", strike: 1 }]);

    // The nudge is played out and acknowledged; listening resumes.
    ladder.arm("conversation-1");
    await vi.advanceTimersByTimeAsync(9_000);
    expect(stages.at(-1)).toEqual({ kind: "NUDGE", strike: 2 });

    ladder.arm("conversation-1");
    await vi.advanceTimersByTimeAsync(9_000);
    expect(stages.at(-1)).toEqual({ kind: "MOVE_ON" });
    expect(ladder.snapshot("conversation-1")).toMatchObject({ strikes: 3, moveOns: 1 });
  });

  it("post-answer dead air: the moved-on question opens a fresh nudge budget", async () => {
    vi.useFakeTimers();
    const { ladder, stages } = createLadder();
    for (let step = 0; step < 3; step += 1) {
      ladder.arm("conversation-1");
      await vi.advanceTimersByTimeAsync(9_000);
    }
    expect(stages.at(-1)).toEqual({ kind: "MOVE_ON" });

    // The agent's new question is acknowledged: this is a new listening period.
    ladder.resetQuestion("conversation-1");
    ladder.arm("conversation-1");
    await vi.advanceTimersByTimeAsync(9_000);
    expect(stages.at(-1)).toEqual({ kind: "NUDGE", strike: 1 });
    expect(ladder.snapshot("conversation-1")).toMatchObject({ strikes: 1, moveOns: 1 });
  });

  it("topic changes are bounded: once the move-on budget is spent, the ladder closes", async () => {
    vi.useFakeTimers();
    const { ladder, stages } = createLadder({ maxMoveOns: 1 });
    for (let step = 0; step < 3; step += 1) {
      ladder.arm("conversation-1");
      await vi.advanceTimersByTimeAsync(9_000);
    }
    expect(stages.at(-1)).toEqual({ kind: "MOVE_ON" });

    ladder.resetQuestion("conversation-1");
    for (let step = 0; step < 3; step += 1) {
      ladder.arm("conversation-1");
      await vi.advanceTimersByTimeAsync(9_000);
    }
    expect(stages.at(-1)).toEqual({ kind: "CLOSE" });
  });

  it("greeting lag: the first dead-air window is bounded by one canned stage", async () => {
    vi.useFakeTimers();
    const startedAt = Date.now();
    const { ladder, stages } = createLadder();
    // The greeting has played and been acknowledged; the candidate says nothing.
    ladder.arm("conversation-1");
    await vi.advanceTimersByTimeAsync(8_999);
    expect(stages).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(Date.now() - startedAt).toBe(9_000);
    expect(stages).toEqual([{ kind: "NUDGE", strike: 1 }]);
  });

  it("false start: detected speech extends the window instead of cancelling the ladder", async () => {
    vi.useFakeTimers();
    const { ladder, stages } = createLadder();
    ladder.arm("conversation-1", 20_000);
    await vi.advanceTimersByTimeAsync(9_000);
    expect(stages).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(11_000);
    expect(stages).toEqual([{ kind: "NUDGE", strike: 1 }]);
  });

  it("cancelling an armed stage means silence later starts from the top", async () => {
    vi.useFakeTimers();
    const { ladder, stages } = createLadder();
    ladder.arm("conversation-1");
    ladder.cancel("conversation-1");
    await vi.advanceTimersByTimeAsync(30_000);
    expect(stages).toHaveLength(0);
    ladder.arm("conversation-1");
    await vi.advanceTimersByTimeAsync(9_000);
    expect(stages).toEqual([{ kind: "NUDGE", strike: 1 }]);
  });

  it("a failing stage is reported and never breaks the ladder", async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const stages: SilenceStage[] = [];
    const ladder = new SilenceLadder({
      nudgeDelayMs: 9_000,
      speechPendingDelayMs: 20_000,
      maxNudges: 2,
      maxMoveOns: 3,
      onStage: (_key, stage) => {
        stages.push(stage);
        if (stage.kind === "MOVE_ON") throw new Error("agent session gone");
      },
      onError,
    });
    for (let step = 0; step < 3; step += 1) {
      ladder.arm("conversation-1");
      await vi.advanceTimersByTimeAsync(9_000);
    }
    expect(stages.at(-1)).toEqual({ kind: "MOVE_ON" });
    expect(onError).toHaveBeenCalledWith("conversation-1", expect.any(Error));
    expect(ladder.snapshot("conversation-1")).toMatchObject({ armed: false, strikes: 3 });
  });
});

describe("session director registry", () => {
  it("routes the move-on to the live session and unhooks it afterwards", async () => {
    const director = {
      requestMoveOn: vi.fn(async () => true),
      requestClosing: vi.fn(async () => true),
    };
    const unregister = registerSessionDirector("conversation-director", director);
    await expect(
      sessionDirectorFor("conversation-director")?.requestMoveOn({
        interviewId: "interview-1",
        conversationId: "conversation-director",
        reason: "SILENCE",
      }),
    ).resolves.toBe(true);
    unregister();
    expect(sessionDirectorFor("conversation-director")).toBeUndefined();
  });

  it("a stale disposer never unhooks the reconnected session", () => {
    const first = {
      requestMoveOn: vi.fn(async () => true),
      requestClosing: vi.fn(async () => true),
    };
    const second = {
      requestMoveOn: vi.fn(async () => true),
      requestClosing: vi.fn(async () => true),
    };
    const unregisterFirst = registerSessionDirector("conversation-reconnect", first);
    const unregisterSecond = registerSessionDirector("conversation-reconnect", second);
    // The old socket closes after the new one registered.
    unregisterFirst();
    expect(sessionDirectorFor("conversation-reconnect")).toBe(second);
    unregisterSecond();
    expect(sessionDirectorFor("conversation-reconnect")).toBeUndefined();
  });
});

describe("silence ladder dispatch", () => {
  /** The service's ladder stage handler, exercised with a live-session director. */
  function serviceWithListeningConversation() {
    const conversation = {
      id: "conversation-dispatch",
      interviewId: "interview-dispatch",
      sequence: 4,
      state: "LISTENING" as const,
      turns: [],
      interview: {
        language: "en",
        startedAt: new Date(),
        durationMinutes: 30,
        plan: { topics: [], objectives: [] },
        memory: null,
        interviewType: "TECHNICAL",
        difficulty: "MEDIUM",
        targetRole: "Backend Engineer",
        status: "IN_PROGRESS",
      },
    };
    const database = {
      conversation: { findFirst: vi.fn(async () => conversation) },
    } as unknown as PrismaClient;
    const service = new ConversationService(
      database,
      {} as ServerEnvironment,
      {} as InterviewService,
      { publish: vi.fn() } as unknown as ConversationEventPublisher,
    );
    // White-box: the ladder's per-conversation context is normally populated by
    // the playback acknowledgement that arms it.
    (
      service as unknown as {
        silenceSessions: Map<string, { interviewId: string; userId: string }>;
      }
    ).silenceSessions.set("conversation-dispatch", {
      interviewId: "interview-dispatch",
      userId: "user-dispatch",
    });
    return service;
  }

  function fireStage(service: ConversationService, stage: SilenceStage) {
    return (
      service as unknown as {
        fireSilenceStage(key: string, stage: SilenceStage): Promise<void>;
      }
    ).fireSilenceStage("conversation-dispatch", stage);
  }

  it("hands the move-on to the live agent session instead of repeating the question", async () => {
    const service = serviceWithListeningConversation();
    const director = {
      requestMoveOn: vi.fn(async () => true),
      requestClosing: vi.fn(async () => true),
    };
    const unregister = registerSessionDirector("conversation-dispatch", director);

    await fireStage(service, { kind: "MOVE_ON" });

    expect(director.requestMoveOn).toHaveBeenCalledWith({
      interviewId: "interview-dispatch",
      conversationId: "conversation-dispatch",
      reason: "SILENCE",
    });
    // The director owns the turn, so no generation work runs server-side.
    expect(director.requestClosing).not.toHaveBeenCalled();
    unregister();
  });

  it("asks the live session for a goodbye once the move-on budget is spent", async () => {
    const service = serviceWithListeningConversation();
    const director = {
      requestMoveOn: vi.fn(async () => true),
      requestClosing: vi.fn(async () => true),
    };
    const unregister = registerSessionDirector("conversation-dispatch", director);

    await fireStage(service, { kind: "CLOSE" });

    expect(director.requestClosing).toHaveBeenCalledWith({
      interviewId: "interview-dispatch",
      conversationId: "conversation-dispatch",
      reason: "SILENCE",
    });
    unregister();
  });
});

describe("silence copy", () => {
  it("keeps every supported language distinct and canned", () => {
    const languages = ["en", "es", "de", "fr", "nl"];
    const first = languages.map((language) => silenceNudgeText(language, 1));
    expect(new Set(first).size).toBe(languages.length);
    for (const language of languages) {
      expect(silenceNudgeText(language, 2)).not.toBe(silenceNudgeText(language, 1));
      expect(silenceClosingText(language).length).toBeGreaterThan(40);
    }
  });

  it("falls back to English for an unsupported language", () => {
    expect(silenceNudgeText("ja", 1)).toBe(silenceNudgeText("en", 1));
    expect(silenceClosingText("ja")).toBe(silenceClosingText("en"));
  });
});

describe("agent control directives", () => {
  it("tells the agent not to repeat the unanswered question", () => {
    const directive = buildAgentMoveOnDirective({
      unansweredTopic: "caching strategies",
      askedQuestions: ["Tell me about caching.", "How do you invalidate it?"],
      remainingObjectives: ["Explain trade-offs"],
    });
    expect(directive).toContain("Do not repeat");
    expect(directive).toContain("caching strategies");
    expect(directive).toContain("Explain trade-offs");
    expect(directive).toContain("How do you invalidate it?");
  });

  it("closes with thanks and no new question", () => {
    expect(buildAgentClosingDirective({ reason: "DURATION" })).toContain(
      "Do not ask another question",
    );
  });

  it("recognizes the provider's echo of an injected message but not candidate speech", () => {
    const injected = buildAgentMoveOnDirective({
      unansweredTopic: null,
      askedQuestions: [],
      remainingObjectives: [],
    });
    expect(isInjectedUserEcho(injected, injected)).toBe(true);
    // Provider punctuation/whitespace differences still match.
    expect(isInjectedUserEcho(injected.replaceAll(".", ""), injected)).toBe(true);
    expect(isInjectedUserEcho("We sharded by tenant id and cached the hot path.", injected)).toBe(
      false,
    );
    expect(isInjectedUserEcho("", injected)).toBe(false);
  });
});

describe("silence struggle in agent memory", () => {
  it("records a bounded, deduplicated note and leaves everything else alone", () => {
    const memory = {
      askedQuestions: ["Q1"],
      topicCoverage: [{ topic: "caching", outcome: "ASKED" as const }],
      candidateStrengths: [],
      weakAreas: [],
      missedFollowUps: [],
      questionDifficulty: "MEDIUM" as const,
      remainingObjectives: ["O1"],
    };
    const once = recordAgentSilenceStruggle(memory, "caching");
    const twice = recordAgentSilenceStruggle(once, "caching");
    expect(twice.weakAreas).toEqual(["No answer on caching"]);
    expect(twice.missedFollowUps).toEqual(["Follow up on caching"]);
    expect(twice.askedQuestions).toEqual(memory.askedQuestions);
    expect(twice.remainingObjectives).toEqual(memory.remainingObjectives);
  });
});

describe("interview usage meter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function fakeUsageDatabase() {
    const upsert = vi.fn(async () => ({}));
    const findUnique = vi.fn(async () => ({
      interviewId: "interview-1",
      voiceSeconds: 90,
      thinkRequests: 4,
      speakCharacters: 320,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    return {
      database: { interviewUsage: { upsert, findUnique } } as unknown as PrismaClient,
      upsert,
      findUnique,
    };
  }

  it("accumulates counters with additive increments", async () => {
    const { database, upsert } = fakeUsageDatabase();
    const usage = new InterviewUsageService(database);
    await usage.record("interview-1", { voiceSeconds: 30, thinkRequests: 1, speakCharacters: 120 });
    expect(upsert).toHaveBeenCalledWith({
      where: { interviewId: "interview-1" },
      create: {
        interviewId: "interview-1",
        voiceSeconds: 30,
        thinkRequests: 1,
        speakCharacters: 120,
      },
      update: {
        voiceSeconds: { increment: 30 },
        thinkRequests: { increment: 1 },
        speakCharacters: { increment: 120 },
      },
    });
  });

  it("never writes negative or empty deltas", async () => {
    const { database, upsert } = fakeUsageDatabase();
    const usage = new InterviewUsageService(database);
    await usage.record("interview-1", { voiceSeconds: -5, thinkRequests: 0, speakCharacters: 0 });
    expect(upsert).not.toHaveBeenCalled();
    await usage.record("interview-1", { voiceSeconds: 2.9 });
    expect(upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({ update: { voiceSeconds: { increment: 2 } } }),
    );
  });

  it("swallows metering failures: telemetry never fails an interview", async () => {
    const { database, upsert } = fakeUsageDatabase();
    upsert.mockRejectedValueOnce(new Error("database unavailable"));
    const usage = new InterviewUsageService(database);
    await expect(usage.record("interview-1", { thinkRequests: 1 })).resolves.toBeUndefined();
  });

  it("reads the counters billing will consume", async () => {
    const { database } = fakeUsageDatabase();
    const usage = new InterviewUsageService(database);
    await expect(usage.read("interview-1")).resolves.toEqual({
      interviewId: "interview-1",
      voiceSeconds: 90,
      thinkRequests: 4,
      speakCharacters: 320,
    });
  });
});

describe("abandoned-session sweeper", () => {
  function fakeSweeperDatabase(rows: Array<{ id: string; userId: string }>) {
    const calls: unknown[][] = [];
    const queryRaw = vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push([strings.join("?"), ...values]);
      return rows;
    });
    return {
      database: { $queryRaw: queryRaw } as unknown as PrismaClient,
      queryRaw,
      calls,
    };
  }

  it("completes every expired interview so its report is produced", async () => {
    const { database, calls } = fakeSweeperDatabase([
      { id: "interview-1", userId: "user-1" },
      { id: "interview-2", userId: "user-2" },
    ]);
    const requestCompletion = vi.fn(async () => ({}));
    const sweeper = new InterviewSessionSweeper(
      database,
      { requestCompletion },
      { now: () => new Date("2026-10-29T12:00:00Z").getTime() },
    );

    await expect(sweeper.sweep()).resolves.toEqual({ expired: 2, completed: 2, failed: 0 });
    expect(requestCompletion).toHaveBeenCalledWith("interview-1", "user-1");
    expect(requestCompletion).toHaveBeenCalledWith("interview-2", "user-2");
    // The cutoff includes the grace period so a live gateway can say goodbye.
    expect(calls[0]?.[1]).toEqual(new Date("2026-10-29T11:59:00Z"));
  });

  it("isolates one failing completion from the rest of the batch", async () => {
    const { database } = fakeSweeperDatabase([
      { id: "interview-1", userId: "user-1" },
      { id: "interview-2", userId: "user-2" },
    ]);
    const requestCompletion = vi
      .fn()
      .mockRejectedValueOnce(new Error("state conflict"))
      .mockResolvedValueOnce({});
    const sweeper = new InterviewSessionSweeper(database, { requestCompletion });

    await expect(sweeper.sweep()).resolves.toEqual({ expired: 2, completed: 1, failed: 1 });
    expect(requestCompletion).toHaveBeenCalledTimes(2);
  });

  it("does nothing when no interview has expired", async () => {
    const { database } = fakeSweeperDatabase([]);
    const requestCompletion = vi.fn(async () => ({}));
    const sweeper = new InterviewSessionSweeper(database, { requestCompletion });
    await expect(sweeper.sweep()).resolves.toEqual({ expired: 0, completed: 0, failed: 0 });
    expect(requestCompletion).not.toHaveBeenCalled();
  });

  it("runs on its interval and stops cleanly", async () => {
    vi.useFakeTimers();
    const { database } = fakeSweeperDatabase([]);
    const requestCompletion = vi.fn(async () => ({}));
    const sweeper = new InterviewSessionSweeper(database, { requestCompletion });
    sweeper.start();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(database.$queryRaw).toHaveBeenCalledTimes(1);
    await sweeper.stop();
    await vi.advanceTimersByTimeAsync(180_000);
    expect(database.$queryRaw).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});

describe("silence escalation prompt", () => {
  it("adds move-on guidance only when the ladder escalated", () => {
    const base = {
      interviewType: "TECHNICAL",
      difficulty: "MEDIUM",
      targetRole: "Backend Engineer",
      language: "en",
    };
    const normal = buildInterviewerBehaviorPrompt(base);
    const escalated = buildInterviewerBehaviorPrompt({ ...base, silenceEscalation: true });
    expect(normal).not.toContain("Silence Recovery Mode");
    expect(escalated).toContain("Silence Recovery Mode");
    expect(escalated).toContain("move to a different planned topic");
    // The structured output contract is unchanged by the escalation.
    expect(escalated.split('"responseText"').length).toBe(normal.split('"responseText"').length);
  });
});
