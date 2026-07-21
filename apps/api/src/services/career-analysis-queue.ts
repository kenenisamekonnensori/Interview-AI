import { Queue, type JobsOptions } from "bullmq";
import type { RedisOptions } from "ioredis";

export type CareerAnalysisJob =
  | { kind: "resume"; resumeId: string; userId: string }
  | { kind: "job-description"; jobDescriptionId: string; userId: string };

const options: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 5_000 },
  removeOnComplete: 500,
  removeOnFail: 1_000,
};

export function createCareerAnalysisQueue(redisUrl: string) {
  const connection = new URL(redisUrl);
  const queue = new Queue<CareerAnalysisJob>("career-analysis", {
    connection: {
      host: connection.hostname,
      port: Number(connection.port || 6379),
      password: connection.password || undefined,
    } satisfies RedisOptions,
  });
  return {
    enqueue: (job: CareerAnalysisJob) =>
      queue.add(job.kind, job, {
        ...options,
        jobId: `${job.kind}:${job.kind === "resume" ? job.resumeId : job.jobDescriptionId}`,
      }),
    close: () => queue.close(),
  };
}
