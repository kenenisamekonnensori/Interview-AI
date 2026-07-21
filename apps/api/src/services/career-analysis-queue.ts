import { Queue, type JobsOptions } from "bullmq";
import { createRedisConnectionOptions } from "./redis-connection.js";

export type CareerAnalysisJob =
  | { kind: "resume"; resumeId: string; userId: string }
  | { kind: "job-description"; jobDescriptionId: string; userId: string }
  | { kind: "interview-plan"; interviewId: string; userId: string };

const options: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 5_000 },
  removeOnComplete: 500,
  removeOnFail: 1_000,
};

export function createCareerAnalysisQueue(redisUrl: string) {
  const queue = new Queue<CareerAnalysisJob>("career-analysis", {
    connection: createRedisConnectionOptions(redisUrl),
  });
  return {
    enqueue: (job: CareerAnalysisJob) =>
      queue.add(job.kind, job, {
        ...options,
        jobId: `${job.kind}:${job.kind === "resume" ? job.resumeId : job.kind === "job-description" ? job.jobDescriptionId : job.interviewId}`,
      }),
    close: () => queue.close(),
  };
}
