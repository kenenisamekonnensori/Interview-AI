import { safetyPrivacyPrompt, untrustedDocumentGuard } from "@interviewer-ai/prompts";
import { z } from "zod";
import type { PrismaClient } from "../../prisma/generated/client.js";
import type { ServerEnvironment } from "@interviewer-ai/config";
import { createAiProvider } from "../modules/ai/index.js";
import { AiProviderError } from "../modules/ai/errors.js";
import { downloadResumeObject } from "../modules/resumes/storage.js";
import { ResumeParseError } from "../modules/resumes/parser.js";
import { ResumeStorageConfigurationError, ResumeStorageError } from "../modules/resumes/storage.js";
import { extractResumeText } from "../modules/resumes/parser.js";

const stringOrItemSchema = z.union([
  z.string().trim().min(1),
  z.object({ name: z.string().trim().min(1) }).transform((o) => o.name),
  z.object({ skill: z.string().trim().min(1) }).transform((o) => o.skill),
  z.object({ technology: z.string().trim().min(1) }).transform((o) => o.technology),
]);

const experienceItemSchema = z
  .object({
    company: z.string().trim().max(200).nullable().optional(),
    title: z.string().trim().max(200).nullable().optional(),
    position: z.string().trim().max(200).nullable().optional(),
    role: z.string().trim().max(200).nullable().optional(),
    highlights: z
      .union([z.array(z.string().trim().min(1)), z.string().transform((str) => [str.trim()])])
      .optional()
      .default([]),
  })
  .transform((item) => ({
    company: item.company ?? null,
    title: item.title ?? item.position ?? item.role ?? null,
    highlights: item.highlights.filter(Boolean),
  }));

const educationItemSchema = z.union([
  z.string().trim().min(1),
  z
    .object({
      institution: z.string().optional(),
      school: z.string().optional(),
      degree: z.string().optional(),
      fieldOfStudy: z.string().optional(),
      year: z.union([z.string(), z.number()]).optional(),
      location: z.string().optional(),
      details: z.string().optional(),
    })
    .transform((edu) => {
      const degree = edu.degree ?? edu.fieldOfStudy;
      const school = edu.institution ?? edu.school;
      if (degree && school) return `${degree} - ${school}`;
      return degree || school || edu.details || "Education";
    }),
]);

const projectItemSchema = z.union([
  z.string().trim().min(1),
  z
    .object({
      name: z.string().optional(),
      title: z.string().optional(),
      description: z.string().optional(),
      highlights: z.array(z.string()).optional(),
    })
    .transform((proj) => {
      const name = proj.name ?? proj.title;
      if (name && proj.description) return `${name}: ${proj.description}`;
      return name || proj.description || "Project";
    }),
]);

const certificationItemSchema = z.union([
  z.string().trim().min(1),
  z
    .object({
      name: z.string().optional(),
      title: z.string().optional(),
      issuer: z.string().optional(),
    })
    .transform((cert) => {
      const name = cert.name ?? cert.title;
      if (name && cert.issuer) return `${name} (${cert.issuer})`;
      return name || cert.issuer || "Certification";
    }),
]);

export const resumeAnalysisSchema = z.object({
  summary: z.string().trim().min(1).max(4_000),
  skills: z.array(stringOrItemSchema).max(100),
  technologies: z.array(stringOrItemSchema).max(100),
  experience: z.array(experienceItemSchema).max(50),
  education: z.array(educationItemSchema).max(50),
  projects: z.array(projectItemSchema).max(50),
  certifications: z.array(certificationItemSchema).max(50),
});

export type ResumeAnalysisOutput = z.infer<typeof resumeAnalysisSchema>;
export type ResumeAnalysisFailureCode =
  | "AI_CONFIGURATION"
  | "AI_UNAVAILABLE"
  | "DOCUMENT_UNREADABLE"
  | "STORAGE_UNAVAILABLE"
  | "SYSTEM_ERROR";

export function classifyResumeAnalysisFailure(error: unknown): ResumeAnalysisFailureCode {
  if (error instanceof AiProviderError) {
    return error.category === "CONFIGURATION" ? "AI_CONFIGURATION" : "AI_UNAVAILABLE";
  }
  // A Zod error here is schema validation of AI output, not an unreadable
  // document: the parser throws ResumeParseError for document problems well
  // before this validation runs, so labeling a healthy PDF "unreadable" would
  // send the user to re-upload for our own provider-output failure.
  if (error instanceof z.ZodError) return "AI_UNAVAILABLE";
  if (error instanceof ResumeParseError) return "DOCUMENT_UNREADABLE";
  if (error instanceof ResumeStorageConfigurationError || error instanceof ResumeStorageError)
    return "STORAGE_UNAVAILABLE";
  return "SYSTEM_ERROR";
}

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
    // Duplicate at-least-once execution with a persisted analysis: finalize the
    // stuck transition instead of re-running an expensive extraction, and drop
    // any stale failure code left by an earlier attempt.
    await database.resume.update({
      where: { id: resumeId },
      data: { status: "ANALYZED", analysisFailureCode: null, analysisStartedAt: null },
    });
    return;
  }
  const bytes = await downloadResumeObject(environment, resume);
  const resumeText = await extractResumeText(bytes, resume.mimeType);
  const aiProvider = createAiProvider(environment);
  const instructions = `${untrustedDocumentGuard}
Extract resume fields as JSON matching this schema:
{
  "summary": "Executive summary of the candidate background",
  "skills": ["Skill 1", "Skill 2"],
  "technologies": ["Technology 1", "Technology 2"],
  "experience": [
    {
      "company": "Company Name",
      "title": "Job Title",
      "highlights": ["Key achievement or responsibility 1"]
    }
  ],
  "education": ["Degree - Institution"],
  "projects": ["Project Name: Description of the project and impact"],
  "certifications": ["Certification Name"]
}
Never invent facts. Return valid JSON only. ${safetyPrivacyPrompt}`;

  const analysis = await aiProvider.generateStructured(
    {
      instructions,
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
    where: { id: resumeId, status: { in: ["ANALYZING", "READY", "FAILED"] } },
    data: { status: "ANALYZED", analysisFailureCode: null, analysisStartedAt: null },
  });
}

export async function markResumeAnalysisFailed(
  database: PrismaClient,
  resumeId: string,
  userId: string,
  analysisFailureCode: ResumeAnalysisFailureCode = "SYSTEM_ERROR",
) {
  await database.resume.updateMany({
    where: { id: resumeId, userId, status: { not: "DELETED" } },
    data: { status: "FAILED", analysisFailureCode },
  });
}
