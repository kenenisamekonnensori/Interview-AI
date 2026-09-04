import { buildEvaluationPrompt, buildReportPrompt } from "@interviewer-ai/prompts";
import type { ServerEnvironment } from "@interviewer-ai/config";
import type { ReportEvidenceReference } from "@interviewer-ai/types";

import { createAiProvider } from "../ai/index.js";
import { AiProviderError, isRetryableAiError } from "../ai/errors.js";
import { InterviewEventPublisher } from "../interviews/events.js";
import type { createReportQueue } from "../../services/report-queue.js";
import type { PrismaClient } from "../../../prisma/generated/client.js";
import { ReportRepository } from "./repository.js";
import { generatedReportSchema } from "./schema.js";
import { logSafeError } from "../../services/security.js";

export class ReportLifecycleError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ReportLifecycleError";
  }
}

/** Used when an interview completed without any candidate answers to evaluate. */
export const EMPTY_INTERVIEW_REPORT_REASON =
  "This interview ended before any answers were recorded, so an evaluation could not be generated. Try again with a spoken or typed response.";

function publicFailureReason(error: unknown) {
  return error instanceof AiProviderError
    ? "Your report could not be generated yet. Please try again."
    : "Your report could not be generated. Please try again.";
}

function validateEvidence(evidence: ReportEvidenceReference[], turnIds: Set<string>) {
  for (const reference of evidence) {
    if (!turnIds.has(reference.turnId))
      throw new AiProviderError(
        "INVALID_OUTPUT",
        "Report referenced a turn outside this interview.",
      );
  }
}

function validateScoreConsistency(evaluation: {
  overallScore: number;
  technical: { score: number };
  communication: { score: number };
  confidence: { score: number };
  problemSolving: { score: number };
}) {
  const average =
    (evaluation.technical.score +
      evaluation.communication.score +
      evaluation.confidence.score +
      evaluation.problemSolving.score) /
    4;
  if (Math.abs(evaluation.overallScore - average) > 25)
    throw new AiProviderError(
      "INVALID_OUTPUT",
      "Overall score is inconsistent with category scores.",
    );
}

import type { MonolithExecutionManager } from "../../services/monolith-execution.js";

export class ReportService {
  readonly repository: ReportRepository;
  private readonly aiProvider;

  constructor(
    database: PrismaClient,
    private readonly environment: ServerEnvironment,
    private readonly queue: ReturnType<typeof createReportQueue>,
    private readonly events: InterviewEventPublisher,
    private readonly monolith?: MonolithExecutionManager,
  ) {
    this.repository = new ReportRepository(database);
    this.aiProvider = createAiProvider(environment);
  }

  async details(interviewId: string, userId: string) {
    const report = await this.repository.findOwned(interviewId, userId);
    if (!report) throw new ReportLifecycleError("REPORT_NOT_FOUND", "Report not found.");
    return report;
  }

  async retry(interviewId: string, userId: string) {
    const context = await this.repository.context(interviewId);
    const hasAnswers = (context?.conversation?.turns ?? []).some(
      (turn) => turn.speaker === "USER",
    );
    const report = await this.repository.findOwned(interviewId, userId);
    if (!report) throw new ReportLifecycleError("REPORT_NOT_FOUND", "Report not found.");
    if (!hasAnswers) {
      // An interview with no recorded answers cannot produce an evidence-based
      // evaluation; keep the graceful failure instead of re-running generation.
      return report;
    }
    const changed = await this.repository.retry(interviewId, userId);
    if (!changed.count) {
      throw new ReportLifecycleError("REPORT_NOT_RETRYABLE", "This report is not ready to retry.");
    }
    const dispatched = this.monolith?.dispatchReportGeneration(this, interviewId);
    if (!dispatched) {
      try {
        await this.queue.enqueue({ interviewId, userId });
      } catch {
        await this.repository.markPendingFailed(
          interviewId,
          "Your report could not be queued. Please try again.",
        );
        throw new ReportLifecycleError(
          "REPORT_QUEUE_UNAVAILABLE",
          "Report generation could not be queued.",
        );
      }
    }
    return this.details(interviewId, userId);
  }

  async generate(interviewId: string) {
    if (!(await this.repository.claimGeneration(interviewId))) return;
    try {
      const interview = await this.repository.context(interviewId);
      if (
        !interview ||
        interview.status !== "COMPLETED" ||
        !interview.plan ||
        !interview.conversation ||
        interview.conversation.state !== "COMPLETED"
      )
        throw new AiProviderError(
          "INVALID_OUTPUT",
          "A completed interview with a plan is required.",
        );

      const turns = interview.conversation.turns.map((turn) => ({
        id: turn.id,
        sequence: turn.sequence,
        speaker: turn.speaker,
        type: turn.type,
        text: turn.text,
        createdAt: turn.createdAt.toISOString(),
      }));
      const generated = await this.aiProvider.generateStructured(
        {
          instructions: `${buildEvaluationPrompt()}\n${buildReportPrompt()}`,
          context: {
            interview: {
              interviewType: interview.interviewType,
              difficulty: interview.difficulty,
              durationMinutes: interview.durationMinutes,
              targetRole: interview.targetRole,
            },
            plan: interview.plan,
            resumeAnalysis: interview.resume?.deletedAt ? null : interview.resume?.analysis,
            jobAnalysis: interview.jobDescription?.deletedAt
              ? null
              : interview.jobDescription?.analysis,
            memory: interview.memory,
            transcript: turns,
          },
        },
        generatedReportSchema.parse,
      );
      const turnIds = new Set(turns.map((turn) => turn.id));
      validateScoreConsistency(generated.evaluation);
      validateEvidence(generated.evidence, turnIds);
      for (const dimension of [
        generated.evaluation.technical,
        generated.evaluation.communication,
        generated.evaluation.confidence,
        generated.evaluation.problemSolving,
        ...Object.values(generated.evaluation.categoryScores),
      ])
        validateEvidence(
          dimension.evidenceTurnIds.map((turnId) => ({ turnId, claim: dimension.feedback })),
          turnIds,
        );
      for (const finding of [
        ...generated.evaluation.strengths,
        ...generated.evaluation.weaknesses,
        ...generated.evaluation.missedOpportunities,
      ])
        validateEvidence(
          finding.evidenceTurnIds.map((turnId) => ({ turnId, claim: finding.text })),
          turnIds,
        );

      const saved = await this.repository.saveReady(
        interviewId,
        generated,
        this.environment.GEMINI_MODEL,
      );
      if (!saved.count) return;
      const report = await this.repository.context(interviewId);
      const persisted = report ? await this.repository.findOwned(interviewId, report.userId) : null;
      if (persisted?.status === "READY")
        this.events.publish({
          name: "ReportGenerated",
          payload: {
            interviewId,
            report: {
              id: persisted.id,
              interviewId,
              status: persisted.status,
              evaluation: generated.evaluation,
              summary: generated.summary,
              evidence: generated.evidence,
              hiringRecommendation: generated.hiringRecommendation,
              failureReason: null,
              generatedAt: persisted.generatedAt!.toISOString(),
            },
            occurredAt: persisted.generatedAt!.toISOString(),
          },
        });
    } catch (error) {
      if (error instanceof AiProviderError)
        logSafeError(consoleLogger, "Report generation failed", error, {
          interviewId,
          category: error.category,
          diagnostic: error.diagnostic,
        });
      await this.repository.markFailed(interviewId, publicFailureReason(error));
      if (isRetryableAiError(error)) throw error;
    }
  }
}

const consoleLogger = {
  error: (payload: unknown, message?: string) => console.error(message, payload),
} as const;
