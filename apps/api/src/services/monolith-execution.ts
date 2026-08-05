import type { PrismaClient } from "../../prisma/generated/client.js";
import type { ServerEnvironment } from "@interviewer-ai/config";
import { observability, withCorrelationId } from "./observability.js";
import { analyzeResume, markResumeAnalysisFailed } from "./resume-analysis.service.js";
import { analyzeJobDescription, markJobAnalysisFailed } from "./job-analysis.service.js";
import { planInterview, markInterviewPlanFailed } from "./interview-plan.service.js";
import type { ReportService } from "../modules/reports/service.js";
import { processNextAuthEmail } from "./auth-email.service.js";

/**
 * Checks whether the backend is running in Monolith Mode (default pre-user stage)
 * or Worker Mode (future production architecture with dedicated workers).
 */
export function isMonolithMode(): boolean {
  return process.env.WORKER_MODE !== "true";
}

/**
 * Monolith Execution Manager.
 * Executes background operations directly inside the API process when running in Monolith Mode.
 */
export class MonolithExecutionManager {
  constructor(
    private readonly database: PrismaClient,
    private readonly environment: ServerEnvironment,
  ) {}

  dispatchResumeAnalysis(resumeId: string, userId: string, correlationId?: string): boolean {
    if (!isMonolithMode()) return false;

    console.info(`[Monolith Mode] Running resume analysis directly for resume ${resumeId}`);
    observability().event("monolith.execution.started", {
      task: "resume-analysis",
      resumeId,
      userId,
      correlationId,
    });

    setImmediate(() => {
      withCorrelationId(correlationId, async () => {
        try {
          await analyzeResume(this.database, this.environment, resumeId, userId);
          observability().event("monolith.execution.completed", {
            task: "resume-analysis",
            resumeId,
          });
        } catch (error) {
          observability().event("monolith.execution.failed", {
            task: "resume-analysis",
            resumeId,
            error: error instanceof Error ? error.message : String(error),
          });
          await markResumeAnalysisFailed(this.database, resumeId, userId);
        }
      });
    });

    return true;
  }

  dispatchJobAnalysis(jobDescriptionId: string, userId: string, correlationId?: string): boolean {
    if (!isMonolithMode()) return false;

    console.info(
      `[Monolith Mode] Running job description analysis directly for job ${jobDescriptionId}`,
    );
    observability().event("monolith.execution.started", {
      task: "job-analysis",
      jobDescriptionId,
      userId,
      correlationId,
    });

    setImmediate(() => {
      withCorrelationId(correlationId, async () => {
        try {
          await analyzeJobDescription(this.database, this.environment, jobDescriptionId);
          observability().event("monolith.execution.completed", {
            task: "job-analysis",
            jobDescriptionId,
          });
        } catch (error) {
          observability().event("monolith.execution.failed", {
            task: "job-analysis",
            jobDescriptionId,
            error: error instanceof Error ? error.message : String(error),
          });
          await markJobAnalysisFailed(this.database, jobDescriptionId, userId);
        }
      });
    });

    return true;
  }

  dispatchInterviewPlan(interviewId: string, userId: string, correlationId?: string): boolean {
    if (!isMonolithMode()) return false;

    console.info(
      `[Monolith Mode] Running interview plan generation directly for interview ${interviewId}`,
    );
    observability().event("monolith.execution.started", {
      task: "interview-plan",
      interviewId,
      userId,
      correlationId,
    });

    setImmediate(() => {
      withCorrelationId(correlationId, async () => {
        try {
          await planInterview(this.database, this.environment, interviewId);
          observability().event("monolith.execution.completed", {
            task: "interview-plan",
            interviewId,
          });
        } catch (error) {
          observability().event("monolith.execution.failed", {
            task: "interview-plan",
            interviewId,
            error: error instanceof Error ? error.message : String(error),
          });
          await markInterviewPlanFailed(this.database, interviewId, userId);
        }
      });
    });

    return true;
  }

  dispatchReportGeneration(
    reportService: ReportService,
    interviewId: string,
    correlationId?: string,
  ): boolean {
    if (!isMonolithMode()) return false;

    console.info(`[Monolith Mode] Running report generation directly for interview ${interviewId}`);
    observability().event("monolith.execution.started", {
      task: "report-generation",
      interviewId,
      correlationId,
    });

    setImmediate(() => {
      withCorrelationId(correlationId, async () => {
        try {
          await reportService.generate(interviewId);
          observability().event("monolith.execution.completed", {
            task: "report-generation",
            interviewId,
          });
        } catch (error) {
          observability().event("monolith.execution.failed", {
            task: "report-generation",
            interviewId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });
    });

    return true;
  }

  dispatchAuthEmail(correlationId?: string): boolean {
    if (!isMonolithMode()) return false;

    console.info(`[Monolith Mode] Processing auth email outbox directly`);
    setImmediate(() => {
      withCorrelationId(correlationId, async () => {
        try {
          await processNextAuthEmail(this.database, this.environment);
        } catch (error) {
          observability().event("monolith.execution.failed", {
            task: "auth-email",
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });
    });

    return true;
  }
}
