import { setTimeout as delay } from "node:timers/promises";

import { Worker } from "bullmq";
import { serverEnvironmentSchema } from "@interviewer-ai/config";
import { interviewEvaluationSchema, interviewPlanSchema } from "@interviewer-ai/types";
import { z } from "zod";

import { createAuthDatabase } from "../modules/auth/database.js";
import { createAiProvider } from "../modules/ai/index.js";
import { extractResumeText } from "../modules/resumes/parser.js";
import { downloadResumeObject } from "../modules/resumes/storage.js";
import type { CareerAnalysisJob } from "../services/career-analysis-queue.js";
import { createRedisConnectionOptions } from "../services/redis-connection.js";
import { assertInterviewTransition } from "../modules/conversation/state-machine.js";
import { InterviewEventPublisher } from "../modules/interviews/events.js";

const environment = serverEnvironmentSchema.parse(process.env);
const database = createAuthDatabase(environment.DATABASE_URL);
const aiProvider = createAiProvider(environment);
const events = new InterviewEventPublisher({
  info: (payload, message) => console.info(message, payload),
});

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
    await database.interview.updateMany({
      where: { id: interviewId, status: "PREPARING" },
      data: { status: "READY" },
    });
  } catch (error) {
    assertInterviewTransition(interview.status, "FAILED");
    await database.interview.updateMany({
      where: { id: interviewId, status: "PREPARING" },
      data: { status: "FAILED" },
    });
    throw error;
  }
}

const generatedReportSchema = z.object({
  evaluation: interviewEvaluationSchema,
  summary: z.string().trim().min(1).max(8_000),
});

async function evaluateInterview(interviewId: string) {
  const interview = await database.interview.findUnique({
    where: { id: interviewId },
    include: { conversation: { include: { turns: { orderBy: { sequence: "asc" } } } }, plan: true, report: true },
  });
  if (!interview || interview.status === "COMPLETED") return;
  if (interview.status !== "COMPLETING" || !interview.conversation || !interview.plan)
    return;
  if (interview.conversation.state !== "COMPLETED" || !interview.conversation.completedAt)
    throw new Error("A completed conversation is required before evaluation.");

  const generated = generatedReportSchema.parse(
    await aiProvider.generateReport({
      instructions:
        "Evaluate this completed mock interview. Return JSON with a 0-100 evaluation and a concise candidate-facing summary. Base every finding on the supplied transcript.",
      context: {
        configuration: {
          interviewType: interview.interviewType,
          difficulty: interview.difficulty,
          targetRole: interview.targetRole,
        },
        plan: interview.plan,
        turns: interview.conversation.turns.map((turn) => ({
          speaker: turn.speaker,
          type: turn.type,
          text: turn.text,
        })),
      },
    }),
  );

  const result = await database.$transaction(async (tx) => {
    const report = await tx.interviewReport.upsert({
      where: { interviewId },
      create: { interviewId, ...generated, model: environment.GEMINI_MODEL },
      update: { ...generated, model: environment.GEMINI_MODEL, generatedAt: new Date() },
    });
    const completedAt = new Date();
    const completed = await tx.interview.updateMany({
      where: { id: interviewId, status: "COMPLETING" },
      data: { status: "COMPLETED", completedAt },
    });
    return { report, completed: completed.count === 1, completedAt };
  });
  if (result.completed) {
    events.publish({
      name: "InterviewCompleted",
      payload: {
        interviewId,
        conversationId: interview.conversation.id,
        occurredAt: result.completedAt.toISOString(),
      },
    });
    events.publish({
      name: "ReportGenerated",
      payload: {
        interviewId,
        report: {
          id: result.report.id,
          interviewId,
          evaluation: result.report.evaluation as z.infer<typeof interviewEvaluationSchema>,
          summary: result.report.summary,
          generatedAt: result.report.generatedAt.toISOString(),
        },
        occurredAt: result.report.generatedAt.toISOString(),
      },
    });
  }
}

const worker = new Worker<CareerAnalysisJob>(
  "career-analysis",
  async (job) =>
    job.data.kind === "resume"
      ? analyzeResume(job.data.resumeId)
      : job.data.kind === "job-description"
        ? analyzeJobDescription(job.data.jobDescriptionId)
        : job.data.kind === "interview-plan"
          ? planInterview(job.data.interviewId)
          : evaluateInterview(job.data.interviewId),
  {
    connection: createRedisConnectionOptions(environment.REDIS_URL, { worker: true }),
  },
);
await new Promise<void>((resolve) => process.once("SIGTERM", resolve));
await worker.close();
await database.$disconnect();
await delay(0);
