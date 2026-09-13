import { randomUUID } from "node:crypto";

import { Queue, type JobsOptions } from "bullmq";
import { createRedisConnectionOptions } from "./redis-connection.js";
import { observability } from "./observability.js";

export type BillingEventJob = { eventId: string; correlationId?: string };

const options: JobsOptions = {
  attempts: 5,
  backoff: { type: "exponential", delay: 5_000 },
  removeOnComplete: 1_000,
  removeOnFail: 2_000,
};

/**
 * Webhook deliveries are acknowledged as soon as the event is durably recorded,
 * and the subscription synchronization then runs here — off the request path, so
 * a slow dependency can never make Paddle time out and start redelivering.
 * Processing is idempotent, so an at-least-once job is harmless.
 */
export function createBillingEventQueue(redisUrl?: string) {
  if (!redisUrl) {
    return {
      enqueue: async (job: BillingEventJob) => {
        const correlationId = job.correlationId ?? randomUUID();
        observability().event("queue.job.bypassed", {
          queue: "billing-events",
          jobKind: "billing-event",
          correlationId,
          mode: "monolith",
        });
        return { id: `billing-event:${job.eventId}`, data: { ...job, correlationId } };
      },
      close: async () => {},
    };
  }
  const queue = new Queue<BillingEventJob>("billing-events", {
    connection: createRedisConnectionOptions(redisUrl),
  });
  return {
    enqueue: async (job: BillingEventJob) => {
      const correlationId = job.correlationId ?? randomUUID();
      const queued = await queue.add(
        "billing-event",
        { ...job, correlationId },
        { ...options, jobId: `billing-event:${job.eventId}:${randomUUID()}` },
      );
      observability().event("queue.job.enqueued", {
        queue: "billing-events",
        jobId: queued.id,
        correlationId,
      });
      return queued;
    },
    close: () => queue.close(),
  };
}
