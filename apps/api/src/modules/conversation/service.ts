import { PassThrough, Readable } from "node:stream";

import type { Prisma, PrismaClient } from "../../../prisma/generated/client.js";
import type { ServerEnvironment } from "@interviewer-ai/config";
import type {
  ConversationState,
  ConversationTurn,
  FinalizeTranscriptRequest,
  InterviewPlan,
  WordTimingEntry,
} from "@interviewer-ai/types";
import { interviewPlanSchema } from "@interviewer-ai/types";
import {
  AccessToken,
  AgentDispatchClient,
  RoomAgentDispatch,
  RoomConfiguration,
} from "livekit-server-sdk";
import { coerceAgentMemory, resolveAgentTurnPlan } from "./agent-memory.js";
import type { InternalTurnSyncInput } from "./schema.js";

import { createAiProvider, type AiProvider } from "../ai/index.js";
import type { InterviewService } from "../interviews/service.js";
import { InterviewTools } from "../interviews/tools.js";
import { ConversationEventPublisher } from "./events.js";
import {
  bufferAudioStream,
  isSupportedVoiceLanguage,
  synthesizeSpeech,
  tryGrantDeepgramAccessToken,
  ttsModelFor,
} from "./deepgram.js";
import { VoiceTicketService } from "./tickets.js";
import { ConversationRepository } from "./repository.js";
import { recoveryForAiResponseFailure, replayGeneratedResponse } from "./recovery.js";
import { sessionDirectorFor } from "./session-director.js";
import { silenceClosingText, silenceNudgeText } from "./silence-copy.js";
import { SilenceLadder, type SilenceStage } from "./silence-ladder.js";
import { assertConversationTransition } from "./state-machine.js";
import {
  awaitPreWarm,
  getCachedAudio,
  isPreWarmInFlight,
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
import { InterviewUsageService } from "../../services/interview-usage.service.js";

/**
 * The real-time interviewer turn must fail fast: a stalled provider should hand
 * control back to the client (which can retry) rather than freeze the session.
 */
const interviewerTurnTimeoutMs = 20_000;
/**
 * First-turn budget: the greeting blocks nothing (it is generated through
 * next-response), but the candidate is sitting in dead air until it plays, so
 * fail sooner and let the retry path show something instead of silence.
 */
const greetingTurnTimeoutMs = 8_000;
/**
 * Idle time in LISTENING before the interviewer re-engages. Thinking through a
 * hard question is normal, so the first re-engagement is deliberately late
 * enough to feel patient rather than impatient.
 */
const silenceNudgeDelayMs = 12_000;
/** Speech was detected but not finalized; allow longer before treating it as silence. */
const speechPendingNudgeDelayMs = 25_000;
/** A listening period gets at most two canned nudges before the ladder moves on. */
const maxSilenceNudgesPerTurn = 2;
/**
 * Topic changes allowed across one interview before the ladder closes. Five
 * moves keep working through the plan first, so a candidate who is present but
 * slow is never ended early after a couple of quiet moments.
 */
const maxSilenceMoveOnsPerInterview = 5;
/**
 * How long the audio route may wait on an in-flight TTS pre-warm before it
 * falls back to cold synthesis (Phase 0: a pre-warm must never extend the
 * audio route's wait beyond its own deadline).
 */
const preWarmAwaitDeadlineMs = 10_000;
/**
 * A canned nudge is a few seconds of speech. If its playback acknowledgement
 * never arrives (deaf tab, suspended audio context, dropped request), the
 * server settles the turn itself so the silence ladder is re-armed instead of
 * leaving the conversation stuck in SPEAKING forever.
 */
const cannedTurnSettleFallbackMs = 20_000;

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
  readonly ticketService: VoiceTicketService;
  private readonly interviewTools: InterviewTools;
  private readonly aiProvider: AiProvider;
  private readonly usage: InterviewUsageService;
  /**
   * Backend-owned turn taking: timings and stage budget live in the ladder, so
   * the same policy applies to every lane and can be scripted in tests.
   */
  private readonly silence = new SilenceLadder({
    nudgeDelayMs: silenceNudgeDelayMs,
    speechPendingDelayMs: speechPendingNudgeDelayMs,
    maxNudges: maxSilenceNudgesPerTurn,
    maxMoveOns: maxSilenceMoveOnsPerInterview,
    onStage: (conversationId, stage) => this.fireSilenceStage(conversationId, stage),
    onError: (conversationId, error) =>
      observability().error(
        "conversation.silence.stage_failed",
        { conversationId },
        error instanceof Error ? error : new Error(String(error)),
      ),
  });
  /** Interview context for every conversation with a live ladder position. */
  private readonly silenceSessions = new Map<string, { interviewId: string; userId: string }>();
  /** Pending server-side settlement for a canned turn whose ack may never come. */
  private readonly cannedSettleTimers = new Map<
    string,
    { turnId: string; timer: NodeJS.Timeout }
  >();

  constructor(
    private readonly database: PrismaClient,
    private readonly environment: ServerEnvironment,
    private readonly interviewService: InterviewService,
    private readonly events: ConversationEventPublisher,
  ) {
    this.repository = new ConversationRepository(database);
    this.ticketService = new VoiceTicketService();
    this.interviewTools = new InterviewTools(database, interviewService);
    this.aiProvider = createAiProvider(environment);
    this.usage = new InterviewUsageService(database);
  }

  async start(interviewId: string, userId: string) {
    const started = await this.interviewService.start(interviewId, userId);
    // Greeting generation is decoupled from the request path: the LLM turn can
    // legitimately take seconds (bounded retries), and holding /start until it
    // finished froze the first spoken word behind the whole connect chain.
    // The client resolves a missing greeting via POST /conversation/next-response
    // — the single generation path, guarded against duplicates by the
    // append-turn transaction.
    const conversation = await this.repository.findOwnedConversation(interviewId, userId);
    if (!conversation)
      throw new ConversationError("CONVERSATION_NOT_FOUND", "Conversation not found.");
    return { conversation, greeting: null, started: started.started };
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
    return this.generateInterviewerTurn(conversation, userId, {
      expectedState: conversation.state,
    });
  }

  /**
   * Single generation path for greetings, answer follow-ups and the silence
   * ladder's move-on turn. `expectedState` is the state the caller observed;
   * the append-turn transaction re-checks it, so a concurrent answer can never
   * be overwritten by this turn.
   */
  private async generateInterviewerTurn(
    conversation: NonNullable<Awaited<ReturnType<ConversationRepository["findActiveOwned"]>>>,
    userId: string,
    {
      expectedState,
      silenceEscalation = false,
    }: { expectedState: ConversationState; silenceEscalation?: boolean },
  ): Promise<ConversationResult> {
    const plan = toPlan(conversation.interview.plan);
    const context = buildSessionContext(conversation, plan);
    const actor = { userId };
    // The greeting needs none of the candidate-context retrievals: it is spoken
    // before any answer exists, and skipping five DB lookups shaves real
    // milliseconds off the first word.
    const isGreetingTurn = expectedState === "GREETING";
    const [resume, job, memory, selectedTopic, priorWeakAreas] = isGreetingTurn
      ? [null, null, null, null, [] as string[]]
      : await Promise.all([
          this.interviewTools.retrieveResumeAnalysis(actor, {
            interviewId: conversation.interviewId,
          }),
          this.interviewTools.retrieveJobAnalysis(actor, {
            interviewId: conversation.interviewId,
          }),
          this.interviewTools.retrieveMemory(actor, { interviewId: conversation.interviewId }),
          this.interviewTools.identifyNextPlannedTopic(actor, {
            interviewId: conversation.interviewId,
          }),
          this.interviewTools.retrievePriorWeakAreas(actor, {
            interviewId: conversation.interviewId,
          }),
        ]);
    const shouldClose = hasReachedPlanObjectives(plan, context);
    const latestUserAnswer =
      [...conversation.turns].reverse().find((turn) => turn.speaker === "USER")?.text ?? null;
    const response = await observability().time(
      "conversation.turn.generation",
      { interviewId: conversation.interviewId, state: expectedState },
      () =>
        this.aiProvider.generateInterviewerResponse({
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
            isGeneralIntake:
              !resume &&
              !job &&
              (!conversation.interview.targetRole ||
                conversation.interview.targetRole.toLowerCase().includes("general interview")),
            silenceEscalation,
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
          timeoutMs: isGreetingTurn ? greetingTurnTimeoutMs : interviewerTurnTimeoutMs,
          greetingOnly: isGreetingTurn,
        }),
    );
    const allowClosing =
      shouldClose ||
      context.durationRemainingSeconds <= 120 ||
      context.questionCount >= plan.topics.length * 2;
    const turnType =
      expectedState === "GREETING"
        ? "GREETING"
        : (response.responseType === "CLOSING" ||
              response.recommendedAction === "CLOSE_INTERVIEW") &&
            allowClosing
          ? "CLOSING"
          : response.responseType === "CLOSING"
            ? "QUESTION"
            : response.responseType;
    const nextState: ConversationState = turnType === "CLOSING" ? "CLOSING" : "SPEAKING";
    assertConversationTransition(expectedState, nextState);
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
        expectedState,
        nextState,
        speaker: "AI",
        type: turnType,
        text: validatedResponse.responseText,
      });
      if (!appended) return null;
      await this.repository.updateMemory(tx, conversation.interviewId, memoryUpdate);
      return appended;
    });
    if (!turn) {
      const current = await this.repository.findActiveOwned(conversation.interviewId, userId);
      const replay = current
        ? replayGeneratedResponse(current.state, current.turns.map(asTurnRecord))
        : null;
      if (replay) return replay;
      throw new ConversationError(
        "CONVERSATION_STATE_CONFLICT",
        "The conversation changed while the response was generated. Retry the request.",
      );
    }
    // A freshly generated question opens a new candidate-turn cycle: the
    // silence-nudge budget resets for that listening period.
    this.silence.resetQuestion(conversation.id);
    const result = { turn: asTurnRecord(turn), state: nextState, replayed: false };
    this.events.publish({
      name: "AIResponseGenerated",
      payload: {
        interviewId: conversation.interviewId,
        conversationId: conversation.id,
        turn: asTurnDto(turn),
      },
    });
    // Always pre-warm TTS synthesis for AI turns immediately in the background
    // so subsequent audio fetch is served from cache with near-zero latency.
    if (!isPreWarmInFlight(turn.id)) {
      this.preWarmTurnAudio(turn, conversation.interview.language, conversation.interviewId);
    }
    // One LLM request produced this turn; metering is additive and server-side.
    void this.usage.record(conversation.interviewId, { thinkRequests: 1 });
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
    // The candidate answered: no more nudges for this period.
    this.clearSilenceWatchdog(conversation.id);
    this.silence.resetQuestion(conversation.id);
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
    // Speech was detected: cancel the pending nudge, but keep watching — a
    // false start (mouth open, no words) should still re-engage eventually.
    this.clearSilenceWatchdog(conversation.id);
    this.armSilenceWatchdog(conversation.id, interviewId, userId, speechPendingNudgeDelayMs);
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
    this.clearCannedSettleTimer(turn.conversationId, turnId);
    if (turn.type === "CLOSING") {
      this.forgetSilenceState(turn.conversationId);
      const interview = await this.interviewService.requestCompletion(interviewId, userId);
      return { state: interview.status };
    }
    if (turn.conversation.interview.status !== "IN_PROGRESS")
      throw new ConversationError("CONVERSATION_NOT_ACTIVE", "The interview is no longer active.");
    if (turn.conversation.state === "LISTENING") {
      // Idempotent acknowledgement (e.g. a retried request): keep the turn-
      // taking watchdog alive so pure silence still re-engages.
      this.armWatchdogForAcknowledgedTurn(turn.type, turn.conversationId, interviewId, userId);
      return { state: "LISTENING" as const };
    }
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
    // The interviewer question has been played out: start listening for the
    // answer, and if none arrives, re-engage after a human-feeling pause.
    this.armWatchdogForAcknowledgedTurn(turn.type, turn.conversationId, interviewId, userId);
    return { state: "LISTENING" as const };
  }

  /**
   * A new question opens a fresh listening period, so its nudge budget resets;
   * a canned nudge continues the period it belongs to.
   */
  private armWatchdogForAcknowledgedTurn(
    turnType: string,
    conversationId: string,
    interviewId: string,
    userId: string,
  ) {
    if (["QUESTION", "FOLLOW_UP", "GREETING"].includes(turnType)) {
      this.silence.resetQuestion(conversationId);
      this.armSilenceWatchdog(conversationId, interviewId, userId);
      return;
    }
    if (turnType === "CLARIFICATION") {
      this.armSilenceWatchdog(conversationId, interviewId, userId);
    }
  }

  async requestCompletion(interviewId: string, userId: string) {
    const conversation = await this.repository.findOwnedConversation(interviewId, userId);
    if (conversation) this.forgetSilenceState(conversation.id);
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
    // If a pre-warm is still running for this turn, await it — but only up to
    // a deadline: the route then falls through to its own cold synthesis so a
    // stalled pre-warm cannot extend the audio fetch past its deadline.
    const inFlight = awaitPreWarm(turnId);
    if (inFlight) {
      const audio = await Promise.race([
        inFlight,
        new Promise<undefined>((resolve) => {
          const timer = setTimeout(() => {
            observability().event("conversation.audio.prewarm_await_timeout", {
              interviewId,
              turnId,
              deadlineMs: preWarmAwaitDeadlineMs,
            });
            resolve(undefined);
          }, preWarmAwaitDeadlineMs);
          timer.unref();
        }),
      ]);
      if (audio) return { turn, audio, cached: true };
    }
    const stream = await this.synthesizeTurn(
      {
        text: turn.text,
        language: turn.conversation.interview.language,
      },
      interviewId,
    );
    // Cold miss: stream the TTS audio through to the browser instead of
    // buffering the whole file first — first audio plays seconds earlier.
    const audio = teeTtsStreamToCache(turnId, stream);
    return { turn, audio, cached: false };
  }

  /**
   * Synthesizes one interviewer turn. Characters are metered only when real
   * provider work happens; a cache hit never reaches this method, so cached
   * playback costs nothing on the ledger.
   */
  synthesizeTurn(turn: { text: string; language: string }, interviewId?: string) {
    const model = ttsModelFor(turn.language);
    if (!model)
      throw new ConversationError(
        "VOICE_LANGUAGE_UNSUPPORTED",
        `Voice is not available in ${turn.language}. You can continue by typing.`,
      );
    if (interviewId) void this.usage.record(interviewId, { speakCharacters: turn.text.length });
    return synthesizeSpeech(this.environment, turn.text, model);
  }

  /**
   * Cancels the pending silence watchdog for a conversation. Called whenever
   * the candidate visibly does something: speech detection, a finalized turn,
   * or session completion.
   */
  private clearSilenceWatchdog(conversationId: string) {
    this.silence.cancel(conversationId);
  }

  /** Arms (or re-arms) the backend silence watchdog for one listening period. */
  private armSilenceWatchdog(
    conversationId: string,
    interviewId: string,
    userId: string,
    delayMs?: number,
  ) {
    this.silenceSessions.set(conversationId, { interviewId, userId });
    this.silence.arm(conversationId, delayMs);
  }

  /** The interview is over: no watchdog, no ladder position, no context. */
  private forgetSilenceState(conversationId: string) {
    this.silence.forget(conversationId);
    this.silenceSessions.delete(conversationId);
    const pending = this.cannedSettleTimers.get(conversationId);
    if (pending) clearTimeout(pending.timer);
    this.cannedSettleTimers.delete(conversationId);
  }

  private clearCannedSettleTimer(conversationId: string, turnId: string) {
    const pending = this.cannedSettleTimers.get(conversationId);
    if (!pending || pending.turnId !== turnId) return;
    clearTimeout(pending.timer);
    this.cannedSettleTimers.delete(conversationId);
  }

  /**
   * Fallback for the request-driven playback path: if a canned turn is never
   * acknowledged, settle it exactly like a real acknowledgement would. The
   * call is idempotent, so a late client ack is harmless.
   */
  private scheduleCannedSettle(
    conversationId: string,
    turnId: string,
    interviewId: string,
    userId: string,
  ) {
    this.clearCannedSettleTimer(conversationId, turnId);
    const timer = setTimeout(() => {
      this.cannedSettleTimers.delete(conversationId);
      void this.acknowledgePlayback(interviewId, turnId, userId).catch((error: unknown) => {
        observability().event("conversation.playback.settle_fallback", {
          interviewId,
          conversationId,
          turnId,
          reason: error instanceof Error ? error.message : String(error),
        });
      });
    }, cannedTurnSettleFallbackMs);
    timer.unref();
    this.cannedSettleTimers.set(conversationId, { turnId, timer });
  }

  /**
   * One ladder stage fired for a conversation that is still listening. Every
   * stage is a server decision: canned nudge, move-on, or graceful close. The
   * session is re-read first so a concurrent answer, completion or expiry can
   * never be talked over.
   */
  private async fireSilenceStage(conversationId: string, stage: SilenceStage): Promise<void> {
    const session = this.silenceSessions.get(conversationId);
    if (!session) return;
    const { interviewId, userId } = session;
    try {
      const conversation = await this.repository.findActiveOwned(interviewId, userId);
      if (!conversation || conversation.id !== conversationId || conversation.state !== "LISTENING")
        return;
      await this.completeIfExpired(conversation, userId);
      if (stage.kind === "NUDGE") {
        const turn = await this.appendCannedInterviewerTurn(
          conversation,
          {
            type: "CLARIFICATION",
            text: silenceNudgeText(conversation.interview.language, stage.strike),
          },
          userId,
        );
        if (!turn) return;
        observability().event("conversation.silence.nudge", {
          interviewId,
          conversationId,
          strike: stage.strike,
        });
        return;
      }
      if (stage.kind === "MOVE_ON") {
        await this.moveOnFromSilence(conversation, userId);
        return;
      }
      await this.closeForSilence(conversation, userId);
    } catch (cause) {
      // Expiry already completed the interview; nothing else is expected to fail
      // silently here, so everything else is observed.
      if (cause instanceof ConversationError && cause.code === "INTERVIEW_DURATION_EXPIRED") return;
      observability().error(
        "conversation.silence.stage_failed",
        { interviewId, conversationId, stage: stage.kind },
        cause instanceof Error ? cause : new Error(String(cause)),
      );
    }
  }

  /**
   * A short canned interviewer turn (nudge or closing) appended through the
   * same append-turn transaction and delivered through the existing realtime
   * event, so the client queues it for playback exactly like a generated turn.
   */
  private async appendCannedInterviewerTurn(
    conversation: NonNullable<Awaited<ReturnType<ConversationRepository["findActiveOwned"]>>>,
    turn: { type: "CLARIFICATION" | "CLOSING"; text: string },
    userId: string,
  ) {
    const nextState: ConversationState = turn.type === "CLOSING" ? "CLOSING" : "SPEAKING";
    const appended = await this.database.$transaction((tx) =>
      this.repository.appendTurn(tx, {
        conversationId: conversation.id,
        expectedSequence: conversation.sequence,
        expectedState: "LISTENING",
        nextState,
        speaker: "AI",
        type: turn.type,
        text: turn.text,
      }),
    );
    if (!appended) return null;
    this.preWarmTurnAudio(appended, conversation.interview.language, conversation.interviewId);
    this.events.publish({
      name: "AIResponseGenerated",
      payload: {
        interviewId: conversation.interviewId,
        conversationId: conversation.id,
        turn: asTurnDto(appended),
      },
    });
    // Request-driven playback may never acknowledge this turn (dead tab,
    // suspended audio context); settle it server-side so the ladder re-arms.
    this.scheduleCannedSettle(conversation.id, appended.id, conversation.interviewId, userId);
    return appended;
  }

  /**
   * The ladder's third stage: change topic instead of repeating the question
   * that went unanswered. The agent lane speaks it natively (director); the
   * legacy lane generates it through the normal turn pipeline.
   */
  private async moveOnFromSilence(
    conversation: NonNullable<Awaited<ReturnType<ConversationRepository["findActiveOwned"]>>>,
    userId: string,
  ): Promise<void> {
    const director = sessionDirectorFor(conversation.id);
    if (director) {
      try {
        const owned = await director.requestMoveOn({
          interviewId: conversation.interviewId,
          conversationId: conversation.id,
          reason: "SILENCE",
        });
        if (owned) {
          observability().event("conversation.silence.move_on", {
            interviewId: conversation.interviewId,
            conversationId: conversation.id,
            lane: "agent",
          });
          return;
        }
      } catch (cause) {
        observability().error(
          "conversation.silence.move_on_failed",
          { interviewId: conversation.interviewId, conversationId: conversation.id, lane: "agent" },
          cause instanceof Error ? cause : new Error(String(cause)),
        );
      }
    }
    try {
      await this.generateInterviewerTurn(conversation, userId, {
        expectedState: "LISTENING",
        silenceEscalation: true,
      });
      observability().event("conversation.silence.move_on", {
        interviewId: conversation.interviewId,
        conversationId: conversation.id,
        lane: "legacy",
      });
    } catch (cause) {
      observability().error(
        "conversation.silence.move_on_failed",
        { interviewId: conversation.interviewId, conversationId: conversation.id, lane: "legacy" },
        cause instanceof Error ? cause : new Error(String(cause)),
      );
      // A move-on that cannot be produced must not become dead air.
      await this.closeForSilence(conversation, userId);
    }
  }

  /**
   * The move-on budget is spent: end the interview honestly with a fixed
   * closing line. Playback acknowledgement runs the normal completion path, so
   * an abandoned candidate still gets the report their answers earned.
   */
  private async closeForSilence(
    conversation: NonNullable<Awaited<ReturnType<ConversationRepository["findActiveOwned"]>>>,
    userId: string,
  ): Promise<void> {
    const director = sessionDirectorFor(conversation.id);
    if (director) {
      try {
        const owned = await director.requestClosing({
          interviewId: conversation.interviewId,
          conversationId: conversation.id,
          reason: "SILENCE",
        });
        if (owned) {
          observability().event("conversation.silence.closed", {
            interviewId: conversation.interviewId,
            conversationId: conversation.id,
            lane: "agent",
          });
          return;
        }
      } catch (cause) {
        observability().error(
          "conversation.silence.close_failed",
          { interviewId: conversation.interviewId, conversationId: conversation.id },
          cause instanceof Error ? cause : new Error(String(cause)),
        );
      }
    }
    const turn = await this.appendCannedInterviewerTurn(
      conversation,
      {
        type: "CLOSING",
        text: silenceClosingText(conversation.interview.language),
      },
      userId,
    );
    if (!turn) return;
    observability().event("conversation.silence.closed", {
      interviewId: conversation.interviewId,
      conversationId: conversation.id,
      lane: "legacy",
    });
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
    const ticket = await this.ticketService.createTicket(interviewId, userId);
    // Agent sessions carry no browser-facing provider token: the gateway talks
    // to Deepgram with the server key on the voice-stream websocket.
    const pipeline = this.environment.VOICE_PIPELINE;
    const directToken =
      pipeline === "legacy" ? await tryGrantDeepgramAccessToken(this.environment) : null;
    return {
      pipeline,
      accessToken: directToken ?? undefined,
      streamTicket: ticket,
      streamPath: `/api/v1/interviews/${interviewId}/conversation/voice-stream?ticket=${ticket}`,
      language: interview.language,
      expiresInSeconds: 60,
    };
  }

  async createLiveKitToken(interviewId: string, userId: string) {
    const interview = await this.repository.findOwnedInterview(interviewId, userId);
    if (!interview) {
      throw new ConversationError("INTERVIEW_NOT_FOUND", "Interview not found.");
    }
    if (!["READY", "IN_PROGRESS"].includes(interview.status)) {
      throw new ConversationError(
        "INVALID_STATE_TRANSITION",
        `Cannot issue LiveKit token for interview in state ${interview.status}.`,
      );
    }
    const apiKey = this.environment.LIVEKIT_API_KEY ?? "devkey";
    const apiSecret = this.environment.LIVEKIT_API_SECRET ?? "secret";
    const roomName = `interview-${interviewId}`;
    const participantIdentity = `user-${userId}`;

    const token = new AccessToken(apiKey, apiSecret, {
      identity: participantIdentity,
      ttl: "3600s",
    });
    token.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });
    token.roomConfig = new RoomConfiguration({
      agents: [
        new RoomAgentDispatch({
          agentName: "interviewer-ai-voice-agent",
          metadata: JSON.stringify({ interviewId, userId }),
        }),
      ],
    });
    const jwt = await token.toJwt();

    // Supplementary explicit room dispatch (non-blocking so token generation responds in ~5ms)
    try {
      const httpUrl = (this.environment.LIVEKIT_URL ?? "http://localhost:7880")
        .replace(/^ws:\/\//, "http://")
        .replace(/^wss:\/\//, "https://");
      const dispatchClient = new AgentDispatchClient(httpUrl, apiKey, apiSecret);
      void dispatchClient
        .createDispatch(roomName, "interviewer-ai-voice-agent", {
          metadata: JSON.stringify({ interviewId, userId }),
        })
        .catch(() => {
          // Best-effort: token.roomConfig dispatches natively upon room connection
        });
    } catch {
      // Best-effort
    }

    return {
      token: jwt,
      url: this.environment.LIVEKIT_URL,
      roomName,
      participantIdentity,
    };
  }

  async syncInternalTurn(interviewId: string, payload: InternalTurnSyncInput) {
    const conversation = await this.database.conversation.findUnique({
      where: { interviewId },
      include: {
        interview: {
          include: {
            plan: true,
            memory: true,
          },
        },
      },
    });
    if (!conversation) {
      throw new ConversationError("INTERVIEW_NOT_FOUND", "Interview not found.");
    }
    if (!["READY", "IN_PROGRESS"].includes(conversation.interview.status)) {
      throw new ConversationError(
        "INVALID_STATE_TRANSITION",
        `Cannot sync turns for interview in state ${conversation.interview.status}.`,
      );
    }

    let nextState: ConversationState;
    if (payload.speaker === "USER") {
      nextState = "THINKING";
    } else if (payload.speaker === "AI") {
      nextState = payload.type === "CLOSING" ? "CLOSING" : "LISTENING";
    } else {
      nextState = conversation.state;
    }

    const turn = await this.database.$transaction(async (tx) => {
      const appended = await this.repository.appendTurn(tx, {
        conversationId: conversation.id,
        expectedSequence: conversation.sequence,
        nextState,
        speaker: payload.speaker,
        type: payload.type,
        text: payload.text,
        startedAt: payload.startedAt ? new Date(payload.startedAt) : null,
        endedAt: payload.endedAt ? new Date(payload.endedAt) : null,
        durationMs: payload.durationMs ?? null,
        words: payload.words ? (payload.words as Prisma.InputJsonValue) : null,
      });
      if (!appended) {
        throw new ConversationError(
          "CONFLICT",
          "Failed to append turn due to concurrent sequence update.",
        );
      }

      if (payload.speaker === "AI") {
        const plan = conversation.interview.plan;
        const memory = conversation.interview.memory;
        const planTopics = plan && Array.isArray(plan.topics) ? (plan.topics as string[]) : [];
        const planObjectives =
          plan && Array.isArray(plan.objectives) ? (plan.objectives as string[]) : [];
        const memorySnapshot = coerceAgentMemory(memory, { objectives: planObjectives });
        const { memory: updatedMemory } = resolveAgentTurnPlan({
          memory: memorySnapshot,
          planTopics,
          text: payload.text,
          isGreeting: payload.type === "GREETING",
        });
        if (updatedMemory) {
          await this.repository.updateMemory(tx, interviewId, updatedMemory);
        }
      }

      return appended;
    });

    const turnDto = asTurnDto(turn);
    if (payload.speaker === "USER") {
      this.events.publish({
        name: "TranscriptFinalized",
        payload: {
          interviewId,
          conversationId: conversation.id,
          turn: turnDto,
        },
      });
    } else if (payload.speaker === "AI") {
      this.events.publish({
        name: "AIResponseGenerated",
        payload: {
          interviewId,
          conversationId: conversation.id,
          turn: turnDto,
        },
      });
    }

    return turnDto;
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
  private preWarmTurnAudio(
    turn: { id: string; text: string },
    language: string,
    interviewId?: string,
  ) {
    const promise = (async (): Promise<Buffer | null> => {
      try {
        if (getCachedAudio(turn.id)) return null;
        const model = ttsModelFor(language);
        if (!model) return null;
        if (interviewId) void this.usage.record(interviewId, { speakCharacters: turn.text.length });
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
    // The duration cap wins over the ladder: no further nudges, move-ons or
    // watchdogs once the interview clock has run out.
    this.forgetSilenceState(conversation.id);
    await this.interviewService.requestCompletion(conversation.interviewId, userId);
    throw new ConversationError(
      "INTERVIEW_DURATION_EXPIRED",
      "The configured interview duration has ended.",
    );
  }
}

/**
 * Streams the TTS provider audio to the client while collecting the full
 * buffer so the normal cache is populated when the stream ends. The browser
 * starts hearing audio at the first WAV chunk instead of after full synthesis.
 */
function teeTtsStreamToCache(turnId: string, providerStream: AsyncIterable<Uint8Array>): Readable {
  const chunks: Buffer[] = [];
  const tee = new PassThrough();
  Readable.from(providerStream)
    .on("data", (chunk: Buffer | Uint8Array) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      chunks.push(buffer);
      tee.push(buffer);
    })
    .on("end", () => {
      if (chunks.length > 0) setCachedAudio(turnId, Buffer.concat(chunks));
      tee.push(null);
    })
    .on("error", (cause: unknown) => {
      tee.destroy(
        new Error(`TTS stream failed: ${cause instanceof Error ? cause.message : String(cause)}`),
      );
    });
  return tee;
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
  startedAt?: Date | null;
  endedAt?: Date | null;
  durationMs?: number | null;
  words?: unknown;
  createdAt: Date;
}): ConversationTurnRecord {
  return {
    ...turn,
    type: turn.type as ConversationTurnRecord["type"],
    startedAt: turn.startedAt ?? undefined,
    endedAt: turn.endedAt ?? undefined,
    durationMs: turn.durationMs ?? undefined,
    words: turn.words ?? undefined,
  };
}

function asTurnDto(turn: {
  id: string;
  sequence: number;
  speaker: "USER" | "AI" | "SYSTEM";
  type: string;
  text: string;
  startedAt?: Date | null;
  endedAt?: Date | null;
  durationMs?: number | null;
  words?: unknown;
  createdAt: Date;
}): ConversationTurn {
  const base = asTurnRecord(turn);
  const dto: ConversationTurn = {
    id: base.id,
    sequence: base.sequence,
    speaker: base.speaker,
    type: base.type,
    text: base.text,
    createdAt: turn.createdAt.toISOString(),
  };

  if (turn.startedAt) dto.startedAt = turn.startedAt.toISOString();
  if (turn.endedAt) dto.endedAt = turn.endedAt.toISOString();
  if (turn.durationMs != null) dto.durationMs = turn.durationMs;
  if (turn.words != null) dto.words = turn.words as WordTimingEntry[];

  return dto;
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
