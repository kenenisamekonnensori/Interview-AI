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

export class ReportLifecycleError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ReportLifecycleError";
  }
}

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

export class ReportService {
  readonly repository: ReportRepository;
  private readonly aiProvider;

  constructor(
    database: PrismaClient,
    private readonly environment: ServerEnvironment,
    private readonly queue: ReturnType<typeof createReportQueue>,
    private readonly events: InterviewEventPublisher,
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
    const changed = await this.repository.retry(interviewId, userId);
    if (!changed.count) {
      const report = await this.repository.findOwned(interviewId, userId);
      if (!report) throw new ReportLifecycleError("REPORT_NOT_FOUND", "Report not found.");
      throw new ReportLifecycleError("REPORT_NOT_RETRYABLE", "This report is not ready to retry.");
    }
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
      const generated = generatedReportSchema.parse(
        await this.aiProvider.generateReport({
          instructions: `${buildEvaluationPrompt()}\n${buildReportPrompt()} Return only the required JSON. Every evidence reference and evidenceTurnIds value must be a supplied transcript turn id. Do not make claims without transcript evidence.`,
          context: {
            interview: {
              interviewType: interview.interviewType,
              difficulty: interview.difficulty,
              durationMinutes: interview.durationMinutes,
              targetRole: interview.targetRole,
            },
            plan: interview.plan,
            resumeAnalysis: interview.resume?.analysis,
            jobAnalysis: interview.jobDescription?.analysis,
            memory: interview.memory,
            transcript: turns,
          },
        }),
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
        console.error("Report generation failed", {
          interviewId,
          category: error.category,
          diagnostic: error.diagnostic,
        });
      await this.repository.markFailed(interviewId, publicFailureReason(error));
      if (isRetryableAiError(error)) throw error;
    }
  }
}
