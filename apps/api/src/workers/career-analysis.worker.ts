import { setTimeout as delay } from "node:timers/promises";

import { Worker } from "bullmq";
import { serverEnvironmentSchema } from "@interviewer-ai/config";
import { z } from "zod";

import { createAuthDatabase } from "../modules/auth/database.js";
import { extractResumeText } from "../modules/resumes/parser.js";
import { downloadResumeObject } from "../modules/resumes/storage.js";
import type { CareerAnalysisJob } from "../services/career-analysis-queue.js";
import { createRedisConnectionOptions } from "../services/redis-connection.js";

const environment = serverEnvironmentSchema.parse(process.env);
const database = createAuthDatabase(environment.DATABASE_URL);

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
const interviewPlanSchema = z.object({
  objectives: stringListSchema.min(1).max(8),
  topics: z
    .array(
      z.object({
        topic: z.string().trim().min(1).max(160),
        priority: z.enum(["HIGH", "MEDIUM", "LOW"]),
        minutes: z.number().int().min(1).max(60),
      }),
    )
    .min(1)
    .max(12),
  evaluationRubric: stringListSchema.min(1).max(12),
  timeline: z
    .array(
      z.object({
        phase: z.string().trim().min(1).max(100),
        minutes: z.number().int().min(1).max(60),
      }),
    )
    .min(1)
    .max(10),
  followUpStrategy: z.string().trim().min(1).max(1_000),
  fallbackStrategy: z.string().trim().min(1).max(1_000),
});

async function structuredAnalysis(instructions: string, content: unknown) {
  if (!environment.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured.");
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${environment.GEMINI_MODEL}:generateContent?key=${environment.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: instructions }] },
        contents: [
          {
            role: "user",
            parts: [{ text: typeof content === "string" ? content : JSON.stringify(content) }],
          },
        ],
        generationConfig: { responseMimeType: "application/json" },
      }),
    },
  );
  if (!response.ok) throw new Error(`Gemini returned ${response.status}.`);
  const result = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no analysis.");
  return JSON.parse(text) as unknown;
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
        JSON.stringify(context),
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
    await database.interview.update({ where: { id: interviewId }, data: { status: "READY" } });
  } catch (error) {
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
