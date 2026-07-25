import { setTimeout as delay } from "node:timers/promises";

import { Worker } from "bullmq";
import { serverEnvironmentSchema } from "@interviewer-ai/config";
import { interviewPlanSchema } from "@interviewer-ai/types";
import { z } from "zod";

import { createAuthDatabase } from "../modules/auth/database.js";
import { createAiProvider } from "../modules/ai/index.js";
import { extractResumeText } from "../modules/resumes/parser.js";
import { downloadResumeObject } from "../modules/resumes/storage.js";
import type { CareerAnalysisJob } from "../services/career-analysis-queue.js";
import { createRedisConnectionOptions } from "../services/redis-connection.js";
import { assertInterviewTransition } from "../modules/conversation/state-machine.js";

const environment = serverEnvironmentSchema.parse(process.env);
const database = createAuthDatabase(environment.DATABASE_URL);
const aiProvider = createAiProvider(environment);

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
async function structuredAnalysis(instructions: string, content: unknown) {
  return aiProvider.generateStructured({ instructions, context: content }, (value) => value);
}

async function analyzeResume(resumeId: string) {
  const resume = await database.resume.findUnique({ where: { id: resumeId } });
  if (!resume || resume.status === "DELETED") return;
  try {
    const bytes = await downloadResumeObject(environment, resume.storageKey);
    const resumeText = await extractResumeText(bytes, resume.mimeType);
    const analysis = resumeAnalysisSchema.parse(
      await structuredAnalysis(
        "Extract resume fields as JSON with summary, skills, technologies, experience, education, projects, certifications. Never invent facts.",
        resumeText,
      ),
    );
    await database.resumeAnalysis.upsert({
      where: { resumeId },
      create: {
        resumeId,
        ...analysis,
        model: environment.GEMINI_MODEL,
      },
      update: {
        ...analysis,
        model: environment.GEMINI_MODEL,
        generatedAt: new Date(),
      },
    });
    await database.resume.update({ where: { id: resumeId }, data: { status: "ANALYZED" } });
  } catch (error) {
    await database.resume.update({ where: { id: resumeId }, data: { status: "FAILED" } });
    throw error;
  }
}

async function analyzeJobDescription(jobDescriptionId: string) {
  const job = await database.jobDescription.findUnique({ where: { id: jobDescriptionId } });
  if (!job || job.status === "DELETED") return;
  try {
    const analysis = jobAnalysisSchema.parse(
      await structuredAnalysis(
        "Extract JSON with requiredSkills, preferredSkills, responsibilities, keywords, seniority, technologyStack from this job description. Never infer requirements.",
        job.rawText,
      ),
    );
    await database.jobAnalysis.upsert({
      where: { jobDescriptionId },
      create: {
        jobDescriptionId,
        ...analysis,
        model: environment.GEMINI_MODEL,
      },
      update: {
        ...analysis,
        model: environment.GEMINI_MODEL,
        generatedAt: new Date(),
      },
    });
    await database.jobDescription.update({
      where: { id: jobDescriptionId },
      data: { status: "ANALYZED" },
    });
  } catch (error) {
    await database.jobDescription.update({
      where: { id: jobDescriptionId },
      data: { status: "FAILED" },
    });
    throw error;
  }
}

async function planInterview(interviewId: string) {
  const interview = await database.interview.findUnique({
    where: { id: interviewId },
    include: {
      resume: { include: { analysis: true } },
      jobDescription: { include: { analysis: true } },
    },
  });
  if (!interview || interview.status !== "PREPARING") return;
  try {
    const context = {
      configuration: {
        interviewType: interview.interviewType,
        difficulty: interview.difficulty,
        durationMinutes: interview.durationMinutes,
        language: interview.language,
        targetRole: interview.targetRole,
      },
      resume: interview.resume?.analysis,
      jobDescription: interview.jobDescription?.analysis,
    };
    const plan = interviewPlanSchema.parse(
      await structuredAnalysis(
        "Create a realistic interview plan. Cover the role requirements and candidate evidence. Allocate no more than the requested duration. Do not expose this plan to the candidate.",
        context,
      ),
    );
    await database.interviewPlan.upsert({
      where: { interviewId },
      create: { interviewId, ...plan, model: environment.GEMINI_MODEL },
      update: {
        ...plan,
        model: environment.GEMINI_MODEL,
        generatedAt: new Date(),
        version: { increment: 1 },
      },
    });
    assertInterviewTransition(interview.status, "READY");
    await database.interview.update({ where: { id: interviewId }, data: { status: "READY" } });
  } catch (error) {
    assertInterviewTransition(interview.status, "FAILED");
    await database.interview.update({ where: { id: interviewId }, data: { status: "FAILED" } });
    throw error;
  }
}

const worker = new Worker<CareerAnalysisJob>(
  "career-analysis",
  async (job) =>
    job.data.kind === "resume"
      ? analyzeResume(job.data.resumeId)
      : job.data.kind === "job-description"
        ? analyzeJobDescription(job.data.jobDescriptionId)
        : planInterview(job.data.interviewId),
  {
    connection: createRedisConnectionOptions(environment.REDIS_URL, { worker: true }),
  },
);
await new Promise<void>((resolve) => process.once("SIGTERM", resolve));
await worker.close();
await database.$disconnect();
await delay(0);
