import "../load-environment.js";

import { Worker } from "bullmq";
import { serverEnvironmentSchema } from "@interviewer-ai/config";

import { createAuthDatabase } from "../modules/auth/database.js";
import { BillingEventProcessor } from "../modules/billing/billing-event-processor.js";
import { BillingRepository } from "../modules/billing/repository.js";
import { createBillingEventQueue, type BillingEventJob } from "../services/billing-event-queue.js";
import { createRedisConnectionOptions } from "../services/redis-connection.js";
import {
  configureObservability,
  observability,
  withCorrelationId,
} from "../services/observability.js";
import { installWorkerShutdown } from "../services/queue-worker.js";

/**
 * Billing Webhook Worker (Worker Mode).
 * Processes persisted Paddle webhook events off the request path. Processing is
 * idempotent, so at-least-once delivery and retries are both safe.
 */

const environment = serverEnvironmentSchema.parse(process.env);
if (!environment.REDIS_URL) {
  throw new Error("REDIS_URL is required to run the billing worker.");
}
const database = createAuthDatabase(environment.DATABASE_URL);
configureObservability(console);

const repository = new BillingRepository(database);
const processor = new BillingEventProcessor(environment, repository);
const queue = createBillingEventQueue(environment.REDIS_URL);

const worker = new Worker<BillingEventJob>(
  "billing-events",
  async (job) =>
    withCorrelationId(job.data.correlationId, () => processor.process(job.data.eventId)),
  { connection: createRedisConnectionOptions(environment.REDIS_URL, { worker: true }) },
);

worker.on("active", (job) => {
  observability().event("queue.job.started", {
    queue: "billing-events",
    jobId: job.id,
    correlationId: job.data.correlationId,
  });
});
worker.on("completed", (job) => {
  observability().metric("queue.job.duration_ms", Date.now() - job.timestamp, {
    queue: "billing-events",
    jobId: job.id,
    correlationId: job.data.correlationId,
  });
});
worker.on("failed", (job, error) => {
  observability().event("queue.job.failed", {
    queue: "billing-events",
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
