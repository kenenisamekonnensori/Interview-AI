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
import { ConversationEventPublisher } from "./events.js";
import { grantDeepgramAccessToken, synthesizeSpeech } from "./deepgram.js";
import { ConversationRepository } from "./repository.js";
import { assertConversationTransition } from "./state-machine.js";
import type {
  ConversationResult,
  ConversationSessionContext,
  ConversationTurnRecord,
} from "./types.js";

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
  private readonly aiProvider: AiProvider;

  constructor(
    private readonly database: PrismaClient,
    private readonly environment: ServerEnvironment,
    private readonly interviewService: InterviewService,
    private readonly events: ConversationEventPublisher,
  ) {
    this.repository = new ConversationRepository(database);
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
    if (conversation.state !== "GREETING" && conversation.state !== "THINKING") {
      throw new ConversationError(
        "INVALID_STATE_TRANSITION",
        "The interviewer cannot respond in the current state.",
      );
    }

    const plan = toPlan(conversation.interview.plan);
    const context = buildSessionContext(conversation, plan);
    const shouldClose = hasReachedPlanObjectives(plan, context);
    const response = await this.aiProvider.generateInterviewerResponse({
      interviewContext: {
        interviewType: conversation.interview.interviewType,
        difficulty: conversation.interview.difficulty,
        targetRole: conversation.interview.targetRole,
        objectives: plan.objectives,
        topics: plan.topics.map((topic) => topic.topic),
        durationRemainingSeconds: context.durationRemainingSeconds,
      },
      conversationMemory: {
        coveredTopics: context.coveredTopics,
        questionCount: context.questionCount,
        recentTurns: context.recentTurns,
        unresolvedFollowUps: context.unresolvedFollowUps,
      },
      latestCandidateAnswer:
        [...conversation.turns].reverse().find((turn) => turn.speaker === "USER")?.text ?? null,
    });
    if (
      !shouldClose &&
      (response.responseType === "CLOSING" || response.recommendedAction === "CLOSE_INTERVIEW")
    ) {
      throw new ConversationError(
        "AI_RESPONSE_NOT_ALLOWED",
        "The interviewer requested an end condition that has not been reached.",
      );
    }
    const turnType =
      conversation.state === "GREETING"
        ? "GREETING"
        : shouldClose
          ? "CLOSING"
          : response.responseType;
    const nextState: ConversationState = turnType === "CLOSING" ? "CLOSING" : "SPEAKING";
    assertConversationTransition(conversation.state, nextState);

    const turn = await this.database.$transaction((tx) =>
      this.repository.appendTurn(tx, {
        conversationId: conversation.id,
        expectedSequence: conversation.sequence,
        expectedState: conversation.state,
        nextState,
        speaker: "AI",
        type: turnType,
        text: response.responseText,
      }),
    );
    if (!turn)
      throw new ConversationError(
        "CONVERSATION_STATE_CONFLICT",
        "The conversation changed while the response was generated. Retry the request.",
      );
    const result = { turn: asTurnRecord(turn), state: nextState };
    this.events.publish({
      name: "AIResponseGenerated",
      payload: { interviewId, conversationId: conversation.id, turn: asTurnDto(turn) },
    });
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

  async failUnrecoverableSession(interviewId: string, userId: string) {
    return this.interviewService.failActiveSession(interviewId, userId);
  }

  async getAudioTurn(interviewId: string, turnId: string, userId: string) {
    const turn = await this.repository.findOwnedAiTurn(interviewId, turnId, userId);
    if (!turn) throw new ConversationError("AI_TURN_NOT_FOUND", "AI turn not found.");
    return turn;
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
    return { accessToken: await grantDeepgramAccessToken(this.environment), expiresInSeconds: 30 };
  }

  synthesizeTurn(turn: { text: string }) {
    return synthesizeSpeech(this.environment, turn.text);
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
  const turns = conversation.turns;
  const transcript = turns.map((turn) => turn.text.toLowerCase()).join(" ");
  const coveredTopics = topics
    .map((topic) => topic.topic)
    .filter((topic) => transcript.includes(topic.toLowerCase()));
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
    recentTurns: turns
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
