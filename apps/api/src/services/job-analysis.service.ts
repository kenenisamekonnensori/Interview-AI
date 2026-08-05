import { z } from "zod";
import type { PrismaClient } from "../../prisma/generated/client.js";
import type { ServerEnvironment } from "@interviewer-ai/config";
import { createAiProvider } from "../modules/ai/index.js";

const stringListSchema = z.array(z.string().trim().min(1)).max(100);

export const jobAnalysisSchema = z.object({
  requiredSkills: stringListSchema,
  preferredSkills: stringListSchema,
  responsibilities: stringListSchema,
  keywords: stringListSchema,
  seniority: z.string().trim().min(1).max(100).nullable(),
  technologyStack: stringListSchema,
});

export type JobAnalysisOutput = z.infer<typeof jobAnalysisSchema>;

/**
 * Core business logic for job description analysis.
 * Reused by both Monolith Mode (direct execution) and Worker Mode (career-analysis.worker.ts).
 */
export async function analyzeJobDescription(
  database: PrismaClient,
  environment: ServerEnvironment,
  jobDescriptionId: string,
) {
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
  const aiProvider = createAiProvider(environment);
  const analysis = await aiProvider.generateStructured(
    {
      instructions:
        "Extract JSON with requiredSkills, preferredSkills, responsibilities, keywords, seniority, technologyStack from this job description. Never infer requirements.",
      context: job.rawText,
    },
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

export async function markJobAnalysisFailed(
  database: PrismaClient,
  jobDescriptionId: string,
  userId: string,
) {
  await database.jobDescription.updateMany({
    where: { id: jobDescriptionId, userId, status: { not: "DELETED" } },
    data: { status: "FAILED" },
  });
}
