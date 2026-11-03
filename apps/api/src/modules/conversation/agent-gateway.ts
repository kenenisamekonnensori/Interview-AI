import { randomUUID } from "node:crypto";

import type { WebSocket as FastifySocket } from "ws";
import type { ServerEnvironment } from "@interviewer-ai/config";
import type { ConversationTurn } from "@interviewer-ai/types";
import { buildAgentGreeting, buildAgentInterviewInstruction } from "@interviewer-ai/prompts";
import { interviewPlanSchema } from "@interviewer-ai/types";

import type { PrismaClient } from "../../../prisma/generated/client.js";
import { observability } from "../../services/observability.js";
import { InterviewUsageService } from "../../services/interview-usage.service.js";
import {
  agentAnswerAssessmentSchema,
  applyAgentAnswerAssessment,
  buildAgentMemoryDigest,
  coerceAgentMemory,
  deriveTopicReference,
  recordAgentSilenceStruggle,
  resolveAgentTurnPlan,
} from "./agent-memory.js";
import {
  buildAgentClosingDirective,
  buildAgentMoveOnDirective,
  isInjectedUserEcho,
  resolveAgentResumeDirective,
} from "./agent-directives.js";
import {
  agentDegradedNotice,
  isThinkProviderWarning,
  shouldDegradeAgentSession,
} from "./agent-recovery.js";
import { registerSessionDirector } from "./session-director.js";
import {
  connectAgentTransport,
  resolveThinkModels,
  type AgentTransport,
} from "./agent-transport.js";
import { createAiProvider } from "../ai/index.js";
import type { ConversationEventPublisher } from "./events.js";
import { ConversationRepository } from "./repository.js";
import { ConversationError, ConversationService } from "./service.js";
import type {
  VoiceConcurrencyLease,
  VoiceConcurrencyLimiter,
} from "../../services/voice-concurrency.js";
import { isVoiceConcurrencyLease } from "../../services/voice-concurrency.js";
import type {
  VoiceSessionOwner,
  VoiceSessionRegistry,
} from "../../services/voice-session-registry.js";

const keepAliveIntervalMs = 5_000;
/**
 * The greeting SLO is 1.5 s; this is the point at which the session is treated
 * as broken instead. It has to absorb a BYO think model's first token plus the
 * speech stage — killing the socket too eagerly is indistinguishable to the
 * candidate from the interview never starting.
 */
const greetingDeadlineMs = 15_000;
/** A newer tab owns this interview: reconnecting would fight it forever. */
export const voiceSessionSupersededCloseCode = 4001;
/** The deployment is at its live voice session ceiling. */
export const voiceSessionCapacityCloseCode = 1013;
/** A fast answer can arrive before the previous AI turn settles; retry briefly. */
const userFlushRetryAttempts = 6;
const userFlushRetryDelayMs = 400;
/** setTimeout's maximum delay; interview caps are far below it but be explicit. */
const maximumTimerDelayMs = 2_147_483_647;

type GatewayDeps = {
  log: {
    error: (payload: unknown, message: string) => void;
    warn: (payload: unknown, message: string) => void;
  };
  environment: ServerEnvironment;
  database: PrismaClient;
  service: ConversationService;
  events: ConversationEventPublisher;
  socket: FastifySocket;
  interviewId: string;
  userId: string;
  /** Multi-instance ownership: exactly one live gateway per interview. */
  sessions: VoiceSessionRegistry;
  /** Deployment-wide live session ceiling (Deepgram plan limits). */
  concurrency: VoiceConcurrencyLimiter;
};

/** Server-owned websocket session manager selected by VOICE_PIPELINE=agent. */
class AgentVoiceGateway {
  private readonly repository: ConversationRepository;
  private readonly usage: InterviewUsageService;
  private conversationId = "";
  private transport: AgentTransport | null = null;
  private keepAliveTimer: NodeJS.Timeout | null = null;
  private pendingUserText = "";
  private pendingAgentText = "";
  private closed = false;
  private language = "en";
  private memorySnapshot: ReturnType<typeof coerceAgentMemory> | null = null;
  private planTopics: string[] = [];
  private planObjectives: string[] = [];
  private baseInstruction = "";
  private interviewType = "INTERVIEW";
  private difficulty = "MEDIUM";
  private targetRole: string | null = null;
  private generalIntake = false;
  private resumeSummary: string | null = null;
  private resumeSkills: string[] = [];
  private jobRequiredSkills: string[] = [];
  private thinkHeaders: Record<string, string> = {};
  private thinkUpdatePending = false;
  private latestMemoryDigest = "";
  private lastPersistedUserSequence = 0;
  private contextRefreshDirty = false;
  private latestUserAnswer = "";
  private latestAgentQuestion = "";
  private readonly aiProvider;
  /** When the metered portion of this provider session began (SettingsApplied). */
  private usageStartedAt: number | null = null;
  /** Ordered think chain: primary model first, then the configured fallbacks. */
  private readonly thinkModels: string[];
  /** Set once the provider session is unrecoverable and the client is on text. */
  private degraded = false;
  private assessmentPromise: Promise<void> = Promise.resolve();
  private speechStartPromise: Promise<unknown> = Promise.resolve();
  private userFlushPromise: Promise<void> = Promise.resolve();
  private unregisterDirector: (() => void) | null = null;
  /**
   * Text of the last server control message injected as user speech (greeting,
   * move-on, duration closing). The provider echoes injected text back as a
   * user statement; that echo must never become a candidate turn.
   */
  private pendingInjectionText: string | null = null;
  private durationTimer: NodeJS.Timeout | null = null;
  /** Greeting lag guard: the first words must arrive well before the SLO is missed. */
  private greetingTimer: NodeJS.Timeout | null = null;
  private agentSpoke = false;
  private sessionId = "";
  private owner: VoiceSessionOwner | null = null;
  private capacity: VoiceConcurrencyLease | null = null;

  constructor(private readonly deps: GatewayDeps) {
    this.repository = new ConversationRepository(deps.database);
    this.aiProvider = createAiProvider(deps.environment);
    this.usage = new InterviewUsageService(deps.database);
    this.thinkModels = resolveThinkModels({
      geminiModel: deps.environment.GEMINI_MODEL,
      geminiFallbackModels: deps.environment.GEMINI_FALLBACK_MODELS,
    });
  }

  async run() {
    const { interviewId, userId, socket, environment } = this.deps;
    const conversation = await this.repository.findActiveOwned(interviewId, userId);
    if (!conversation || !conversation.interview.plan) {
      socket.close(1008, "An active planned conversation is required.");
      return;
    }
    this.conversationId = conversation.id;
    this.sessionId = randomUUID();

    // Phase 4: one live session per interview across every instance. The
    // newest connection wins; the previous owner is told to close so the
    // interview never has two voices or two silence timelines.
    this.owner = await this.deps.sessions.claim(interviewId, this.sessionId);
    this.owner.onSuperseded(() => {
      observability().event("voice.gateway.superseded", {
        interviewId,
        sessionId: this.sessionId,
      });
      this.sendJson({
        type: "superseded",
        message: "This interview was opened in another session.",
      });
      this.teardown(
        "This interview was opened in another session.",
        voiceSessionSupersededCloseCode,
      );
    });

    // Capacity is checked before any provider work: a rejected session must
    // not open a Deepgram socket it will immediately abandon.
    const capacity = await this.deps.concurrency.acquire();
    if (!isVoiceConcurrencyLease(capacity)) {
      observability().event("voice.gateway.capacity_rejected", {
        interviewId,
        active: capacity.active,
        limit: capacity.limit,
      });
      this.sendJson({
        type: "capacity",
        message:
          "The voice interviewer is at capacity right now. You can continue this interview by typing.",
        active: capacity.active,
        limit: capacity.limit,
      });
      this.teardown(
        "The voice interviewer is at capacity right now.",
        voiceSessionCapacityCloseCode,
      );
      return;
    }
    this.capacity = capacity;

    // The silence ladder runs in the conversation service; this live session
    // owns "make the interviewer speak next" for the agent lane.
    this.unregisterDirector = registerSessionDirector(conversation.id, {
      requestMoveOn: () => this.requestMoveOn(),
      requestClosing: (request) => this.requestClosing(request.reason),
    });
    this.language = conversation.interview.language;
    this.interviewType = conversation.interview.interviewType;
    this.difficulty = conversation.interview.difficulty;
    this.targetRole = conversation.interview.targetRole;
    const plan = interviewPlanSchema.parse(conversation.interview.plan);
    this.generalIntake =
      !conversation.interview.targetRole ||
      conversation.interview.targetRole.toLowerCase().includes("general interview");
    this.planTopics = plan.topics.map((topic) => topic.topic);
    this.planObjectives = plan.objectives;
    this.memorySnapshot = coerceAgentMemory(conversation.interview.memory, plan);
    this.latestAgentQuestion =
      conversation.turns.find(
        (turn) =>
          turn.speaker === "AI" && ["QUESTION", "FOLLOW_UP", "CLARIFICATION"].includes(turn.type),
      )?.text ?? "";

    // The plan, analyzed resume/job details and recent turns are fetched once
    // at connect time. Subsequent answer assessments remain outside the live
    // response path; only the compact persisted memory digest is refreshed.
    const [resume, job] = await Promise.all([
      this.deps.database.interview.findFirst({
        where: { id: interviewId, userId },
        include: { resume: { include: { analysis: true } } },
      }),
      this.deps.database.interview.findFirst({
        where: { id: interviewId, userId },
        include: { jobDescription: { include: { analysis: true } } },
      }),
    ]);
    const resumeAnalysis = resume?.resume?.deletedAt ? null : resume?.resume?.analysis;
    const jobAnalysis = job?.jobDescription?.deletedAt ? null : job?.jobDescription?.analysis;
    this.resumeSummary = resumeAnalysis?.summary ?? null;
    this.resumeSkills = jsonStringList(resumeAnalysis?.skills, 20);
    this.jobRequiredSkills = jsonStringList(jobAnalysis?.requiredSkills, 20);
    if (environment.GEMINI_API_KEY)
      this.thinkHeaders = { "x-goog-api-key": environment.GEMINI_API_KEY };
    const history = [...conversation.turns]
      .reverse()
      .filter((turn) => turn.speaker === "USER" || turn.speaker === "AI")
      .map((turn) => ({
        role: turn.speaker === "USER" ? ("user" as const) : ("assistant" as const),
        content: turn.text,
      }));

    this.baseInstruction = buildAgentInterviewInstruction({
      interviewType: conversation.interview.interviewType,
      difficulty: conversation.interview.difficulty,
      targetRole: conversation.interview.targetRole,
      language: this.language,
      isGeneralIntake: this.generalIntake,
      topics: this.planTopics,
      objectives: plan.objectives,
      resumeSummary: this.resumeSummary,
      resumeSkills: this.resumeSkills,
      jobRequiredSkills: this.jobRequiredSkills,
      memoryDigest: buildAgentMemoryDigest(this.memorySnapshot),
    });
    // A fresh session is greeted BY THE PROVIDER, verbatim, before any LLM
    // turn: `agent.greeting` is spoken immediately after SettingsApplied and
    // starts the interview even when the think model is slow or unavailable.
    // A reconnect already has history in context and must not be greeted again.
    const resumeDirective = resolveAgentResumeDirective({ turns: conversation.turns });
    const greeting = resumeDirective
      ? null
      : buildAgentGreeting({
          interviewType: conversation.interview.interviewType,
          difficulty: conversation.interview.difficulty,
          targetRole: conversation.interview.targetRole,
          language: this.language,
          isGeneralIntake: this.generalIntake,
          topics: this.planTopics,
          objectives: this.planObjectives,
        });

    // A browser that disappears must not leave a provider session (and the
    // ladder's director) behind until the provider's own timeout.
    this.deps.socket.once("close", () => this.teardown("The browser closed the session."));

    observability().event("voice.gateway.session_started", {
      interviewId,
      userId,
      language: this.language,
      historyTurnCount: history.length,
    });

    try {
      this.transport = await connectAgentTransport(
        environment,
        {
          language: this.language,
          geminiModel: this.thinkModels[0] ?? environment.GEMINI_MODEL,
          geminiFallbackModels: this.thinkModels.slice(1),
          instruction: this.baseInstruction,
          history,
          greeting,
          resumeSummary: this.resumeSummary,
          resumeSkills: this.resumeSkills,
          jobRequiredSkills: this.jobRequiredSkills,
          thinkHeaders: this.thinkHeaders,
        },
        {
          onReady: () => {
            this.usageStartedAt = Date.now();
            this.sendJson({ type: "agent-ready", interviewId });
            // A fresh session is already speaking the provider-side greeting;
            // injecting anything else would talk over it. A reconnect gets a
            // resume directive so the candidate is never left in dead air
            // waiting to speak first.
            if (greeting) {
              observability().event("voice.gateway.greeting_scheduled", {
                interviewId,
                persistedTurnCount: conversation.turns.length,
              });
            } else if (resumeDirective) {
              this.injectControlMessage(resumeDirective);
              observability().event("voice.gateway.resume_injected", {
                interviewId,
                persistedTurnCount: conversation.turns.length,
              });
            }
            this.armGreetingDeadline();
            if (this.memorySnapshot) void this.refreshThinkContext(true);
            this.armDurationDeadline(conversation.interview);
            this.keepAliveTimer = setInterval(() => {
              try {
                this.transport?.sendKeepAlive();
              } catch (error) {
                this.deps.log.warn({ error }, "Agent keep-alive send failed");
              }
              // Flush metered voice time once a minute so a crashed process
              // loses at most a minute of billable session, never the whole call.
              if (this.usageStartedAt !== null && Date.now() - this.usageStartedAt >= 60_000) {
                this.flushVoiceUsage();
              }
            }, keepAliveIntervalMs);
          },
          onUserStartedSpeaking: () => {
            // The provider reports injected control text (greeting directives,
            // move-on, closing) as "user started speaking". That is not the
            // candidate: forwarding it would make the browser stop its own
            // interviewer audio and would re-arm the wrong silence state.
            if (this.pendingInjectionText) return;
            this.sendJson({ type: "user-speech-started" });
            this.speechStartPromise = this.deps.service
              .notifyUserSpeechStarted(interviewId, userId)
              .then(() => undefined)
              .catch((error) => {
                this.deps.log.warn({ error }, "Agent pipeline: user speech state update failed");
              });
          },
          onAgentStartedSpeaking: () => {
            this.markAgentSpoke();
            this.sendJson({ type: "agent-speaking-started" });
          },
          onInjectionRefused: (reason) => {
            observability().event("voice.gateway.injection_refused", {
              interviewId,
              reason,
            });
            this.pendingInjectionText = null;
          },
          onUserStatement: (text) => {
            if (this.consumeInjectedEcho(text)) return;
            this.pendingUserText = joinStatements(this.pendingUserText, text);
          },
          onAgentThinking: () => {
            this.sendJson({ type: "agent-thinking" });
            this.userFlushPromise = this.flushUserStatement();
          },
          onAgentStatement: (text) => {
            this.markAgentSpoke();
            // The text lands before the speech audio; this is the earliest
            // reliable "the interviewer is talking now" signal (the provider
            // does not always emit AgentStartedSpeaking).
            this.sendJson({ type: "agent-speaking-started" });
            // The agent has spoken: any injection echo that has not arrived by
            // now is never coming, and later user text is real candidate speech.
            this.pendingInjectionText = null;
            this.pendingAgentText = joinStatements(this.pendingAgentText, text);
          },
          onAgentAudio: (chunk) => {
            this.markAgentSpoke();
            if (socket.readyState === 1) socket.send(chunk, { binary: true });
          },
          onAgentAudioDone: () => {
            void this.finalizeAgentTurn();
          },
          onThinkUpdated: () => {
            this.thinkUpdatePending = false;
            if (this.contextRefreshDirty) void this.refreshThinkContext();
          },
          onWarning: (summary, code) => {
            this.deps.log.warn({ summary, code }, "Agent pipeline warning");
            // A think-stage warning means Deepgram moved to the next model in
            // the fallback chain; the live turn continues without recovery.
            if (isThinkProviderWarning(code)) {
              observability().event("voice.gateway.think_warning", {
                interviewId,
                code,
                fallbackModels: Math.max(0, this.thinkModels.length - 1),
              });
            }
            this.sendJson({
              type: "warning",
              message: summary,
              ...(code ? { code } : {}),
            });
          },
          onError: (summary, code) => {
            this.deps.log.error({ summary, code }, "Agent pipeline error");
            if (shouldDegradeAgentSession(code)) {
              this.degrade(summary, code);
              return;
            }
            this.teardown(summary);
          },
          onClose: (code, reason) => {
            observability().event("voice.gateway.provider_closed", {
              interviewId,
              code,
              ...(reason ? { reason } : {}),
            });
            this.teardown(reason || "The voice provider closed the session.");
          },
        },
      );
    } catch (error) {
      const summary = error instanceof Error ? error.message : "Agent connection failed.";
      this.deps.log.error({ error }, "Failed to connect agent voice transport");
      socket.close(1013, summary);
    }
  }

  /** True once capacity, a takeover or a provider failure ended the session. */
  isClosed() {
    return this.closed;
  }

  sendClientAudio(chunk: Buffer) {
    try {
      this.transport?.sendAudio(chunk);
    } catch (error) {
      this.deps.log.warn({ error }, "Failed to forward mic audio to the agent");
    }
  }

  private async flushUserStatement() {
    const text = this.pendingUserText.trim();
    if (!text) return;
    await this.speechStartPromise;
    this.pendingUserText = "";
    // The interviewer's own turn may still be settling when a fast candidate
    // starts answering (the greeting audio can finish before its
    // AgentAudioDone). Retry the state conflict briefly instead of ending the
    // interview over a one-second race.
    for (let attempt = 0; ; attempt += 1) {
      try {
        const result = await this.deps.service.persistFinalTranscript(
          this.deps.interviewId,
          this.deps.userId,
          {
            text,
            metadata: {
              provider: "deepgram-agent",
              language: this.language,
              finalizedAt: new Date().toISOString(),
            },
          },
        );
        this.latestUserAnswer = text;
        this.lastPersistedUserSequence = result.turn.sequence;
        this.sendJson({ type: "user-transcript", text, turn: result.turn });
        observability().event("voice.gateway.user_turn_persisted", {
          interviewId: this.deps.interviewId,
          sequence: result.turn.sequence,
        });
        return;
      } catch (error) {
        const transient = isConversationStateConflict(error);
        if (transient && attempt < userFlushRetryAttempts) {
          await delay(userFlushRetryDelayMs);
          continue;
        }
        if (transient) {
          // Keep the words for the next flush (the interviewer's turn will
          // settle) rather than dropping the candidate's answer.
          this.pendingUserText = joinStatements(text, this.pendingUserText);
          this.latestUserAnswer = text;
          observability().event("voice.gateway.user_turn_deferred", {
            interviewId: this.deps.interviewId,
            attempts: attempt + 1,
          });
          return;
        }
        this.deps.log.warn({ error }, "Agent pipeline: user transcript persistence failed");
        this.sendJson({
          type: "error",
          message: "Your answer could not be saved. Please retry or switch to text.",
        });
        this.teardown("Transcript persistence failed.");
        return;
      }
    }
  }

  private async finalizeAgentTurn() {
    const { interviewId, userId } = this.deps;
    try {
      await this.userFlushPromise;
      await this.flushUserStatement();
      const answerForAssessment = this.latestUserAnswer;
      const questionForAssessment = this.latestAgentQuestion;
      const text = this.pendingAgentText.trim();
      this.pendingAgentText = "";
      if (!text) {
        this.sendJson({ type: "agent-audio-done" });
        return;
      }
      const conversation = await this.repository.findActiveOwned(interviewId, userId);
      if (!conversation) return;
      await this.assessmentPromise;
      const isGreeting = conversation.turns.every((turn) => turn.speaker === "SYSTEM");
      const {
        kind,
        nextState,
        memory: nextMemory,
      } = resolveAgentTurnPlan({
        memory: this.memorySnapshot,
        planTopics: this.planTopics,
        text,
        isGreeting,
      });

      const turn = await this.deps.database.$transaction(async (tx) => {
        const appended = await this.repository.appendTurn(tx, {
          conversationId: conversation.id,
          expectedSequence: conversation.sequence,
          expectedState: conversation.state,
          nextState,
          speaker: "AI",
          type: kind,
          text,
        });
        if (!appended) return null;
        if (nextMemory) {
          await this.repository.updateMemory(tx, interviewId, nextMemory);
        }
        return appended;
      });
      if (!turn) {
        this.deps.log.warn(
          { interviewId },
          "Agent pipeline: turn was not persisted due to state conflict",
        );
        this.sendJson({
          type: "error",
          message: "The interview state changed; refreshing your session.",
        });
        return;
      }
      this.memorySnapshot = nextMemory;
      this.latestAgentQuestion = text;
      this.deps.events.publish({
        name: "AIResponseGenerated",
        payload: { interviewId, conversationId: conversation.id, turn: toTurnDto(turn) },
      });
      this.sendJson({ type: "agent-turn", turn: toTurnDto(turn), state: nextState });
      this.latestUserAnswer = "";
      if (kind === "CLOSING") {
        // The web client ACKs this only after its streamed PCM has played;
        // playback-completed then runs the existing lifecycle completion path.
        this.sendJson({ type: "agent-closing", turnId: turn.id });
      }
      observability().event("voice.gateway.agent_turn_persisted", {
        interviewId,
        turnId: turn.id,
        turnKind: kind,
        sequence: turn.sequence,
      });
      void this.usage.record(interviewId, {
        thinkRequests: 1,
        speakCharacters: text.length,
      });
      if (kind === "QUESTION" && answerForAssessment) {
        this.assessmentPromise = this.assessLatestAnswer(
          answerForAssessment,
          questionForAssessment,
        ).catch((error) => {
          this.deps.log.warn({ error }, "Agent pipeline: post-turn assessment failed");
        });
      } else {
        void this.refreshThinkContext();
      }
      // Phase 4 turn-taking is server-authoritative: the provider finishing its
      // audio is the event that returns the interview to LISTENING and arms the
      // silence ladder. The browser's playback-completed ack stays for UI
      // synchronization and is idempotent, so a deaf tab, a suspended audio
      // context or a dropped ack can no longer strand the interview in SPEAKING
      // (which previously meant no silence detection at all).
      void this.settleTurn(turn.id);
      this.sendJson({ type: "agent-audio-done", turnId: turn.id });
    } catch (error) {
      this.deps.log.error({ error }, "Agent pipeline: failed to finalize agent turn");
    }
  }

  /**
   * Refresh the system instruction after the turn and use the new digest on the
   * next Think request. UpdateThink is acknowledged asynchronously; only one
   * update is in flight to avoid interleaving successive per-turn versions.
   */
  private async refreshThinkContext(force = false) {
    if (!this.transport || !this.memorySnapshot) return;
    const digest = buildAgentMemoryDigest(this.memorySnapshot);
    const encodedDigest = JSON.stringify(digest);
    if (!force && encodedDigest === this.latestMemoryDigest) return;
    if (this.thinkUpdatePending) {
      this.contextRefreshDirty = true;
      return;
    }
    const instruction = buildAgentInterviewInstruction({
      interviewType: this.interviewType,
      difficulty: this.memorySnapshot.questionDifficulty,
      targetRole: this.targetRole,
      isGeneralIntake: this.generalIntake,
      language: this.language,
      topics: this.planTopics,
      objectives: this.planObjectives,
      resumeSummary: this.resumeSummary,
      resumeSkills: this.resumeSkills,
      jobRequiredSkills: this.jobRequiredSkills,
      memoryDigest: digest,
    });
    this.thinkUpdatePending = true;
    this.contextRefreshDirty = false;
    this.latestMemoryDigest = encodedDigest;
    this.transport.updateThinkPrompt(instruction, this.thinkHeaders);
    observability().event("voice.gateway.context_refresh_requested", {
      interviewId: this.deps.interviewId,
      askedQuestionCount: digest.askedQuestions.length,
      coveredTopicCount: digest.coveredTopics.length,
    });
  }

  /** Structured assessment is fire-and-forget; realtime agent generation never waits on it. */
  private async assessLatestAnswer(answerText: string, questionText: string) {
    const memory = this.memorySnapshot;
    if (!memory || !answerText.trim()) return;
    const candidateAnswerSequence = this.lastPersistedUserSequence;
    const topic =
      deriveTopicReference(questionText, this.planTopics) ??
      this.planTopics.find((item) =>
        memory.topicCoverage.some(
          (covered) => covered.topic === item && covered.outcome === "ASKED",
        ),
      ) ??
      null;
    const assessment = await this.aiProvider.generateStructured(
      {
        instructions: `Evaluate the candidate's answer to one interviewer question against the supplied plan objectives. Return ONLY JSON matching {"answerDepth":"SHALLOW|ADEQUATE|STRONG","followUpNeeded":boolean,"completedObjectives":string[]}. Mark an objective complete only when this answer gives adequate or strong evidence for it. SHALLOW means missing or incorrect evidence, ADEQUATE means relevant but incomplete, STRONG means specific, correct and well-supported. followUpNeeded is true only when an important objective needs another probe. Do not invent candidate claims or add other fields.`,
        context: {
          question: questionText,
          answer: answerText,
          topic,
          remainingObjectives: memory.remainingObjectives,
        },
        timeoutMs: 8_000,
        maxOutputTokens: 120,
        maxAttempts: 2,
      },
      (value) => agentAnswerAssessmentSchema.parse(value),
    );
    void this.usage.record(this.deps.interviewId, { thinkRequests: 1 });
    const nextMemory = applyAgentAnswerAssessment({
      memory,
      topic,
      answerDepth: assessment.answerDepth,
      followUpNeeded: assessment.followUpNeeded,
      completedObjectives: assessment.completedObjectives.filter((objective) =>
        memory.remainingObjectives.includes(objective),
      ),
    });
    await this.deps.database.$transaction(async (tx) => {
      const latest = await tx.conversation.findUnique({
        where: { id: this.conversationId },
        select: { sequence: true, state: true },
      });
      if (
        !latest ||
        latest.sequence < candidateAnswerSequence ||
        latest.state === "CLOSING" ||
        latest.state === "COMPLETED"
      )
        return;
      await this.repository.updateMemory(tx, this.deps.interviewId, nextMemory);
    });
    const latest = await this.repository.findActiveOwned(this.deps.interviewId, this.deps.userId);
    if (
      !latest ||
      latest.sequence < candidateAnswerSequence ||
      latest.state === "CLOSING" ||
      latest.state === "COMPLETED"
    )
      return;
    this.memorySnapshot = nextMemory;
    await this.refreshThinkContext();
    observability().event("voice.gateway.assessment_saved", {
      interviewId: this.deps.interviewId,
      answerDepth: assessment.answerDepth,
      followUpNeeded: assessment.followUpNeeded,
      topic: topic ?? undefined,
    });
  }

  /**
   * Injects server control text as user speech (greeting, move-on, duration
   * closing). The provider may echo it back as a user statement; the echo is
   * suppressed so it never becomes candidate content.
   */
  private injectControlMessage(text: string) {
    this.pendingInjectionText = text;
    this.transport?.injectUserMessage(text);
  }

  private consumeInjectedEcho(text: string): boolean {
    if (!this.pendingInjectionText) return false;
    const injected = this.pendingInjectionText;
    if (isInjectedUserEcho(text, injected)) {
      this.pendingInjectionText = null;
      return true;
    }
    // Real candidate speech: keep it and stop suppressing.
    this.pendingInjectionText = null;
    return false;
  }

  /**
   * Phase 3 move-on: the ladder saw sustained silence. The provider already
   * holds the plan, memory digest and asked questions, so a control message is
   * enough for it to ask the next planned question — no server LLM round trip,
   * no repeated question. The struggle is recorded for the assessment.
   */
  private async requestMoveOn(): Promise<boolean> {
    if (this.closed || !this.transport) return false;
    const unansweredTopic = deriveTopicReference(this.latestAgentQuestion, this.planTopics);
    if (this.memorySnapshot) {
      this.memorySnapshot = recordAgentSilenceStruggle(this.memorySnapshot, unansweredTopic);
    }
    // Inject first: dead air is the problem being solved, so persistence of the
    // struggle note must not sit in front of the interviewer's next word.
    this.injectControlMessage(
      buildAgentMoveOnDirective({
        unansweredTopic,
        askedQuestions: this.memorySnapshot?.askedQuestions ?? [],
        remainingObjectives: this.memorySnapshot?.remainingObjectives ?? [],
      }),
    );
    if (this.memorySnapshot) void this.persistMemorySnapshot(this.memorySnapshot);
    void this.refreshThinkContext(true);
    observability().event("voice.gateway.move_on_requested", {
      interviewId: this.deps.interviewId,
      unansweredTopic: unansweredTopic ?? undefined,
    });
    return true;
  }

  /** Persists a memory snapshot taken outside a turn, guarded by the live state. */
  private async persistMemorySnapshot(memory: ReturnType<typeof coerceAgentMemory>) {
    try {
      await this.deps.database.$transaction(async (tx) => {
        const latest = await tx.conversation.findUnique({
          where: { id: this.conversationId },
          select: { state: true },
        });
        if (!latest || latest.state === "CLOSING" || latest.state === "COMPLETED") return;
        await this.repository.updateMemory(tx, this.deps.interviewId, memory);
      });
    } catch (error) {
      this.deps.log.warn({ error }, "Agent pipeline: silence memory update failed");
    }
  }

  /**
   * Greeting lag guard. A greeting that never arrives is indistinguishable from
   * a dead session, so after a generous window the socket closes and the client
   * reconnects, which re-injects the greeting from empty history. The client's
   * reconnect ceiling ends this: three failed attempts fall back to text mode.
   */
  private armGreetingDeadline() {
    if (this.greetingTimer) clearTimeout(this.greetingTimer);
    this.greetingTimer = setTimeout(() => {
      this.greetingTimer = null;
      if (this.closed || this.agentSpoke) return;
      observability().event("voice.gateway.greeting_timed_out", {
        interviewId: this.deps.interviewId,
        deadlineMs: greetingDeadlineMs,
      });
      this.teardown("The interviewer's greeting did not start in time.");
    }, greetingDeadlineMs);
    this.greetingTimer.unref();
  }

  private markAgentSpoke() {
    this.agentSpoke = true;
    if (!this.greetingTimer) return;
    clearTimeout(this.greetingTimer);
    this.greetingTimer = null;
  }

  /**
   * The ladder or the clock decided the interview is over. The live provider
   * says the goodbye itself, so the client plays it and the normal playback
   * acknowledgement completes the interview. Returns false when the session
   * cannot speak, leaving the caller (and eventually the sweeper) to close.
   */
  private async requestClosing(reason: "SILENCE" | "DURATION"): Promise<boolean> {
    if (this.closed || !this.transport) return false;
    try {
      this.injectControlMessage(buildAgentClosingDirective({ reason }));
      observability().event("voice.gateway.closing_requested", {
        interviewId: this.deps.interviewId,
        reason,
      });
      return true;
    } catch (error) {
      this.deps.log.warn({ error }, "Agent pipeline: closing injection failed");
      return false;
    }
  }

  /** The interview clock is authoritative: the session closes itself at the cap. */
  private armDurationDeadline(interview: { startedAt: Date | null; durationMinutes: number }) {
    const startedAt = interview.startedAt?.getTime() ?? Date.now();
    const remainingMs = startedAt + interview.durationMinutes * 60_000 - Date.now();
    if (this.durationTimer) clearTimeout(this.durationTimer);
    this.durationTimer = setTimeout(
      () => void this.closeAtDurationLimit(),
      Math.max(0, Math.min(remainingMs, maximumTimerDelayMs)),
    );
    this.durationTimer.unref();
  }

  /**
   * At the cap the interviewer says a short goodbye through the normal turn
   * pipeline, so the client plays it and its acknowledgement completes the
   * interview and queues the report. If the provider cannot speak, teardown
   * leaves the server-side expiry sweeper to complete the session.
   */
  private async closeAtDurationLimit() {
    if (this.closed || !this.transport) return;
    this.durationTimer = null;
    observability().event("voice.gateway.duration_reached", {
      interviewId: this.deps.interviewId,
    });
    if (!(await this.requestClosing("DURATION"))) {
      // Without a spoken goodbye the client cannot acknowledge; the server-side
      // expiry sweeper completes the interview shortly after the cap.
      this.teardown("The interview duration has ended.");
    }
  }

  /**
   * The provider session is terminal (think/speak exhausted, including the
   * fallback chain). Instead of dropping the candidate into a dead connection,
   * tell the browser to continue in text with a fixed, non-generated notice —
   * the interview state itself is untouched, so typed answers keep flowing.
   */
  private degrade(summary: string, code: string | undefined) {
    if (this.degraded) {
      this.teardown(summary);
      return;
    }
    this.degraded = true;
    observability().event("voice.gateway.degraded", {
      interviewId: this.deps.interviewId,
      code,
      thinkModelCount: this.thinkModels.length,
    });
    this.sendJson({
      type: "think-degraded",
      message: agentDegradedNotice(this.language),
      fallback: "text",
      ...(code ? { code } : {}),
    });
    this.teardown(summary);
  }

  /**
   * Moves the conversation past the turn that just finished streaming and arms
   * the backend silence ladder. Errors are expected when the candidate spoke
   * over the turn (the state already advanced) or the interview closed; they
   * are observed, never surfaced.
   */
  private async settleTurn(turnId: string) {
    try {
      await this.deps.service.acknowledgePlayback(this.deps.interviewId, turnId, this.deps.userId);
    } catch (error) {
      if (error instanceof ConversationError) {
        observability().event("voice.gateway.settle_skipped", {
          interviewId: this.deps.interviewId,
          turnId,
          code: error.code,
        });
        return;
      }
      this.deps.log.warn({ error }, "Agent pipeline: turn settlement failed");
    }
  }

  private sendJson(message: Record<string, unknown>) {
    if (this.closed) return;
    try {
      if (this.deps.socket.readyState === 1) {
        this.deps.socket.send(JSON.stringify(message));
      }
    } catch (error) {
      this.deps.log.warn({ error }, "Agent pipeline: failed to send a client message");
    }
  }

  /** Adds the seconds elapsed since the last metered point to the ledger. */
  private flushVoiceUsage() {
    if (this.usageStartedAt === null) return;
    const elapsedSeconds = Math.floor((Date.now() - this.usageStartedAt) / 1_000);
    if (elapsedSeconds <= 0) return;
    this.usageStartedAt += elapsedSeconds * 1_000;
    void this.usage.record(this.deps.interviewId, { voiceSeconds: elapsedSeconds });
  }

  private teardown(summary: string, closeCode = 1013) {
    if (this.closed) return;
    this.closed = true;
    this.flushVoiceUsage();
    this.usageStartedAt = null;
    const capacity = this.capacity;
    this.capacity = null;
    if (capacity) void capacity.release();
    const owner = this.owner;
    this.owner = null;
    if (owner) void owner.release();
    if (this.keepAliveTimer) clearInterval(this.keepAliveTimer);
    this.keepAliveTimer = null;
    if (this.durationTimer) clearTimeout(this.durationTimer);
    this.durationTimer = null;
    if (this.greetingTimer) clearTimeout(this.greetingTimer);
    this.greetingTimer = null;
    this.unregisterDirector?.();
    this.unregisterDirector = null;
    this.pendingInjectionText = null;
    try {
      if (this.deps.socket.readyState === 1) this.deps.socket.close(closeCode, summary);
    } catch {
      // already closed
    }
    try {
      this.transport?.close();
    } catch {
      // already closed
    }
  }
}

function isConversationStateConflict(error: unknown): boolean {
  return (
    error instanceof ConversationError &&
    (error.code === "INVALID_STATE_TRANSITION" || error.code === "CONVERSATION_STATE_CONFLICT")
  );
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref();
  });
}

function jsonStringList(value: unknown, limit: number): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string").slice(0, limit)
    : [];
}

function joinStatements(current: string, next: string) {
  return current ? `${current} ${next}` : next;
}

function toTurnDto(turn: {
  id: string;
  sequence: number;
  speaker: string;
  type: string;
  text: string;
  createdAt: Date;
}): ConversationTurn {
  return {
    id: turn.id,
    sequence: turn.sequence,
    speaker: turn.speaker as ConversationTurn["speaker"],
    type: turn.type as ConversationTurn["type"],
    text: turn.text,
    createdAt: turn.createdAt.toISOString(),
  };
}

export async function startAgentVoiceGateway(deps: GatewayDeps): Promise<AgentVoiceGateway> {
  const gateway = new AgentVoiceGateway(deps);
  await gateway.run();
  return gateway;
}
