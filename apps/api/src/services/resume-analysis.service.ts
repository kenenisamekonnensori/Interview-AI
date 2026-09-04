import { z } from "zod";
import type { PrismaClient } from "../../prisma/generated/client.js";
import type { ServerEnvironment } from "@interviewer-ai/config";
import { createAiProvider } from "../modules/ai/index.js";
import { downloadResumeObject } from "../modules/resumes/storage.js";
import { extractResumeText } from "../modules/resumes/parser.js";

const stringListSchema = z.array(z.string().trim().min(1)).max(100);

export const resumeAnalysisSchema = z.object({
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

export type ResumeAnalysisOutput = z.infer<typeof resumeAnalysisSchema>;

/**
 * Core business logic for resume analysis.
 * Reused by both Monolith Mode (direct execution) and Worker Mode (career-analysis.worker.ts).
 */
export async function analyzeResume(
  database: PrismaClient,
  environment: ServerEnvironment,
  resumeId: string,
  userId: string,
) {
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
  const aiProvider = createAiProvider(environment);
  const analysis = await aiProvider.generateStructured(
    {
      instructions:
        "Extract resume fields as JSON with summary, skills, technologies, experience, education, projects, certifications. Never invent facts.",
      context: resumeText,
    },
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

export async function markResumeAnalysisFailed(
  database: PrismaClient,
  resumeId: string,
  userId: string,
) {
  await database.resume.updateMany({
    where: { id: resumeId, userId, status: { not: "DELETED" } },
    data: { status: "FAILED" },
  });
}
