import { PassThrough, Readable } from "node:stream";

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
  isSupportedVoiceLanguage,
  synthesizeSpeech,
  tryGrantDeepgramAccessToken,
  ttsModelFor,
} from "./deepgram.js";
import { VoiceTicketService } from "./tickets.js";
import { ConversationRepository } from "./repository.js";
import { recoveryForAiResponseFailure, replayGeneratedResponse } from "./recovery.js";
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
/** Idle time in LISTENING before the interviewer re-engages, like a human interviewer would. */
const silenceNudgeDelayMs = 9_000;
/** Speech was detected but not finalized; allow longer before treating it as silence. */
const speechPendingNudgeDelayMs = 20_000;
/** A question gets at most two canned nudges; exhausted nudges stop so the session can never loop. */
const maxSilenceNudgesPerTurn = 2;

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
  /** Backend-owned turn taking: one cancellable silence watchdog per conversation. */
  private readonly silenceWatchdogs = new Map<string, NodeJS.Timeout>();
  /** Canned nudges delivered since the last fresh question, per conversation. */
  private readonly silenceStrikes = new Map<string, number>();

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

    const plan = toPlan(conversation.interview.plan);
    const context = buildSessionContext(conversation, plan);
    const actor = { userId };
    // The greeting needs none of the candidate-context retrievals: it is spoken
    // before any answer exists, and skipping five DB lookups shaves real
    // milliseconds off the first word.
    const isGreetingTurn = conversation.state === "GREETING";
    const [resume, job, memory, selectedTopic, priorWeakAreas] = isGreetingTurn
      ? [null, null, null, null, [] as string[]]
      : await Promise.all([
          this.interviewTools.retrieveResumeAnalysis(actor, { interviewId }),
          this.interviewTools.retrieveJobAnalysis(actor, { interviewId }),
          this.interviewTools.retrieveMemory(actor, { interviewId }),
          this.interviewTools.identifyNextPlannedTopic(actor, { interviewId }),
          this.interviewTools.retrievePriorWeakAreas(actor, { interviewId }),
        ]);
    const shouldClose = hasReachedPlanObjectives(plan, context);
    const latestUserAnswer =
      [...conversation.turns].reverse().find((turn) => turn.speaker === "USER")?.text ?? null;
    const response = await observability().time(
      "conversation.turn.generation",
      { interviewId, state: conversation.state },
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
      conversation.state === "GREETING"
        ? "GREETING"
        : (response.responseType === "CLOSING" ||
              response.recommendedAction === "CLOSE_INTERVIEW") &&
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
    // A freshly generated question opens a new candidate-turn cycle: the
    // silence-nudge budget resets for that listening period.
    this.silenceStrikes.delete(conversation.id);
    const result = { turn: asTurnRecord(turn), state: nextState, replayed: false };
    this.events.publish({
      name: "AIResponseGenerated",
      payload: { interviewId, conversationId: conversation.id, turn: asTurnDto(turn) },
    });
    // Always pre-warm TTS synthesis for AI turns immediately in the background
    // so subsequent audio fetch is served from cache with near-zero latency.
    if (!isPreWarmInFlight(turn.id)) {
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
    // The candidate answered: no more nudges for this period.
    this.clearSilenceWatchdog(conversation.id);
    this.silenceStrikes.delete(conversation.id);
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
    if (turn.type === "CLOSING") {
      this.clearSilenceWatchdog(turn.conversationId);
      this.silenceStrikes.delete(turn.conversationId);
      const interview = await this.interviewService.requestCompletion(interviewId, userId);
      return { state: interview.status };
    }
    if (turn.conversation.interview.status !== "IN_PROGRESS")
      throw new ConversationError("CONVERSATION_NOT_ACTIVE", "The interview is no longer active.");
    if (turn.conversation.state === "LISTENING") {
      // Idempotent acknowledgement (e.g. a retried request): keep the turn-
      // taking watchdog alive so pure silence still re-engages.
      if (["QUESTION", "FOLLOW_UP", "CLARIFICATION", "GREETING"].includes(turn.type)) {
        this.armSilenceWatchdog(turn.conversationId, interviewId, userId);
      }
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
    if (["QUESTION", "FOLLOW_UP", "CLARIFICATION", "GREETING"].includes(turn.type)) {
      this.armSilenceWatchdog(turn.conversationId, interviewId, userId);
    }
    return { state: "LISTENING" as const };
  }

  async requestCompletion(interviewId: string, userId: string) {
    const conversation = await this.repository.findOwnedConversation(interviewId, userId);
    if (conversation) {
      this.clearSilenceWatchdog(conversation.id);
      this.silenceStrikes.delete(conversation.id);
    }
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
    // Cold miss: stream the TTS audio through to the browser instead of
    // buffering the whole file first — first audio plays seconds earlier.
    const audio = teeTtsStreamToCache(turnId, stream);
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

  /**
   * Cancels the pending silence watchdog for a conversation. Called whenever
   * the candidate visibly does something: speech detection, a finalized turn,
   * or session completion.
   */
  private clearSilenceWatchdog(conversationId: string) {
    const timer = this.silenceWatchdogs.get(conversationId);
    if (timer) {
      clearTimeout(timer);
      this.silenceWatchdogs.delete(conversationId);
    }
  }

  /** Arms (or re-arms) the backend silence watchdog for one listening period. */
  private armSilenceWatchdog(
    conversationId: string,
    interviewId: string,
    userId: string,
    delayMs = silenceNudgeDelayMs,
  ) {
    this.clearSilenceWatchdog(conversationId);
    const timer = setTimeout(() => {
      this.silenceWatchdogs.delete(conversationId);
      void this.fireSilenceNudge(conversationId, interviewId, userId);
    }, delayMs);
    // A pending nudge must never keep the process alive on shutdown.
    timer.unref();
    this.silenceWatchdogs.set(conversationId, timer);
  }

  /**
   * The candidate has stayed silent after a question: append a short canned
   * re-engagement turn (never a fabricated answer) and deliver it through the
   * existing realtime event so the client queues it for playback. This keeps
   * the conversation feeling live, exactly like a human interviewer does.
   */
  private async fireSilenceNudge(
    conversationId: string,
    interviewId: string,
    userId: string,
  ): Promise<void> {
    try {
      const conversation = await this.repository.findActiveOwned(interviewId, userId);
      if (!conversation || conversation.id !== conversationId || conversation.state !== "LISTENING")
        return;
      await this.completeIfExpired(conversation, userId);
      const strikes = (this.silenceStrikes.get(conversationId) ?? 0) + 1;
      if (strikes > maxSilenceNudgesPerTurn) {
        this.silenceStrikes.delete(conversationId);
        observability().event("conversation.silence.nudges_exhausted", {
          interviewId,
          conversationId,
        });
        return;
      }
      const turn = await this.database.$transaction((tx) =>
        this.repository.appendTurn(tx, {
          conversationId: conversation.id,
          expectedSequence: conversation.sequence,
          expectedState: "LISTENING",
          nextState: "SPEAKING",
          speaker: "AI",
          type: "CLARIFICATION",
          text: silenceNudgeText(conversation.interview.language, strikes),
        }),
      );
      if (!turn) return;
      this.silenceStrikes.set(conversationId, strikes);
      this.preWarmTurnAudio({ id: turn.id, text: turn.text }, conversation.interview.language);
      this.events.publish({
        name: "AIResponseGenerated",
        payload: { interviewId, conversationId: conversation.id, turn: asTurnDto(turn) },
      });
      observability().event("conversation.silence.nudge", {
        interviewId,
        conversationId,
        strike: strikes,
      });
    } catch (cause) {
      observability().error(
        "conversation.silence.nudge_failed",
        { interviewId },
        cause instanceof Error ? cause : new Error(String(cause)),
      );
    }
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
    const directToken = await tryGrantDeepgramAccessToken(this.environment);
    return {
      accessToken: directToken ?? undefined,
      streamTicket: ticket,
      streamPath: `/api/v1/interviews/${interviewId}/conversation/voice-stream?ticket=${ticket}`,
      language: interview.language,
      expiresInSeconds: 60,
    };
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

/**
 * Streams the TTS provider audio to the client while collecting the full
 * buffer so the normal cache is populated when the stream ends. The browser
 * starts hearing audio at the first WAV chunk instead of after full synthesis.
 */
function teeTtsStreamToCache(
  turnId: string,
  providerStream: AsyncIterable<Uint8Array>,
): Readable {
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
      tee.destroy(new Error(`TTS stream failed: ${cause instanceof Error ? cause.message : String(cause)}`));
    });
  return tee;
}

/**
 * Canned interviewer re-engagement lines: real interviewers nudge a silent
 * candidate instead of waiting in dead air. Fixed templates keep the nudge
 * instant (no LLM call) and predictable. Strike 1 invites; strike 2 offers a
 * way out of the question.
 */
function silenceNudgeText(language: string, strike: number): string {
  const first = "Take your time — I'm here whenever you're ready.";
  const second = "No rush at all. Would you like to pause here, or shall we move to the next question?";
  const byLanguage: Record<string, { 1: string; 2: string }> = {
    en: { 1: first, 2: second },
    es: {
      1: "Tómese su tiempo — estoy aquí cuando quiera continuar.",
      2: "Sin prisa. ¿Quiere hacer una pausa aquí o pasamos a la siguiente pregunta?",
    },
    de: {
      1: "Lassen Sie sich Zeit — ich bin hier, sobald Sie bereit sind.",
      2: "Kein Stress. Möchten Sie hier pausieren oder zur nächsten Frage übergehen?",
    },
    fr: {
      1: "Prenez votre temps — je suis là quand vous êtes prêt.",
      2: "Aucune hâte. Souhaitez-vous marquer une pause ou passer à la question suivante ?",
    },
    nl: {
      1: "Neem uw tijd — ik ben er zodra u er klaar voor bent.",
      2: "Geen haast. Wilt u hier pauzeren of naar de volgende vraag gaan?",
    },
  };
  const texts = byLanguage[language] ?? { 1: first, 2: second };
  return strike === 1 ? texts[1] : texts[2];
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
