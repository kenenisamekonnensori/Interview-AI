import { randomUUID } from "node:crypto";

import { Queue, type JobsOptions } from "bullmq";
import { createRedisConnectionOptions } from "./redis-connection.js";
import { observability } from "./observability.js";

export type ReportJob = { interviewId: string; userId: string; correlationId?: string };

const options: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 5_000 },
  removeOnComplete: 500,
  removeOnFail: 1_000,
};

export function createReportQueue(redisUrl?: string) {
  if (!redisUrl) {
    return {
      enqueue: async (job: ReportJob) => {
        const correlationId = job.correlationId ?? randomUUID();
        observability().event("queue.job.bypassed", {
          queue: "report-generation",
          correlationId,
          mode: "monolith",
        });
        return { id: `report:${job.interviewId}:${randomUUID()}`, data: { ...job, correlationId } };
      },
      close: async () => {},
    };
  }
  const queue = new Queue<ReportJob>("report-generation", {
    connection: createRedisConnectionOptions(redisUrl),
  });
  return {
    // Retain failed jobs for diagnostics while allowing a controlled retry to create a new job.
    // Repository claiming makes concurrent jobs harmless and prevents duplicate reports.
    enqueue: async (job: ReportJob) => {
      const correlationId = job.correlationId ?? randomUUID();
      const queued = await queue.add(
        "report-generation",
        { ...job, correlationId },
        {
          ...options,
          jobId: `report:${job.interviewId}:${randomUUID()}`,
        },
      );
      observability().event("queue.job.enqueued", {
        queue: "report-generation",
        jobId: queued.id,
        correlationId,
      });
      return queued;
    },
    close: () => queue.close(),
  };
}
