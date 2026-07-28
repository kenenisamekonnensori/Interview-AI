import "../load-environment.js";

import { Worker } from "bullmq";
import { serverEnvironmentSchema } from "@interviewer-ai/config";
import { buildInterviewPlanPrompt } from "@interviewer-ai/prompts";
import { interviewPlanSchema } from "@interviewer-ai/types";
import { z } from "zod";

import { createAuthDatabase } from "../modules/auth/database.js";
import { createAiProvider } from "../modules/ai/index.js";
import { extractResumeText } from "../modules/resumes/parser.js";
import { downloadResumeObject } from "../modules/resumes/storage.js";
import type { CareerAnalysisJob } from "../services/career-analysis-queue.js";
import { createRedisConnectionOptions } from "../services/redis-connection.js";
import {
  configureObservability,
  observability,
  withCorrelationId,
} from "../services/observability.js";
import { assertInterviewTransition } from "../modules/conversation/state-machine.js";
import {
  installWorkerShutdown,
  processQueueJob,
  type QueueFailure,
} from "../services/queue-worker.js";

const environment = serverEnvironmentSchema.parse(process.env);
const database = createAuthDatabase(environment.DATABASE_URL);
const aiProvider = createAiProvider(environment);
configureObservability(console);

const stringListSchema = z.array(z.string().trim().min(1)).max(100);
const resumeAnalysisSchema = z.object({
  summary: z.string().trim().min(1).max(4_000),
  skills: stringListSchema,
  technologies: stringListSchema,
  experience: z
    .array(
      z.object({
        company: z.string().trim().min(1).max(200).nullable(),
        title: z.string().trim().min(1).max(200).nullable(),
        highlights: stringListSchema,
      }),
    )
    .max(50),
  education: stringListSchema,
  projects: stringListSchema,
  certifications: stringListSchema,
});
const jobAnalysisSchema = z.object({
  requiredSkills: stringListSchema,
  preferredSkills: stringListSchema,
  responsibilities: stringListSchema,
  keywords: stringListSchema,
  seniority: z.string().trim().min(1).max(100).nullable(),
  technologyStack: stringListSchema,
});
async function structuredAnalysis<T>(
  instructions: string,
  content: unknown,
  parse: (value: unknown) => T,
) {
  return aiProvider.generateStructured({ instructions, context: content }, parse);
}

async function analyzeResume(resumeId: string, userId: string) {
  const resume = await database.resume.findUnique({
    where: { id: resumeId },
    include: { analysis: true },
  });
  if (!resume || resume.userId !== userId || resume.status === "DELETED") return;
  if (resume.analysis && resume.status === "ANALYZING") {
    await database.resume.update({ where: { id: resumeId }, data: { status: "ANALYZED" } });
    return;
  }
  const bytes = await downloadResumeObject(environment, resume);
  const resumeText = await extractResumeText(bytes, resume.mimeType);
  const analysis = await structuredAnalysis(
    "Extract resume fields as JSON with summary, skills, technologies, experience, education, projects, certifications. Never invent facts.",
    resumeText,
    resumeAnalysisSchema.parse,
  );
  await database.resumeAnalysis.upsert({
    where: { resumeId },
    create: { resumeId, ...analysis, model: environment.GEMINI_MODEL },
    update: { ...analysis, model: environment.GEMINI_MODEL, generatedAt: new Date() },
  });
  await database.resume.updateMany({
    where: { id: resumeId, status: { in: ["ANALYZING", "READY"] } },
    data: { status: "ANALYZED" },
  });
}

async function analyzeJobDescription(jobDescriptionId: string) {
  const job = await database.jobDescription.findUnique({
    where: { id: jobDescriptionId },
    include: { analysis: true },
  });
  if (!job || job.status === "DELETED") return;
  if (job.analysis && job.status === "ANALYZING") {
    await database.jobDescription.update({
      where: { id: jobDescriptionId },
      data: { status: "ANALYZED" },
    });
    return;
  }
  const analysis = await structuredAnalysis(
    "Extract JSON with requiredSkills, preferredSkills, responsibilities, keywords, seniority, technologyStack from this job description. Never infer requirements.",
    job.rawText,
    jobAnalysisSchema.parse,
  );
  await database.jobAnalysis.upsert({
    where: { jobDescriptionId },
    create: { jobDescriptionId, ...analysis, model: environment.GEMINI_MODEL },
    update: { ...analysis, model: environment.GEMINI_MODEL, generatedAt: new Date() },
  });
  await database.jobDescription.updateMany({
    where: { id: jobDescriptionId, status: { in: ["ANALYZING", "READY"] } },
    data: { status: "ANALYZED" },
  });
}

async function planInterview(interviewId: string) {
  const interview = await database.interview.findUnique({
    where: { id: interviewId },
    include: {
      user: { include: { profile: true } },
      resume: { include: { analysis: true } },
      jobDescription: { include: { analysis: true } },
      plan: true,
    },
  });
  if (!interview || interview.status !== "PREPARING") return;
  if (interview.plan) {
    await database.interview.updateMany({
      where: { id: interviewId, status: "PREPARING" },
      data: { status: "READY" },
    });
    return;
  }
  const context = {
    configuration: {
      interviewType: interview.interviewType,
      difficulty: interview.difficulty,
      durationMinutes: interview.durationMinutes,
      language: interview.language,
      targetRole: interview.targetRole,
    },
    candidateProfile: interview.user.profile
      ? {
          profession: interview.user.profile.profession,
          seniority: interview.user.profile.seniority,
          yearsOfExperience: interview.user.profile.yearsOfExperience,
        }
      : null,
    resume: interview.resume?.deletedAt ? null : interview.resume?.analysis,
    jobDescription: interview.jobDescription?.deletedAt ? null : interview.jobDescription?.analysis,
  };
  const plan = await structuredAnalysis(
    buildInterviewPlanPrompt(),
    context,
    interviewPlanSchema.parse,
  );
  await database.interviewPlan.upsert({
    where: { interviewId },
    create: { interviewId, ...plan, model: environment.GEMINI_MODEL },
    update: { ...plan, model: environment.GEMINI_MODEL, generatedAt: new Date(), version: 1 },
  });
  assertInterviewTransition(interview.status, "READY");
  await database.interview.updateMany({
    where: { id: interviewId, status: "PREPARING" },
    data: { status: "READY" },
  });
}

async function markTerminalFailure(job: CareerAnalysisJob, failure: QueueFailure) {
  if (job.kind === "resume") {
    await database.resume.updateMany({
      where: { id: job.resumeId, userId: job.userId, status: { not: "DELETED" } },
      data: { status: "FAILED" },
    });
  } else if (job.kind === "job-description") {
    await database.jobDescription.updateMany({
      where: { id: job.jobDescriptionId, userId: job.userId, status: { not: "DELETED" } },
      data: { status: "FAILED" },
    });
  } else {
    await database.interview.updateMany({
      where: { id: job.interviewId, userId: job.userId, status: "PREPARING" },
      data: { status: "FAILED" },
    });
  }
  observability().event("queue.job.terminal-failure-recorded", {
    queue: "career-analysis",
    jobKind: job.kind,
    failureCode: failure.code,
  });
}

const worker = new Worker<CareerAnalysisJob>(
  "career-analysis",
  async (job) =>
    withCorrelationId(job.data.correlationId, () =>
      processQueueJob(job, {
        queue: "career-analysis",
        execute: () =>
          job.data.kind === "resume"
            ? analyzeResume(job.data.resumeId, job.data.userId)
            : job.data.kind === "job-description"
              ? analyzeJobDescription(job.data.jobDescriptionId)
              : planInterview(job.data.interviewId),
        onTerminalFailure: (failure) => markTerminalFailure(job.data, failure),
      }),
    ),
  {
    connection: createRedisConnectionOptions(environment.REDIS_URL, { worker: true }),
  },
);
worker.on("active", (job) => {
  observability().event("queue.job.started", {
    queue: "career-analysis",
    jobId: job.id,
    jobName: job.name,
    correlationId: job.data.correlationId,
  });
});
worker.on("completed", (job) => {
  observability().metric("queue.job.duration_ms", Date.now() - job.timestamp, {
    queue: "career-analysis",
    jobId: job.id,
    correlationId: job.data.correlationId,
  });
});
worker.on("failed", (job, error) => {
  observability().event("queue.job.failed", {
    queue: "career-analysis",
    jobId: job?.id,
    correlationId: job?.data.correlationId,
    errorType: error?.name,
  });
});
await new Promise<void>((resolve) => {
  const shutdown = installWorkerShutdown({
    worker,
    closeDependencies: () => database.$disconnect(),
  });
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => void shutdown(signal).finally(resolve));
  }
});
