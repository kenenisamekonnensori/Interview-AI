import { randomUUID } from "node:crypto";

import { Queue, type JobsOptions } from "bullmq";
import { createRedisConnectionOptions } from "./redis-connection.js";

export type ReportJob = { interviewId: string; userId: string };

const options: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 5_000 },
  removeOnComplete: 500,
  removeOnFail: 1_000,
};

export function createReportQueue(redisUrl: string) {
  const queue = new Queue<ReportJob>("report-generation", {
    connection: createRedisConnectionOptions(redisUrl),
  });
  return {
    // Retain failed jobs for diagnostics while allowing a controlled retry to create a new job.
    // Repository claiming makes concurrent jobs harmless and prevents duplicate reports.
    enqueue: (job: ReportJob) =>
      queue.add("report-generation", job, {
        ...options,
        jobId: `report:${job.interviewId}:${randomUUID()}`,
      }),
    close: () => queue.close(),
  };
}
