import { Worker } from "bullmq";
import { serverEnvironmentSchema } from "@interviewer-ai/config";

import { createAuthDatabase } from "../modules/auth/database.js";
import { InterviewEventPublisher } from "../modules/interviews/events.js";
import { ReportService } from "../modules/reports/service.js";
import { createReportQueue, type ReportJob } from "../services/report-queue.js";
import { createRedisConnectionOptions } from "../services/redis-connection.js";
import {
  configureObservability,
  observability,
  withCorrelationId,
} from "../services/observability.js";
import { installWorkerShutdown } from "../services/queue-worker.js";

const environment = serverEnvironmentSchema.parse(process.env);
const database = createAuthDatabase(environment.DATABASE_URL);
configureObservability(console);
const queue = createReportQueue(environment.REDIS_URL);
const reports = new ReportService(
  database,
  environment,
  queue,
  new InterviewEventPublisher({ info: (payload, message) => console.info(message, payload) }),
);

const worker = new Worker<ReportJob>(
  "report-generation",
  async (job) =>
    withCorrelationId(job.data.correlationId, () => reports.generate(job.data.interviewId)),
  { connection: createRedisConnectionOptions(environment.REDIS_URL, { worker: true }) },
);
worker.on("active", (job) => {
  observability().event("queue.job.started", {
    queue: "report-generation",
    jobId: job.id,
    correlationId: job.data.correlationId,
  });
});
worker.on("completed", (job) => {
  observability().metric("queue.job.duration_ms", Date.now() - job.timestamp, {
    queue: "report-generation",
    jobId: job.id,
    correlationId: job.data.correlationId,
  });
});
worker.on("failed", (job, error) => {
  observability().event("queue.job.failed", {
    queue: "report-generation",
    jobId: job?.id,
    correlationId: job?.data.correlationId,
    errorType: error?.name,
  });
});

await new Promise<void>((resolve) => {
  const shutdown = installWorkerShutdown({
    worker,
    closeDependencies: async () => {
      await queue.close();
      await database.$disconnect();
    },
  });
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => void shutdown(signal).finally(resolve));
  }
});
