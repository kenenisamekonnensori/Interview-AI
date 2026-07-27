import type { PrismaClient } from "../../../prisma/generated/client.js";
import type { createCareerAnalysisQueue } from "../../services/career-analysis-queue.js";
import type { createReportQueue } from "../../services/report-queue.js";
import type { InterviewConfiguration, InterviewStatus } from "@interviewer-ai/types";
import {
  assertConversationTransition,
  assertInterviewTransition,
} from "../conversation/state-machine.js";
import { InterviewEventPublisher } from "./events.js";
import { InterviewRepository } from "./repository.js";
import type { CreateInterviewInput } from "./schema.js";

declare module "fastify" {
  interface FastifyInstance {
    interviewService: InterviewService;
  }
}

export class InterviewLifecycleError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "InterviewLifecycleError";
  }
}

const activeInterviewStatuses: InterviewStatus[] = ["IN_PROGRESS", "COMPLETING"];

export class InterviewService {
  readonly repository: InterviewRepository;

  constructor(
    private readonly database: PrismaClient,
    private readonly queue: ReturnType<typeof createCareerAnalysisQueue>,
    private readonly reportQueue: ReturnType<typeof createReportQueue>,
    private readonly events: InterviewEventPublisher,
  ) {
    this.repository = new InterviewRepository(database);
  }

  async create(userId: string, input: CreateInterviewInput) {
    const profile = await this.database.userProfile.findUnique({ where: { userId } });
    const configuration: InterviewConfiguration = {
      ...input,
      difficulty: input.difficulty ?? profile?.defaultDifficulty ?? "MEDIUM",
      durationMinutes: input.durationMinutes ?? profile?.defaultInterviewDuration ?? 30,
      language: input.language ?? profile?.preferredLanguage ?? "en",
      targetRole: input.targetRole ?? profile?.targetRole ?? undefined,
    };
    const [resume, job] = await Promise.all([
      configuration.resumeId
        ? this.database.resume.findFirst({
            where: {
              id: configuration.resumeId,
              userId,
              deletedAt: null,
              status: { in: ["READY", "ANALYZED"] },
            },
          })
        : null,
      configuration.jobDescriptionId
        ? this.database.jobDescription.findFirst({
            where: { id: configuration.jobDescriptionId, userId, deletedAt: null },
          })
        : null,
    ]);
    if (configuration.resumeId && !resume)
      throw new InterviewLifecycleError(
        "RESUME_NOT_FOUND",
        "Choose a resume you own that is ready to use.",
      );
    if (configuration.jobDescriptionId && !job)
      throw new InterviewLifecycleError(
        "JOB_DESCRIPTION_NOT_FOUND",
        "Choose a job description you own.",
      );
    return this.database.interview.create({
      data: {
        userId,
        interviewType: configuration.interviewType,
        difficulty: configuration.difficulty,
        durationMinutes: configuration.durationMinutes,
        language: configuration.language,
        targetRole: configuration.targetRole ?? null,
        resumeId: resume?.id ?? null,
        jobDescriptionId: job?.id ?? null,
      },
      include: {
        resume: { select: { id: true, fileName: true } },
        jobDescription: { select: { id: true, title: true, company: true } },
      },
    });
  }

  async prepare(id: string, userId: string, correlationId?: string) {
    const interview = await this.repository.findOwned(id, userId);
    if (!interview)
      throw new InterviewLifecycleError("INTERVIEW_NOT_FOUND", "Interview not found.");
    if (interview.status === "PREPARING") return { status: "PREPARING" as const };
    try {
      assertInterviewTransition(interview.status, "PREPARING");
    } catch {
      throw new InterviewLifecycleError(
        "INTERVIEW_NOT_PREPARABLE",
        "This interview cannot be prepared.",
      );
    }
    const changed = await this.database.interview.updateMany({
      where: { id, userId, status: "DRAFT" },
      data: { status: "PREPARING" },
    });
    if (!changed.count) {
      const current = await this.repository.findOwned(id, userId);
      if (current?.status === "PREPARING") return { status: "PREPARING" as const };
      throw new InterviewLifecycleError(
        "INTERVIEW_NOT_PREPARABLE",
        "This interview cannot be prepared.",
      );
    }
    await this.queue.enqueue({
      kind: "interview-plan",
      interviewId: id,
      userId,
      ...(correlationId ? { correlationId } : {}),
    });
    return { status: "PREPARING" as const };
  }

  async start(id: string, userId: string) {
    const result = await this.database.$transaction(async (tx) => {
      const interview = await tx.interview.findFirst({
        where: { id, userId },
        include: { plan: true, conversation: true },
      });
      if (!interview)
        throw new InterviewLifecycleError("INTERVIEW_NOT_FOUND", "Interview not found.");
      if (interview.status === "IN_PROGRESS" && interview.conversation)
        return { conversation: interview.conversation, started: false };
      if (interview.status !== "READY")
        throw new InterviewLifecycleError(
          "INTERVIEW_NOT_READY",
          "Only ready interviews can start.",
        );
      if (!interview.plan)
        throw new InterviewLifecycleError(
          "INTERVIEW_PLAN_REQUIRED",
          "A valid interview plan is required before starting.",
        );
      assertInterviewTransition(interview.status, "IN_PROGRESS");
      const startedAt = new Date();
      const changed = await tx.interview.updateMany({
        where: { id, userId, status: "READY" },
        data: { status: "IN_PROGRESS", startedAt },
      });
      if (!changed.count)
        throw new InterviewLifecycleError(
          "INTERVIEW_START_CONFLICT",
          "Interview start is in progress; retry the request.",
        );
      const conversation = await tx.conversation.upsert({
        where: { interviewId: id },
        create: { interviewId: id, startedAt },
        update: {},
      });
      await tx.interviewMemory.upsert({
        where: { interviewId: id },
        create: {
          interviewId: id,
          remainingObjectives: interview.plan.objectives === null ? [] : interview.plan.objectives,
          questionDifficulty: interview.difficulty,
        },
        update: {},
      });
      return { conversation, started: true };
    });
    if (result.started)
      this.events.publish({
        name: "InterviewStarted",
        payload: { interviewId: id, conversation: conversationDto(result.conversation) },
      });
    return result;
  }

  async requestCompletion(id: string, userId: string) {
    const result = await this.database.$transaction(async (tx) => {
      const interview = await tx.interview.findFirst({
        where: { id, userId },
        include: { conversation: true, report: true },
      });
      if (!interview)
        throw new InterviewLifecycleError("INTERVIEW_NOT_FOUND", "Interview not found.");
      if (interview.status === "COMPLETED")
        return { interview, requested: false, enqueueReport: false };
      if (interview.status === "COMPLETING")
        return { interview, requested: false, enqueueReport: false };
      if (interview.status !== "IN_PROGRESS" || !interview.conversation)
        throw new InterviewLifecycleError(
          "INTERVIEW_NOT_ACTIVE",
          "Only active interviews can be completed.",
        );
      assertInterviewTransition(interview.status, "COMPLETING");
      const claimed = await tx.interview.updateMany({
        where: { id, userId, status: "IN_PROGRESS" },
        data: { status: "COMPLETING" },
      });
      if (!claimed.count) {
        const current = await tx.interview.findFirst({
          where: { id, userId },
          include: { conversation: true, report: true },
        });
        if (current) return { interview: current, requested: false, enqueueReport: false };
        throw new InterviewLifecycleError("INTERVIEW_NOT_FOUND", "Interview not found.");
      }
      const completedAt = new Date();
      if (interview.conversation.state !== "COMPLETED") {
        assertConversationTransition(interview.conversation.state, "CLOSING");
        assertConversationTransition("CLOSING", "COMPLETED");
      }
      await tx.conversation.update({
        where: { id: interview.conversation.id },
        data: { state: "COMPLETED", completedAt },
      });
      const completed = await tx.interview.update({
        where: { id },
        data: { status: "COMPLETED", completedAt },
      });
      const report = await tx.interviewReport.upsert({
        where: { interviewId: id },
        create: { interviewId: id, status: "PENDING" },
        update: {},
      });
      const updated = await tx.interview.findUniqueOrThrow({
        where: { id },
        include: { conversation: true, report: true },
      });
      return {
        interview: { ...updated, completedAt: completed.completedAt },
        requested: true,
        enqueueReport: report.status === "PENDING",
      };
    });
    if (result.requested) {
      this.events.publish({
        name: "InterviewCompletionRequested",
        payload: {
          interviewId: id,
          conversationId: result.interview.conversation!.id,
          occurredAt: new Date().toISOString(),
        },
      });
      this.events.publish({
        name: "InterviewCompleted",
        payload: {
          interviewId: id,
          conversationId: result.interview.conversation!.id,
          occurredAt: result.interview.completedAt!.toISOString(),
        },
      });
    }
    if (result.enqueueReport) {
      try {
        await this.reportQueue.enqueue({ interviewId: id, userId });
      } catch {
        // Completion is durable even when queue infrastructure is temporarily unavailable.
        await this.database.interviewReport.updateMany({
          where: { interviewId: id, status: "PENDING" },
          data: {
            status: "FAILED",
            failureReason: "Your report could not be queued. Please try again.",
          },
        });
      }
    }
    return result.interview;
  }

  /** Used only by backend orchestration when a session cannot safely continue. */
  async failActiveSession(id: string, userId: string) {
    return this.database.$transaction(async (tx) => {
      const interview = await tx.interview.findFirst({
        where: { id, userId },
        include: { conversation: true },
      });
      if (!interview)
        throw new InterviewLifecycleError("INTERVIEW_NOT_FOUND", "Interview not found.");
      if (interview.status === "FAILED") return interview;
      if (interview.status !== "IN_PROGRESS" && interview.status !== "COMPLETING")
        throw new InterviewLifecycleError(
          "INTERVIEW_NOT_ACTIVE",
          "Only an active interview can fail its session.",
        );
      assertInterviewTransition(interview.status, "FAILED");
      const failed = await tx.interview.updateMany({
        where: { id, userId, status: interview.status },
        data: { status: "FAILED" },
      });
      if (!failed.count) return tx.interview.findUniqueOrThrow({ where: { id } });
      if (interview.conversation && interview.conversation.state !== "COMPLETED") {
        assertConversationTransition(interview.conversation.state, "CLOSING");
        assertConversationTransition("CLOSING", "COMPLETED");
        await tx.conversation.update({
          where: { id: interview.conversation.id },
          data: { state: "COMPLETED", completedAt: new Date() },
        });
      }
      return tx.interview.findUniqueOrThrow({ where: { id } });
    });
  }

  async cancel(id: string, userId: string) {
    const interview = await this.repository.findOwned(id, userId);
    if (!interview)
      throw new InterviewLifecycleError("INTERVIEW_NOT_FOUND", "Interview not found.");
    if (interview.status === "CANCELLED") return interview;
    try {
      assertInterviewTransition(interview.status, "CANCELLED");
    } catch {
      throw new InterviewLifecycleError(
        "INTERVIEW_NOT_CANCELLABLE",
        "This interview cannot be cancelled.",
      );
    }
    const updated = await this.database.interview.updateMany({
      where: { id, userId, status: { in: ["DRAFT", "PREPARING", "READY"] } },
      data: { status: "CANCELLED" },
    });
    if (!updated.count) {
      const current = await this.repository.findOwned(id, userId);
      if (current?.status === "CANCELLED") return current;
      throw new InterviewLifecycleError(
        "INTERVIEW_NOT_CANCELLABLE",
        "This interview cannot be cancelled.",
      );
    }
    return this.repository.findOwned(id, userId);
  }

  async details(id: string, userId: string) {
    const interview = await this.repository.findOwned(id, userId);
    if (!interview)
      throw new InterviewLifecycleError("INTERVIEW_NOT_FOUND", "Interview not found.");
    return interview;
  }

  async state(id: string, userId: string) {
    const interview = await this.details(id, userId);
    return {
      interviewId: interview.id,
      status: interview.status,
      startedAt: interview.startedAt?.toISOString() ?? null,
      completedAt: interview.completedAt?.toISOString() ?? null,
      conversation: interview.conversation ? conversationDto(interview.conversation) : null,
      reportReady: Boolean(interview.report),
      active: activeInterviewStatuses.includes(interview.status),
    };
  }
}

function conversationDto(conversation: {
  id: string;
  interviewId: string;
  state: string;
  sequence: number;
  startedAt: Date;
  completedAt: Date | null;
}) {
  return {
    ...conversation,
    state: conversation.state as
      "GREETING" | "LISTENING" | "TRANSCRIBING" | "THINKING" | "SPEAKING" | "CLOSING" | "COMPLETED",
    startedAt: conversation.startedAt.toISOString(),
    completedAt: conversation.completedAt?.toISOString() ?? null,
  };
}
