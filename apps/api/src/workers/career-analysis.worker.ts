import { setTimeout as delay } from "node:timers/promises";

import { Worker } from "bullmq";
import { serverEnvironmentSchema } from "@interviewer-ai/config";

import { createAuthDatabase } from "../modules/auth/database.js";
import { extractResumeText } from "../modules/resumes/parser.js";
import { downloadResumeObject } from "../modules/resumes/storage.js";
import type { CareerAnalysisJob } from "../services/career-analysis-queue.js";

const environment = serverEnvironmentSchema.parse(process.env);
const database = createAuthDatabase(environment.DATABASE_URL);
const redis = new URL(environment.REDIS_URL);

async function structuredAnalysis(instructions: string, content: unknown) {
  if (!environment.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured.");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${environment.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: environment.OPENAI_ANALYSIS_MODEL,
      input: [
        { role: "developer", content: instructions },
        { role: "user", content },
      ],
      text: { format: { type: "json_object" } },
    }),
  });
  if (!response.ok) throw new Error(`OpenAI returned ${response.status}.`);
  const result = (await response.json()) as {
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };
  const text = result.output
    ?.flatMap((item) => item.content ?? [])
    .find((item) => item.type === "output_text")?.text;
  if (!text) throw new Error("OpenAI returned no analysis.");
  return JSON.parse(text) as Record<string, unknown>;
}

async function analyzeResume(resumeId: string) {
  const resume = await database.resume.findUnique({ where: { id: resumeId } });
  if (!resume || resume.status === "DELETED") return;
  try {
    const bytes = await downloadResumeObject(environment, resume.storageKey);
    const resumeText = await extractResumeText(bytes, resume.mimeType);
    const analysis = await structuredAnalysis(
      "Extract resume fields as JSON with summary, skills, technologies, experience, education, projects, certifications. Never invent facts.",
      resumeText,
    );
    await database.resumeAnalysis.upsert({
      where: { resumeId },
      create: {
        resumeId,
        summary: String(analysis.summary ?? ""),
        skills: analysis.skills ?? [],
        technologies: analysis.technologies ?? [],
        experience: analysis.experience ?? [],
        education: analysis.education ?? [],
        projects: analysis.projects ?? [],
        certifications: analysis.certifications ?? [],
        model: environment.OPENAI_ANALYSIS_MODEL,
      },
      update: {
        summary: String(analysis.summary ?? ""),
        skills: analysis.skills ?? [],
        technologies: analysis.technologies ?? [],
        experience: analysis.experience ?? [],
        education: analysis.education ?? [],
        projects: analysis.projects ?? [],
        certifications: analysis.certifications ?? [],
        model: environment.OPENAI_ANALYSIS_MODEL,
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
    const analysis = await structuredAnalysis(
      "Extract JSON with requiredSkills, preferredSkills, responsibilities, keywords, seniority, technologyStack from this job description. Never infer requirements.",
      job.rawText,
    );
    await database.jobAnalysis.upsert({
      where: { jobDescriptionId },
      create: {
        jobDescriptionId,
        requiredSkills: analysis.requiredSkills ?? [],
        preferredSkills: analysis.preferredSkills ?? [],
        responsibilities: analysis.responsibilities ?? [],
        keywords: analysis.keywords ?? [],
        seniority: typeof analysis.seniority === "string" ? analysis.seniority : null,
        technologyStack: analysis.technologyStack ?? [],
        model: environment.OPENAI_ANALYSIS_MODEL,
      },
      update: {
        requiredSkills: analysis.requiredSkills ?? [],
        preferredSkills: analysis.preferredSkills ?? [],
        responsibilities: analysis.responsibilities ?? [],
        keywords: analysis.keywords ?? [],
        seniority: typeof analysis.seniority === "string" ? analysis.seniority : null,
        technologyStack: analysis.technologyStack ?? [],
        model: environment.OPENAI_ANALYSIS_MODEL,
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

const worker = new Worker<CareerAnalysisJob>(
  "career-analysis",
  async (job) =>
    job.data.kind === "resume"
      ? analyzeResume(job.data.resumeId)
      : analyzeJobDescription(job.data.jobDescriptionId),
  {
    connection: {
      host: redis.hostname,
      port: Number(redis.port || 6379),
      password: redis.password || undefined,
    },
  },
);
await new Promise<void>((resolve) => process.once("SIGTERM", resolve));
await worker.close();
await database.$disconnect();
await delay(0);
