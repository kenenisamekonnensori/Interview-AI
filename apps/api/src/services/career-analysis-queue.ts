import { randomUUID } from "node:crypto";

import { Queue, type JobsOptions } from "bullmq";
import { createRedisConnectionOptions } from "./redis-connection.js";
import { observability } from "./observability.js";

export type CareerAnalysisJob =
  | { kind: "resume"; resumeId: string; userId: string; correlationId?: string }
  | { kind: "job-description"; jobDescriptionId: string; userId: string; correlationId?: string }
  | { kind: "interview-plan"; interviewId: string; userId: string; correlationId?: string };

const options: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 10_000 },
  removeOnComplete: 500,
  removeOnFail: 1_000,
  stackTraceLimit: 1,
};

export const careerAnalysisJobOptions = options;

/** BullMQ reserves colons for its Redis key format, so custom IDs must not contain one. */
export function careerAnalysisJobId(job: CareerAnalysisJob) {
  const entityId =
    job.kind === "resume"
      ? job.resumeId
      : job.kind === "job-description"
        ? job.jobDescriptionId
        : job.interviewId;
  return `${job.kind}-${entityId}`;
}

export function createCareerAnalysisQueue(redisUrl?: string) {
  if (!redisUrl) {
    return {
      enqueue: async (job: CareerAnalysisJob) => {
        const correlationId = job.correlationId ?? randomUUID();
        observability().event("queue.job.bypassed", {
          queue: "career-analysis",
          jobKind: job.kind,
          correlationId,
          mode: "monolith",
        });
        return { id: careerAnalysisJobId(job), data: { ...job, correlationId } };
      },
      close: async () => {},
    };
  }
  const queue = new Queue<CareerAnalysisJob>("career-analysis", {
    connection: createRedisConnectionOptions(redisUrl),
  });
  return {
    enqueue: async (job: CareerAnalysisJob) => {
      const correlationId = job.correlationId ?? randomUUID();
      const queued = await queue.add(
        job.kind,
        { ...job, correlationId },
        {
          ...options,
          jobId: careerAnalysisJobId(job),
        },
      );
      observability().event("queue.job.enqueued", {
        queue: "career-analysis",
        jobId: queued.id,
        correlationId,
      });
      return queued;
    },
    close: () => queue.close(),
  };
}
