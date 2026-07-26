import { setTimeout as delay } from "node:timers/promises";

import { Worker } from "bullmq";
import { serverEnvironmentSchema } from "@interviewer-ai/config";

import { createAuthDatabase } from "../modules/auth/database.js";
import { InterviewEventPublisher } from "../modules/interviews/events.js";
import { ReportService } from "../modules/reports/service.js";
import { createReportQueue, type ReportJob } from "../services/report-queue.js";
import { createRedisConnectionOptions } from "../services/redis-connection.js";

const environment = serverEnvironmentSchema.parse(process.env);
const database = createAuthDatabase(environment.DATABASE_URL);
const queue = createReportQueue(environment.REDIS_URL);
const reports = new ReportService(
  database,
  environment,
  queue,
  new InterviewEventPublisher({ info: (payload, message) => console.info(message, payload) }),
);

const worker = new Worker<ReportJob>(
  "report-generation",
  async (job) => reports.generate(job.data.interviewId),
  { connection: createRedisConnectionOptions(environment.REDIS_URL, { worker: true }) },
);

await new Promise<void>((resolve) => process.once("SIGTERM", resolve));
await worker.close();
await queue.close();
await database.$disconnect();
await delay(0);
