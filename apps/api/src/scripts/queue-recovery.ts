import "../load-environment.js";

import { Queue } from "bullmq";
import { serverEnvironmentSchema } from "@interviewer-ai/config";

import { createRedisConnectionOptions } from "../services/redis-connection.js";

const [action, queueName, jobId] = process.argv.slice(2);
const supportedQueues = new Set(["career-analysis", "report-generation"]);

if ((action !== "inspect" && action !== "retry") || !queueName || !supportedQueues.has(queueName)) {
  throw new Error(
    "Usage: queue-recovery <inspect|retry> <career-analysis|report-generation> [job-id]",
  );
}
if (action === "retry" && !jobId) throw new Error("A failed job ID is required for retry.");

const environment = serverEnvironmentSchema.parse(process.env);
if (!environment.REDIS_URL)
  throw new Error("REDIS_URL environment variable is required to run queue recovery.");
const queue = new Queue(queueName, {
  connection: createRedisConnectionOptions(environment.REDIS_URL),
});

try {
  if (action === "inspect") {
    const jobs = await queue.getFailed(0, 100);
    console.table(
      jobs.map((job) => ({
        id: job.id,
        name: job.name,
        attemptsMade: job.attemptsMade,
        failedReason: job.failedReason,
        finishedOn: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
      })),
    );
  } else {
    const job = await queue.getJob(jobId!);
    if (!job) throw new Error("Job not found.");
    if ((await job.getState()) !== "failed") throw new Error("Only failed jobs may be retried.");
    await job.retry();
    console.log(`Retried failed job ${job.id} on ${queueName}.`);
  }
} finally {
  await queue.close();
}
