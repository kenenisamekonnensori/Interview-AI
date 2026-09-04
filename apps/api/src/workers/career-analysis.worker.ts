import "../load-environment.js";

import { Worker } from "bullmq";
import { serverEnvironmentSchema } from "@interviewer-ai/config";

import { createAuthDatabase } from "../modules/auth/database.js";
import type { CareerAnalysisJob } from "../services/career-analysis-queue.js";
import { createRedisConnectionOptions } from "../services/redis-connection.js";
import {
  configureObservability,
  observability,
  withCorrelationId,
} from "../services/observability.js";
import {
  installWorkerShutdown,
  processQueueJob,
  type QueueFailure,
} from "../services/queue-worker.js";
import { analyzeResume, markResumeAnalysisFailed } from "../services/resume-analysis.service.js";
import { analyzeJobDescription, markJobAnalysisFailed } from "../services/job-analysis.service.js";
import { planInterview, markInterviewPlanFailed } from "../services/interview-plan.service.js";

/**
 * Career Analysis Worker (Worker Mode - Future Architecture).
 * Preserved intact for multi-process worker deployments.
 * Delegates processing to the reusable application services.
 */

const environment = serverEnvironmentSchema.parse(process.env);
const database = createAuthDatabase(environment.DATABASE_URL);
configureObservability(console);

async function markTerminalFailure(job: CareerAnalysisJob, failure: QueueFailure) {
  if (job.kind === "resume") {
    await markResumeAnalysisFailed(database, job.resumeId, job.userId);
  } else if (job.kind === "job-description") {
    await markJobAnalysisFailed(database, job.jobDescriptionId, job.userId);
  } else {
    await markInterviewPlanFailed(database, job.interviewId, job.userId);
  }
  observability().event("queue.job.terminal-failure-recorded", {
    queue: "career-analysis",
    jobKind: job.kind,
    failureCode: failure.code,
  });
}

const worker = new Worker<CareerAnalysisJob>(
  "career-analysis",
  async (job) =>
    withCorrelationId(job.data.correlationId, () =>
      processQueueJob(job, {
        queue: "career-analysis",
        execute: () =>
          job.data.kind === "resume"
            ? analyzeResume(database, environment, job.data.resumeId, job.data.userId)
            : job.data.kind === "job-description"
              ? analyzeJobDescription(database, environment, job.data.jobDescriptionId)
              : planInterview(database, environment, job.data.interviewId),
        onTerminalFailure: (failure) => markTerminalFailure(job.data, failure),
      }),
    ),
  {
    connection: createRedisConnectionOptions(environment.REDIS_URL!, { worker: true }),
  },
);
worker.on("active", (job) => {
  observability().event("queue.job.started", {
    queue: "career-analysis",
    jobId: job.id,
    jobName: job.name,
    correlationId: job.data.correlationId,
  });
});
worker.on("completed", (job) => {
  observability().metric("queue.job.duration_ms", Date.now() - job.timestamp, {
    queue: "career-analysis",
    jobId: job.id,
    correlationId: job.data.correlationId,
  });
});
worker.on("failed", (job, error) => {
  observability().event("queue.job.failed", {
    queue: "career-analysis",
    jobId: job?.id,
    correlationId: job?.data.correlationId,
    errorType: error?.name,
  });
});
await new Promise<void>((resolve) => {
  const shutdown = installWorkerShutdown({
    worker,
    closeDependencies: () => database.$disconnect(),
  });
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => void shutdown(signal).finally(resolve));
  }
});
