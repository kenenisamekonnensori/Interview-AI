import type { PrismaClient } from "../../../prisma/generated/client.js";
import type { ServerEnvironment } from "@interviewer-ai/config";
import type {
  ConversationState,
  FinalizeTranscriptRequest,
  InterviewPlan,
} from "@interviewer-ai/types";
import { interviewPlanSchema } from "@interviewer-ai/types";

import { createAiProvider, type AiProvider } from "../ai/index.js";
import type { InterviewService } from "../interviews/service.js";
import { InterviewTools } from "../interviews/tools.js";
import { ConversationEventPublisher } from "./events.js";
import {
  bufferAudioStream,
  grantDeepgramAccessToken,
  isSupportedVoiceLanguage,
  synthesizeSpeech,
  ttsModelFor,
} from "./deepgram.js";
import { ConversationRepository } from "./repository.js";
import { recoveryForAiResponseFailure, replayGeneratedResponse } from "./recovery.js";
import { assertConversationTransition } from "./state-machine.js";
import {
  awaitPreWarm,
  getCachedAudio,
  isPreWarmInFlight,
  isVoiceActive,
  markVoiceActive,
  registerPreWarm,
  setCachedAudio,
} from "./tts-cache.js";
import type {
  ConversationResult,
  ConversationSessionContext,
  ConversationTurnRecord,
} from "./types.js";
import { observability } from "../../services/observability.js";

export class ConversationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ConversationError";
  }
}

export class ConversationService {
  readonly repository: ConversationRepository;
  private readonly interviewTools: InterviewTools;
  private readonly aiProvider: AiProvider;

  constructor(
    private readonly database: PrismaClient,
    private readonly environment: ServerEnvironment,
    private readonly interviewService: InterviewService,
    private readonly events: ConversationEventPublisher,
  ) {
    this.repository = new ConversationRepository(database);
    this.interviewTools = new InterviewTools(database, interviewService);
    this.aiProvider = createAiProvider(environment);
  }

  async start(interviewId: string, userId: string) {
    const started = await this.interviewService.start(interviewId, userId);
    let greeting: ConversationResult | null = null;
    if (started.conversation.state === "GREETING") {
      try {
        greeting = await this.generateResponse(interviewId, userId);
      } catch (error) {
        if (!(error instanceof ConversationError) || error.code !== "CONVERSATION_STATE_CONFLICT") {
          throw error;
        }
      }
    }
    const conversation = await this.repository.findOwnedConversation(interviewId, userId);
    if (!conversation)
      throw new ConversationError("CONVERSATION_NOT_FOUND", "Conversation not found.");
    return { conversation, greeting, started: started.started };
  }

  async generateResponse(interviewId: string, userId: string): Promise<ConversationResult> {
    const conversation = await this.requireActiveConversation(interviewId, userId);
    await this.completeIfExpired(conversation, userId);
    const replay = replayGeneratedResponse(
      conversation.state,
      conversation.turns.map(asTurnRecord),
    );
    if (replay) return replay;
    if (conversation.state !== "GREETING" && conversation.state !== "THINKING") {
      throw new ConversationError(
        "INVALID_STATE_TRANSITION",
        "The interviewer cannot respond in the current state.",
      );
    }

    const plan = toPlan(conversation.interview.plan);
    const context = buildSessionContext(conversation, plan);
    const actor = { userId };
    const [resume, job, memory, selectedTopic, priorWeakAreas] = await Promise.all([
      this.interviewTools.retrieveResumeAnalysis(actor, { interviewId }),
      this.interviewTools.retrieveJobAnalysis(actor, { interviewId }),
      this.interviewTools.retrieveMemory(actor, { interviewId }),
      this.interviewTools.identifyNextPlannedTopic(actor, { interviewId }),
      this.interviewTools.retrievePriorWeakAreas(actor, { interviewId }),
    ]);
    const shouldClose = hasReachedPlanObjectives(plan, context);
    const latestUserAnswer =
      [...conversation.turns].reverse().find((turn) => turn.speaker === "USER")?.text ?? null;
    const response = await this.aiProvider.generateInterviewerResponse({
      interviewContext: {
        interviewType: conversation.interview.interviewType,
        difficulty: conversation.interview.difficulty,
        targetRole: conversation.interview.targetRole,
        language: conversation.interview.language,
        objectives: plan.objectives,
        topics: plan.topics.map((topic) => topic.topic),
        durationRemainingSeconds: context.durationRemainingSeconds,
        selectedTopic: selectedTopic
          ? { topic: selectedTopic.topic, priority: selectedTopic.priority }
          : undefined,
        resumeSummary: resume?.summary,
        resumeSkills: resume?.skills,
        jobRequiredSkills: job?.requiredSkills,
        priorWeakAreas: priorWeakAreas.slice(0, 6),
      },
      conversationMemory: {
        coveredTopics: context.coveredTopics,
        questionCount: context.questionCount,
        recentTurns: context.recentTurns,
        unresolvedFollowUps: context.unresolvedFollowUps,
        askedQuestions: memory?.askedQuestions ?? [],
        questionDifficulty: memory?.questionDifficulty ?? conversation.interview.difficulty,
      },
      latestCandidateAnswer: latestUserAnswer,
    });
    const allowClosing =
      shouldClose ||
      context.durationRemainingSeconds <= 120 ||
      context.questionCount >= plan.topics.length * 2;
    const turnType =
      conversation.state === "GREETING"
        ? "GREETING"
        : (response.responseType === "CLOSING" || response.recommendedAction === "CLOSE_INTERVIEW") &&
            allowClosing
          ? "CLOSING"
          : response.responseType === "CLOSING"
            ? "QUESTION"
            : response.responseType;
    const nextState: ConversationState = turnType === "CLOSING" ? "CLOSING" : "SPEAKING";
    assertConversationTransition(conversation.state, nextState);
    if (
      ["QUESTION", "FOLLOW_UP", "CLARIFICATION"].includes(turnType) &&
      (memory?.askedQuestions ?? []).some(
        (question) => normalizeQuestion(question) === normalizeQuestion(response.responseText),
      )
    ) {
      throw new ConversationError(
        "DUPLICATE_AI_QUESTION",
        "The generated question duplicates an existing question. Retry for a new question.",
      );
    }
    const validatedResponse = {
      ...response,
      topicReference: plan.topics.some((topic) => topic.topic === response.topicReference)
        ? response.topicReference
        : selectedTopic?.topic,
      objectiveReference: plan.objectives.includes(response.objectiveReference ?? "")
        ? response.objectiveReference
        : undefined,
    };
    const memoryUpdate = buildMemoryUpdate({
      memory,
      plan,
      selectedTopic,
      response: validatedResponse,
      turnType,
      latestCandidateAnswer: latestUserAnswer,
    });

    const turn = await this.database.$transaction(async (tx) => {
      const appended = await this.repository.appendTurn(tx, {
        conversationId: conversation.id,
        expectedSequence: conversation.sequence,
        expectedState: conversation.state,
        nextState,
        speaker: "AI",
        type: turnType,
        text: validatedResponse.responseText,
      });
      if (!appended) return null;
      await this.repository.updateMemory(tx, interviewId, memoryUpdate);
      return appended;
    });
    if (!turn) {
      const current = await this.repository.findActiveOwned(interviewId, userId);
      const replay = current
        ? replayGeneratedResponse(current.state, current.turns.map(asTurnRecord))
        : null;
      if (replay) return replay;
      throw new ConversationError(
        "CONVERSATION_STATE_CONFLICT",
        "The conversation changed while the response was generated. Retry the request.",
      );
    }
    const result = { turn: asTurnRecord(turn), state: nextState, replayed: false };
    this.events.publish({
      name: "AIResponseGenerated",
      payload: { interviewId, conversationId: conversation.id, turn: asTurnDto(turn) },
    });
    // When the candidate is using voice, start synthesizing the reply now so the
    // subsequent audio fetch is served from cache instead of waiting for TTS.
    if (isVoiceActive(interviewId) && !isPreWarmInFlight(turn.id)) {
      this.preWarmTurnAudio(turn, conversation.interview.language);
    }
    return result;
  }

  async persistFinalTranscript(
    interviewId: string,
    userId: string,
    input: FinalizeTranscriptRequest,
  ): Promise<ConversationResult> {
    const conversation = await this.requireActiveConversation(interviewId, userId);
    await this.completeIfExpired(conversation, userId);
    if (conversation.state !== "LISTENING") {
      throw new ConversationError(
        "INVALID_STATE_TRANSITION",
        "This conversation cannot receive a finalized transcript right now.",
      );
    }
    assertConversationTransition("LISTENING", "TRANSCRIBING");
    assertConversationTransition("TRANSCRIBING", "THINKING");
    const turn = await this.database.$transaction((tx) =>
      this.repository.appendTurn(tx, {
        conversationId: conversation.id,
        expectedSequence: conversation.sequence,
        expectedState: "LISTENING",
        nextState: "THINKING",
        speaker: "USER",
        type: "ANSWER",
        text: input.text,
      }),
    );
    if (!turn)
      throw new ConversationError(
        "CONVERSATION_STATE_CONFLICT",
        "The transcript was already handled by another request. Refresh the conversation state.",
      );
    const result = { turn: asTurnRecord(turn), state: "THINKING" as const };
    this.events.publish({
      name: "TranscriptFinalized",
      payload: input.metadata
        ? {
            interviewId,
            conversationId: conversation.id,
            turn: asTurnDto(turn),
            metadata: input.metadata,
          }
        : { interviewId, conversationId: conversation.id, turn: asTurnDto(turn) },
    });
    return result;
  }

  async notifyUserSpeechStarted(interviewId: string, userId: string) {
    const conversation = await this.requireActiveConversation(interviewId, userId);
    markVoiceActive(interviewId);
    if (conversation.state === "SPEAKING") {
      assertConversationTransition("SPEAKING", "LISTENING");
      await this.database.$transaction((tx) =>
        this.repository.moveState(tx, {
          conversationId: conversation.id,
          expectedState: "SPEAKING",
          nextState: "LISTENING",
        }),
      );
    }
    this.events.publish({
      name: "UserSpeechStarted",
      payload: {
        interviewId,
        conversationId: conversation.id,
        occurredAt: new Date().toISOString(),
      },
    });
    return { conversationId: conversation.id };
  }

  async acknowledgePlayback(interviewId: string, turnId: string, userId: string) {
    const turn = await this.repository.findOwnedTurn(interviewId, turnId, userId);
    if (!turn || turn.speaker !== "AI")
      throw new ConversationError("AI_TURN_NOT_FOUND", "AI turn not found.");
    if (turn.type === "CLOSING") {
      const interview = await this.interviewService.requestCompletion(interviewId, userId);
      return { state: interview.status };
    }
    if (turn.conversation.interview.status !== "IN_PROGRESS")
      throw new ConversationError("CONVERSATION_NOT_ACTIVE", "The interview is no longer active.");
    if (turn.conversation.state === "LISTENING") return { state: "LISTENING" as const };
    assertConversationTransition(turn.conversation.state, "LISTENING");
    const changed = await this.database.$transaction((tx) =>
      this.repository.moveState(tx, {
        conversationId: turn.conversationId,
        expectedState: turn.conversation.state,
        nextState: "LISTENING",
      }),
    );
    if (!changed.count)
      throw new ConversationError(
        "CONVERSATION_STATE_CONFLICT",
        "The playback state changed concurrently. Refresh the conversation state.",
      );
    return { state: "LISTENING" as const };
  }

  async requestCompletion(interviewId: string, userId: string) {
    return this.interviewService.requestCompletion(interviewId, userId);
  }

  async getAiResponseFailureRecovery(interviewId: string, userId: string) {
    const conversation = await this.repository.findActiveOwned(interviewId, userId);
    return conversation ? recoveryForAiResponseFailure(conversation.state) : null;
  }

  async failUnrecoverableSession(interviewId: string, userId: string) {
    return this.interviewService.failActiveSession(interviewId, userId);
  }

  async getAudioTurn(interviewId: string, turnId: string, userId: string) {
    const turn = await this.repository.findOwnedAiTurn(interviewId, turnId, userId);
    if (!turn) throw new ConversationError("AI_TURN_NOT_FOUND", "AI turn not found.");
    return turn;
  }

  /**
   * Returns the owned AI turn together with its synthesized audio, serving from
   * the cache when a pre-warm (or earlier fetch) already produced it.
   */
  async getTurnAudio(interviewId: string, turnId: string, userId: string) {
    const turn = await this.getAudioTurn(interviewId, turnId, userId);
    const cached = getCachedAudio(turnId);
    if (cached) return { turn, audio: cached, cached: true };
    // If a pre-warm is still running for this turn, await it instead of
    // synthesizing a duplicate copy of the same audio.
    const inFlight = awaitPreWarm(turnId);
    if (inFlight) {
      const audio = await inFlight;
      if (audio) return { turn, audio, cached: true };
    }
    const stream = await this.synthesizeTurn({
      text: turn.text,
      language: turn.conversation.interview.language,
    });
    const audio = await bufferAudioStream(stream);
    setCachedAudio(turnId, audio);
    return { turn, audio, cached: false };
  }

  synthesizeTurn(turn: { text: string; language: string }) {
    const model = ttsModelFor(turn.language);
    if (!model)
      throw new ConversationError(
        "VOICE_LANGUAGE_UNSUPPORTED",
        `Voice is not available in ${turn.language}. You can continue by typing.`,
      );
    return synthesizeSpeech(this.environment, turn.text, model);
  }

  publishPlaybackStarted(interviewId: string, conversationId: string, turnId: string) {
    this.events.publish({
      name: "AIStartedSpeaking",
      payload: { interviewId, conversationId, turnId, occurredAt: new Date().toISOString() },
    });
  }

  async createVoiceToken(interviewId: string, userId: string) {
    const interview = await this.repository.findOwnedInterview(interviewId, userId);
    if (!interview || !["READY", "IN_PROGRESS"].includes(interview.status))
      throw new ConversationError(
        "INTERVIEW_NOT_VOICE_READY",
        "Only ready or active interviews can use voice.",
      );
    if (!isSupportedVoiceLanguage(interview.language))
      throw new ConversationError(
        "VOICE_LANGUAGE_UNSUPPORTED",
        `Voice interviews are not available in ${interview.language}. You can continue by typing.`,
      );
    markVoiceActive(interviewId);
    return { accessToken: await grantDeepgramAccessToken(this.environment), expiresInSeconds: 30 };
  }

  private async requireActiveConversation(interviewId: string, userId: string) {
    const conversation = await this.repository.findActiveOwned(interviewId, userId);
    if (!conversation || !conversation.interview.plan)
      throw new ConversationError(
        "CONVERSATION_NOT_READY",
        "A planned active conversation is required.",
      );
    if (conversation.state === "COMPLETED" || conversation.state === "CLOSING")
      throw new ConversationError("CONVERSATION_TERMINAL", "This conversation has already ended.");
    return conversation;
  }

  /**
   * Starts TTS for a persisted AI turn in the background and caches the audio.
   * Best-effort: failures are observed and the audio route synthesizes on demand.
   */
  private preWarmTurnAudio(turn: { id: string; text: string }, language: string) {
    const promise = (async (): Promise<Buffer | null> => {
      try {
        if (getCachedAudio(turn.id)) return null;
        const model = ttsModelFor(language);
        if (!model) return null;
        const stream = await synthesizeSpeech(this.environment, turn.text, model);
        const audio = await bufferAudioStream(stream);
        setCachedAudio(turn.id, audio);
        observability().event("voice.audio.prewarmed", { turnId: turn.id, language });
        return audio;
      } catch (cause) {
        observability().event("voice.audio.prewarm_failed", {
          turnId: turn.id,
          language,
          reason: cause instanceof Error ? cause.message : String(cause),
        });
        return null;
      }
    })();
    registerPreWarm(turn.id, promise);
  }

  private async completeIfExpired(
    conversation: Awaited<ReturnType<ConversationRepository["findActiveOwned"]>> & {},
    userId: string,
  ) {
    if (!conversation) return;
    const expiresAt =
      conversation.interview.startedAt!.getTime() + conversation.interview.durationMinutes * 60_000;
    if (Date.now() < expiresAt) return;
    await this.interviewService.requestCompletion(conversation.interviewId, userId);
    throw new ConversationError(
      "INTERVIEW_DURATION_EXPIRED",
      "The configured interview duration has ended.",
    );
  }
}

function buildSessionContext(
  conversation: NonNullable<Awaited<ReturnType<ConversationRepository["findActiveOwned"]>>>,
  plan: InterviewPlan,
): ConversationSessionContext {
  const topics = plan.topics;
  const turns = [...conversation.turns].reverse();
  const transcript = turns.map((turn) => turn.text.toLowerCase()).join(" ");
  const persistedCoverage = asPersistedCoverage(conversation.interview.memory?.topicCoverage);
  const coveredTopics = topics
    .map((topic) => topic.topic)
    .filter((topic) => persistedCoverage.has(topic) || transcript.includes(topic.toLowerCase()));
  const unansweredFollowUps = turns
    .filter((turn) => turn.speaker === "AI" && turn.type === "FOLLOW_UP")
    .filter(
      (turn) =>
        !turns.some(
          (candidate) => candidate.speaker === "USER" && candidate.sequence > turn.sequence,
        ),
    )
    .map((turn) => turn.text);
  const startedAt = conversation.interview.startedAt ?? conversation.startedAt;
  return {
    objectives: plan.objectives,
    coveredTopics,
    questionCount: turns.filter(
      (turn) =>
        turn.speaker === "AI" && ["QUESTION", "FOLLOW_UP", "CLARIFICATION"].includes(turn.type),
    ).length,
    durationRemainingSeconds: Math.max(
      0,
      Math.floor(
        (startedAt.getTime() + conversation.interview.durationMinutes * 60_000 - Date.now()) /
          1_000,
      ),
    ),
    recentTurns: conversation.turns
      .slice(-12)
      .map((turn) => ({ speaker: turn.speaker, type: turn.type, text: turn.text })),
    unresolvedFollowUps: unansweredFollowUps,
  };
}

function hasReachedPlanObjectives(plan: InterviewPlan, context: ConversationSessionContext) {
  const topicCount = plan.topics.length;
  return (
    topicCount > 0 &&
    context.coveredTopics.length === topicCount &&
    context.questionCount >= topicCount
  );
}

function toPlan(plan: unknown): InterviewPlan {
  return interviewPlanSchema.parse(plan);
}

function asTurnRecord(turn: {
  id: string;
  sequence: number;
  speaker: "USER" | "AI" | "SYSTEM";
  type: string;
  text: string;
  createdAt: Date;
}): ConversationTurnRecord {
  return { ...turn, type: turn.type as ConversationTurnRecord["type"] };
}

function asTurnDto(turn: {
  id: string;
  sequence: number;
  speaker: "USER" | "AI" | "SYSTEM";
  type: string;
  text: string;
  createdAt: Date;
}) {
  return { ...asTurnRecord(turn), createdAt: turn.createdAt.toISOString() };
}

type CompactMemory = {
  askedQuestions: string[];
  topicCoverage: Array<{ topic: string; outcome: "ASKED" | "FOLLOWED_UP" | "COMPLETED" }>;
  candidateStrengths: string[];
  weakAreas: string[];
  missedFollowUps: string[];
  questionDifficulty: string;
  remainingObjectives: string[];
};

function buildMemoryUpdate({
  memory,
  plan,
  selectedTopic,
  response,
  turnType,
  latestCandidateAnswer,
}: {
  memory: CompactMemory | null;
  plan: InterviewPlan;
  selectedTopic: {
    topic: string;
    priority: "HIGH" | "MEDIUM" | "LOW";
    reason: "UNCOVERED_PLAN_TOPIC";
  } | null;
  response: Awaited<ReturnType<AiProvider["generateInterviewerResponse"]>>;
  turnType: "GREETING" | "QUESTION" | "FOLLOW_UP" | "CLARIFICATION" | "CLOSING";
  latestCandidateAnswer: string | null;
}) {
  const current = memory ?? {
    askedQuestions: [],
    topicCoverage: [],
    candidateStrengths: [],
    weakAreas: [],
    missedFollowUps: [],
    questionDifficulty: "MEDIUM",
    remainingObjectives: plan.objectives,
  };
  const askedQuestions = ["QUESTION", "FOLLOW_UP", "CLARIFICATION"].includes(turnType)
    ? uniqueStrings([...current.askedQuestions, response.responseText], 12)
    : current.askedQuestions;
  const topic = response.topicReference ?? selectedTopic?.topic;
  const topicCoverage =
    topic && turnType !== "GREETING" && turnType !== "CLOSING"
      ? mergeCoverage(
          current.topicCoverage,
          topic,
          turnType === "FOLLOW_UP" ? "FOLLOWED_UP" : "ASKED",
        )
      : current.topicCoverage;
  const assessmentLabel = topic ?? "the current topic";
  const candidateStrengths =
    response.assessment?.answerDepth === "STRONG" && latestCandidateAnswer
      ? uniqueStrings([...current.candidateStrengths, `Strong evidence on ${assessmentLabel}`], 8)
      : current.candidateStrengths;
  const weakAreas =
    response.assessment?.answerDepth === "SHALLOW" && latestCandidateAnswer
      ? uniqueStrings([...current.weakAreas, `Needs deeper evidence on ${assessmentLabel}`], 8)
      : current.weakAreas;
  const missedFollowUps =
    response.assessment?.followUpNeeded && turnType !== "FOLLOW_UP"
      ? uniqueStrings([...current.missedFollowUps, `Follow up on ${assessmentLabel}`], 6)
      : turnType === "FOLLOW_UP"
        ? current.missedFollowUps.filter((item) => !item.includes(assessmentLabel))
        : current.missedFollowUps;
  const remainingObjectives =
    response.objectiveReference && response.assessment?.answerDepth !== "SHALLOW"
      ? current.remainingObjectives.filter((objective) => objective !== response.objectiveReference)
      : current.remainingObjectives;
  return {
    askedQuestions,
    topicCoverage,
    candidateStrengths,
    weakAreas,
    missedFollowUps,
    questionDifficulty: adjustDifficulty(
      current.questionDifficulty,
      response.assessment?.answerDepth,
    ),
    remainingObjectives,
  };
}

function mergeCoverage(
  coverage: CompactMemory["topicCoverage"],
  topic: string,
  outcome: "ASKED" | "FOLLOWED_UP",
) {
  const existing = coverage.find((item) => item.topic === topic);
  return existing
    ? coverage.map((item) => (item.topic === topic ? { ...item, outcome } : item))
    : [...coverage, { topic, outcome }];
}

function uniqueStrings(values: string[], limit: number) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(-limit);
}

function normalizeQuestion(value: string) {
  return value
    .toLocaleLowerCase()
    .replaceAll(/[^a-z0-9\s]/g, "")
    .replaceAll(/\s+/g, " ")
    .trim();
}

function asPersistedCoverage(value: unknown) {
  return new Set(
    Array.isArray(value)
      ? value.flatMap((item) =>
          typeof item === "object" &&
          item !== null &&
          "topic" in item &&
          typeof item.topic === "string"
            ? [item.topic]
            : [],
        )
      : [],
  );
}

function adjustDifficulty(current: string, depth: "SHALLOW" | "ADEQUATE" | "STRONG" | undefined) {
  const levels = ["EASY", "MEDIUM", "HARD", "EXPERT"] as const;
  const index = Math.max(0, levels.indexOf(current as (typeof levels)[number]));
  if (depth === "STRONG") return levels[Math.min(index + 1, levels.length - 1)]!;
  if (depth === "SHALLOW") return levels[Math.max(index - 1, 0)]!;
  return levels[index]!;
}
