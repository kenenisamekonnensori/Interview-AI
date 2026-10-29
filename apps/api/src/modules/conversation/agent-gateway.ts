import type { WebSocket as FastifySocket } from "ws";
import type { ServerEnvironment } from "@interviewer-ai/config";
import type { ConversationState, ConversationTurn } from "@interviewer-ai/types";
import {
  buildAgentInterviewInstruction,
  buildAgentOpeningMessage,
} from "@interviewer-ai/prompts";
import { interviewPlanSchema } from "@interviewer-ai/types";

import type { PrismaClient } from "../../../prisma/generated/client.js";
import { observability } from "../../services/observability.js";
import {
  agentAnswerAssessmentSchema,
  applyAgentAnswerAssessment,
  buildAgentMemoryDigest,
  buildAgentMemoryUpdate,
  coerceAgentMemory,
  deriveTopicReference,
  hasCoveredAllAgentObjectives,
  isAgentClosingStatement,
  type AgentTurnKind,
} from "./agent-memory.js";
import { connectAgentTransport, type AgentTransport } from "./agent-transport.js";
import { createAiProvider } from "../ai/index.js";
import type { ConversationEventPublisher } from "./events.js";
import { ConversationRepository } from "./repository.js";
import { ConversationService } from "./service.js";

const keepAliveIntervalMs = 5_000;

type GatewayDeps = {
  log: { error: (payload: unknown, message: string) => void; warn: (payload: unknown, message: string) => void };
  environment: ServerEnvironment;
  database: PrismaClient;
  service: ConversationService;
  events: ConversationEventPublisher;
  socket: FastifySocket;
  interviewId: string;
  userId: string;
};

/** Server-owned websocket session manager selected by VOICE_PIPELINE=agent. */
class AgentVoiceGateway {
  private readonly repository: ConversationRepository;
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
  private assessmentPromise: Promise<void> = Promise.resolve();
  private speechStartPromise: Promise<unknown> = Promise.resolve();
  private userFlushPromise: Promise<void> = Promise.resolve();

  constructor(private readonly deps: GatewayDeps) {
    this.repository = new ConversationRepository(deps.database);
    this.aiProvider = createAiProvider(deps.environment);
  }

  async run() {
    const { interviewId, userId, socket, environment } = this.deps;
    const conversation = await this.repository.findActiveOwned(interviewId, userId);
    if (!conversation || !conversation.interview.plan) {
      socket.close(1008, "An active planned conversation is required.");
      return;
    }
    this.conversationId = conversation.id;
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
        (turn) => turn.speaker === "AI" && ["QUESTION", "FOLLOW_UP", "CLARIFICATION"].includes(turn.type),
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
    if (environment.GEMINI_API_KEY) this.thinkHeaders = { "x-goog-api-key": environment.GEMINI_API_KEY };
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
    const opening = buildAgentOpeningMessage({
      interviewType: conversation.interview.interviewType,
      difficulty: conversation.interview.difficulty,
      targetRole: conversation.interview.targetRole,
      language: this.language,
      isGeneralIntake: this.generalIntake,
      topics: this.planTopics,
      objectives: this.planObjectives,
    });

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
          geminiModel: environment.GEMINI_MODEL,
          instruction: this.baseInstruction,
          history,
          resumeSummary: this.resumeSummary,
          resumeSkills: this.resumeSkills,
          jobRequiredSkills: this.jobRequiredSkills,
          thinkHeaders: this.thinkHeaders,
        },
        {
          onReady: () => {
            this.sendJson({ type: "agent-ready", interviewId });
            // Only inject on the first entry. A reconnect supplies DB history
            // through Settings and must never generate a second greeting.
            if (history.length === 0) this.transport?.injectUserMessage(opening);
            else if (this.memorySnapshot) void this.refreshThinkContext(true);
            this.keepAliveTimer = setInterval(() => {
              try {
                this.transport?.sendKeepAlive();
              } catch (error) {
                this.deps.log.warn({ error }, "Agent keep-alive send failed");
              }
            }, keepAliveIntervalMs);
          },
          onUserStartedSpeaking: () => {
            this.sendJson({ type: "user-speech-started" });
            this.speechStartPromise = this.deps.service
              .notifyUserSpeechStarted(interviewId, userId)
              .then(() => undefined)
              .catch((error) => {
                this.deps.log.warn({ error }, "Agent pipeline: user speech state update failed");
              });
          },
          onUserStatement: (text) => {
            this.pendingUserText = joinStatements(this.pendingUserText, text);
          },
          onAgentThinking: () => {
            this.userFlushPromise = this.flushUserStatement();
          },
          onAgentStatement: (text) => {
            this.pendingAgentText = joinStatements(this.pendingAgentText, text);
          },
          onAgentAudio: (chunk) => {
            if (socket.readyState === 1) socket.send(chunk, { binary: true });
          },
          onAgentAudioDone: () => {
            void this.finalizeAgentTurn();
          },
          onThinkUpdated: () => {
            this.thinkUpdatePending = false;
            if (this.contextRefreshDirty) void this.refreshThinkContext();
          },
          onWarning: (summary) => {
            this.deps.log.warn({ summary }, "Agent pipeline warning");
            this.sendJson({ type: "warning", message: summary });
          },
          onError: (summary) => {
            this.deps.log.error({ summary }, "Agent pipeline error");
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
    try {
      const result = await this.deps.service.persistFinalTranscript(this.deps.interviewId, this.deps.userId, {
        text,
        metadata: {
          provider: "deepgram-agent",
          language: this.language,
          finalizedAt: new Date().toISOString(),
        },
      });
      this.latestUserAnswer = text;
      this.lastPersistedUserSequence = result.turn.sequence;
      this.sendJson({ type: "user-transcript", text, turn: result.turn });
      observability().event("voice.gateway.user_turn_persisted", {
        interviewId: this.deps.interviewId,
        sequence: result.turn.sequence,
      });
    } catch (error) {
      this.deps.log.warn({ error }, "Agent pipeline: user transcript persistence failed");
      this.sendJson({ type: "error", message: "Your answer could not be saved. Please retry or switch to text." });
      this.teardown("Transcript persistence failed.");
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
      const isClosing = isAgentClosingStatement(text) && !text.trim().endsWith("?");
      const planComplete = this.memorySnapshot
        ? hasCoveredAllAgentObjectives(this.memorySnapshot, this.planTopics)
        : false;
      const kind = classifyAgentTurnKind(isGreeting, isClosing || planComplete);
      const nextState: ConversationState = kind === "CLOSING" ? "CLOSING" : "SPEAKING";
      const nextMemory = this.memorySnapshot
        ? kind === "QUESTION"
          ? buildAgentMemoryUpdate({
              memory: this.memorySnapshot,
              kind,
              responseText: text,
              planTopics: this.planTopics,
            })
          : kind === "CLOSING"
            ? {
                ...this.memorySnapshot,
                topicCoverage: this.memorySnapshot.topicCoverage.map((entry) => ({
                  ...entry,
                  outcome: entry.outcome === "ASKED" ? ("COMPLETED" as const) : entry.outcome,
                })),
                remainingObjectives: [],
              }
            : this.memorySnapshot
        : null;

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
        this.deps.log.warn({ interviewId }, "Agent pipeline: turn was not persisted due to state conflict");
        this.sendJson({ type: "error", message: "The interview state changed; refreshing your session." });
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
      if (kind === "QUESTION" && answerForAssessment) {
        this.assessmentPromise = this.assessLatestAnswer(answerForAssessment, questionForAssessment).catch((error) => {
          this.deps.log.warn({ error }, "Agent pipeline: post-turn assessment failed");
        });
      } else {
        void this.refreshThinkContext();
      }
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
        memory.topicCoverage.some((covered) => covered.topic === item && covered.outcome === "ASKED"),
      ) ?? null;
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
      if (!latest || latest.sequence < candidateAnswerSequence || latest.state === "CLOSING" || latest.state === "COMPLETED") return;
      await this.repository.updateMemory(tx, this.deps.interviewId, nextMemory);
    });
    const latest = await this.repository.findActiveOwned(this.deps.interviewId, this.deps.userId);
    if (!latest || latest.sequence < candidateAnswerSequence || latest.state === "CLOSING" || latest.state === "COMPLETED") return;
    this.memorySnapshot = nextMemory;
    await this.refreshThinkContext();
    observability().event("voice.gateway.assessment_saved", {
      interviewId: this.deps.interviewId,
      answerDepth: assessment.answerDepth,
      followUpNeeded: assessment.followUpNeeded,
      topic: topic ?? undefined,
    });
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

  private teardown(summary: string) {
    if (this.closed) return;
    this.closed = true;
    if (this.keepAliveTimer) clearInterval(this.keepAliveTimer);
    this.keepAliveTimer = null;
    try {
      if (this.deps.socket.readyState === 1) this.deps.socket.close(1013, summary);
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

function jsonStringList(value: unknown, limit: number): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string").slice(0, limit)
    : [];
}

function joinStatements(current: string, next: string) {
  return current ? `${current} ${next}` : next;
}

function classifyAgentTurnKind(isGreeting: boolean, isClosing: boolean): AgentTurnKind {
  if (isGreeting) return "GREETING";
  return isClosing ? "CLOSING" : "QUESTION";
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
