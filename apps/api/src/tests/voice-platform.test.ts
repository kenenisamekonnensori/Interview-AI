import { afterEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../../prisma/generated/client.js";

import {
  buildAgentGreeting,
  buildAgentInterviewInstruction,
  buildAgentOpeningMessage,
} from "@interviewer-ai/prompts";

import { resolveAgentResumeDirective } from "../modules/conversation/agent-directives.js";
import { ConversationService } from "../modules/conversation/service.js";
import { InterviewService } from "../modules/interviews/service.js";
import type { ConversationEventPublisher } from "../modules/conversation/events.js";
import type { ServerEnvironment } from "@interviewer-ai/config";
import { TranscriptRetentionSweeper } from "../services/transcript-retention.js";
import { isVoiceConcurrencyLease, VoiceConcurrencyLimiter } from "../services/voice-concurrency.js";
import { VoiceSessionRegistry } from "../services/voice-session-registry.js";

/**
 * Phase 4 production hardening: one live voice owner per interview, a
 * deployment-wide concurrency ceiling, and a configurable transcript retention
 * policy. These are the failure drills the phase requires — two instances (or
 * two tabs) must never both drive an interview, and over-capacity must fail
 * cleanly instead of exhausting the provider plan.
 */

const opening = buildAgentOpeningMessage({
  interviewType: "TECHNICAL",
  difficulty: "MEDIUM",
  targetRole: "Backend Engineer",
  language: "en",
  topics: ["caching"],
  objectives: ["Explain trade-offs"],
});

describe("agent opening decision", () => {
  it("injects nothing on a brand-new conversation (the provider greets)", () => {
    expect(resolveAgentResumeDirective({ turns: [] })).toBeNull();
  });

  it("resumes a reconnect by re-asking the unanswered question", () => {
    const resumed = resolveAgentResumeDirective({
      turns: [
        { speaker: "AI", type: "QUESTION", text: "How would you shard this cache?" },
        { speaker: "USER", type: "ANSWER", text: "Earlier answer." },
      ],
    });
    expect(resumed).toContain("How would you shard this cache?");
    expect(resumed).toContain("still unanswered");
    expect(resumed).toContain("just reconnected");
  });

  it("responds to the candidate's last answer instead of repeating a question", () => {
    const resumed = resolveAgentResumeDirective({
      turns: [
        { speaker: "USER", type: "ANSWER", text: "We used a write-through cache." },
        { speaker: "AI", type: "QUESTION", text: "Why write-through?" },
      ],
    });
    expect(resumed).toContain("candidate answered your previous question last");
    expect(resumed).not.toContain("Why write-through?");
  });

  it("keeps the greeting a greeting, never a fabricated question", () => {
    // The opening is deterministic provider input, not generated content: it
    // must not smuggle the entire instruction into the spoken turn.
    const instruction = buildAgentInterviewInstruction({
      interviewType: "TECHNICAL",
      difficulty: "MEDIUM",
      targetRole: "Backend Engineer",
      language: "en",
      topics: ["caching"],
      objectives: ["Explain trade-offs"],
    });
    expect(instruction).not.toBe(opening);
    expect(opening.length).toBeLessThan(300);
  });
});

describe("provider-side greeting", () => {
  const base = {
    interviewType: "TECHNICAL",
    difficulty: "MEDIUM" as const,
    targetRole: "Backend Engineer",
    language: "en",
    topics: ["caching strategies"],
    objectives: ["Explain trade-offs"],
  };

  it("greets first and already contains the opening question", () => {
    const greeting = buildAgentGreeting(base);
    expect(greeting).toContain("welcome");
    expect(greeting).toContain("Backend Engineer");
    expect(greeting).toContain("caching strategies");
    // The first thing the candidate hears is a question, not dead air.
    expect(greeting.trim().endsWith("?")).toBe(true);
  });

  it("speaks in the interview language", () => {
    expect(buildAgentGreeting({ ...base, language: "de" })).toContain("Hallo und willkommen");
    expect(buildAgentGreeting({ ...base, language: "es" })).toContain("Hola y bienvenido");
    // Unsupported languages fall back to English rather than silencing the
    // interview.
    expect(buildAgentGreeting({ ...base, language: "ja" })).toBe(buildAgentGreeting(base));
  });

  it("opens a general intake with an introduction prompt", () => {
    const greeting = buildAgentGreeting({
      ...base,
      targetRole: null,
      isGeneralIntake: true,
      topics: [],
    });
    expect(greeting).toContain("tell me about yourself");
    expect(greeting).toContain("technologies you work with");
  });
});

describe("voice session ownership", () => {
  const registries: VoiceSessionRegistry[] = [];

  afterEach(async () => {
    await Promise.all(registries.map((registry) => registry.close()));
    registries.length = 0;
  });

  function registry() {
    const created = new VoiceSessionRegistry(undefined, { renewIntervalMs: 60_000 });
    registries.push(created);
    return created;
  }

  it("lets the newest session take over and tells the previous one to close", async () => {
    const sessions = registry();
    const first = await sessions.claim("interview-1", "session-a");
    const superseded = vi.fn();
    first.onSuperseded(superseded);

    const second = await sessions.claim("interview-1", "session-b");

    expect(superseded).toHaveBeenCalledTimes(1);
    await expect(sessions.owner("interview-1")).resolves.toBe("session-b");
    // The new owner is never told to close by its own claim.
    const secondSuperseded = vi.fn();
    second.onSuperseded(secondSuperseded);
    expect(secondSuperseded).not.toHaveBeenCalled();
    await first.release();
    await second.release();
  });

  it("releases ownership idempotently and keeps interviews independent", async () => {
    const sessions = registry();
    const first = await sessions.claim("interview-1", "session-a");
    const other = await sessions.claim("interview-2", "session-b");
    await first.release();
    await first.release();
    await expect(sessions.owner("interview-1")).resolves.toBeNull();
    await expect(sessions.owner("interview-2")).resolves.toBe("session-b");
    await other.release();
  });

  it("does not notify a session that is already gone", async () => {
    const sessions = registry();
    const first = await sessions.claim("interview-1", "session-a");
    const superseded = vi.fn();
    first.onSuperseded(superseded);
    await first.release();
    await sessions.claim("interview-1", "session-b");
    expect(superseded).not.toHaveBeenCalled();
  });
});

describe("voice concurrency ceiling", () => {
  const limiters: VoiceConcurrencyLimiter[] = [];

  afterEach(async () => {
    await Promise.all(limiters.map((limiter) => limiter.close()));
    limiters.length = 0;
  });

  function createLimiter(limit: number) {
    const created = new VoiceConcurrencyLimiter(undefined, limit, { renewIntervalMs: 60_000 });
    limiters.push(created);
    return created;
  }

  it("admits sessions up to the limit and refuses the next one with capacity", async () => {
    const limit = createLimiter(1);
    const first = await limit.acquire();
    expect(isVoiceConcurrencyLease(first)).toBe(true);
    const second = await limit.acquire();
    expect(isVoiceConcurrencyLease(second)).toBe(false);
    if (isVoiceConcurrencyLease(second)) throw new Error("Second session was admitted.");
    expect(second.active).toBe(1);
    expect(second.limit).toBe(1);
    await expect(limit.activeCount()).resolves.toBe(1);
  });

  it("frees the slot on release so a reconnecting candidate gets back in", async () => {
    const limit = createLimiter(1);
    const first = await limit.acquire();
    if (!isVoiceConcurrencyLease(first)) throw new Error("First session was refused.");
    const refused = await limit.acquire();
    expect(isVoiceConcurrencyLease(refused)).toBe(false);
    await first.release();
    const retried = await limit.acquire();
    expect(isVoiceConcurrencyLease(retried)).toBe(true);
    if (isVoiceConcurrencyLease(retried)) await retried.release();
    await expect(limit.activeCount()).resolves.toBe(0);
  });
});

describe("server-authoritative turn settlement", () => {
  function listeningService(state: "SPEAKING" | "LISTENING" = "SPEAKING") {
    const turn = {
      id: "turn-1",
      speaker: "AI",
      type: "QUESTION",
      conversationId: "conversation-1",
      conversation: { state, interview: { status: "IN_PROGRESS" } },
    };
    const database = {
      conversationTurn: { findFirst: vi.fn(async () => turn) },
      $transaction: vi.fn(async (run: (tx: unknown) => Promise<unknown>) =>
        run({ conversation: { updateMany: vi.fn(async () => ({ count: 1 })) } }),
      ),
    } as unknown as PrismaClient;
    const service = new ConversationService(
      database,
      {} as ServerEnvironment,
      {} as InterviewService,
      { publish: vi.fn() } as unknown as ConversationEventPublisher,
    );
    return { service, database };
  }

  function ladderOf(service: ConversationService) {
    return (
      service as unknown as {
        silence: { snapshot(key: string): { armed: boolean; strikes: number }; dispose(): void };
      }
    ).silence;
  }

  it("returns the interview to LISTENING and arms the silence ladder when provider audio ends", async () => {
    const { service, database } = listeningService();
    const result = await service.acknowledgePlayback("interview-1", "turn-1", "user-1");
    expect(result.state).toBe("LISTENING");
    expect(ladderOf(service).snapshot("conversation-1").armed).toBe(true);
    expect(database.$transaction).toHaveBeenCalledOnce();
    ladderOf(service).dispose();
  });

  it("re-settles an already-listening turn without failing (client ack is idempotent)", async () => {
    const { service } = listeningService("LISTENING");
    await expect(service.acknowledgePlayback("interview-1", "turn-1", "user-1")).resolves.toEqual({
      state: "LISTENING",
    });
    expect(ladderOf(service).snapshot("conversation-1").armed).toBe(true);
    ladderOf(service).dispose();
  });
});

describe("completing after a spoken goodbye", () => {
  it("accepts a conversation that is already CLOSING", async () => {
    const conversation = {
      id: "conversation-1",
      state: "CLOSING" as const,
      turns: [{ speaker: "USER", text: "An answer." }],
    };
    const interview = {
      id: "interview-1",
      userId: "user-1",
      status: "IN_PROGRESS" as const,
      conversation,
      report: null,
    };
    const completed = {
      ...interview,
      status: "COMPLETED" as const,
      completedAt: new Date(),
      conversation: { ...conversation, state: "COMPLETED" as const },
      report: { status: "PENDING" as const },
    };
    const tx = {
      interview: {
        findFirst: vi.fn(async () => interview),
        updateMany: vi.fn(async () => ({ count: 1 })),
        update: vi.fn(async () => completed),
        findUniqueOrThrow: vi.fn(async () => completed),
      },
      conversation: { update: vi.fn(async () => ({})) },
      interviewReport: { upsert: vi.fn(async () => ({ status: "PENDING" })) },
    };
    const database = {
      $transaction: vi.fn(async (run: (client: unknown) => Promise<unknown>) => run(tx)),
    } as unknown as PrismaClient;
    const events = { publish: vi.fn() };
    const reportQueue = { enqueue: vi.fn(async () => ({})) };
    const service = new InterviewService(
      database,
      {} as ConstructorParameters<typeof InterviewService>[1],
      reportQueue as unknown as ConstructorParameters<typeof InterviewService>[2],
      events as unknown as ConstructorParameters<typeof InterviewService>[3],
    );

    // A closing turn persists the conversation in CLOSING. Completion used to
    // assert CLOSING -> CLOSING, which is not a legal transition, so the normal
    // spoken-goodbye path never completed the interview.
    await expect(service.requestCompletion("interview-1", "user-1")).resolves.toMatchObject({
      status: "COMPLETED",
    });
    expect(tx.conversation.update).toHaveBeenCalledWith({
      where: { id: "conversation-1" },
      data: { state: "COMPLETED", completedAt: expect.any(Date) },
    });
    expect(reportQueue.enqueue).toHaveBeenCalledWith({
      interviewId: "interview-1",
      userId: "user-1",
    });
  });
});

describe("transcript retention", () => {
  function fakeDatabase(deleted = 12) {
    const executeRaw = vi.fn(async () => deleted);
    return { database: { $executeRaw: executeRaw } as unknown as PrismaClient, executeRaw };
  }

  it("is off by default and never touches the database", async () => {
    const { database, executeRaw } = fakeDatabase();
    const retention = new TranscriptRetentionSweeper(database, { retentionDays: 0 });
    await expect(retention.sweep()).resolves.toEqual({ deleted: 0, skipped: true });
    expect(executeRaw).not.toHaveBeenCalled();
    expect(retention.enabled).toBe(false);
  });

  it("deletes transcripts older than the configured window", async () => {
    const { database } = fakeDatabase(7);
    const retention = new TranscriptRetentionSweeper(database, {
      retentionDays: 30,
      now: () => new Date("2026-10-29T12:00:00Z").getTime(),
    });
    await expect(retention.sweep()).resolves.toEqual({ deleted: 7, skipped: false });
  });

  it("swallows a retention failure so the API keeps serving", async () => {
    const { database } = fakeDatabase();
    (database.$executeRaw as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("database unavailable"),
    );
    const retention = new TranscriptRetentionSweeper(database, { retentionDays: 30 });
    await expect(retention.sweep()).resolves.toEqual({ deleted: 0, skipped: false });
  });
});
