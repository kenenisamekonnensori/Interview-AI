import type { PrismaClient } from "../../prisma/generated/client.js";
import type { ServerEnvironment } from "@interviewer-ai/config";
import { buildInterviewPlanPrompt } from "@interviewer-ai/prompts";
import { interviewPlanSchema } from "@interviewer-ai/types";
import { createAiProvider } from "../modules/ai/index.js";
import { assertInterviewTransition } from "../modules/conversation/state-machine.js";

/**
 * Core business logic for interview plan generation.
 * Reused by both Monolith Mode (direct execution) and Worker Mode (career-analysis.worker.ts).
 */
export async function planInterview(
  database: PrismaClient,
  environment: ServerEnvironment,
  interviewId: string,
) {
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
  const aiProvider = createAiProvider(environment);
  const plan = await aiProvider.generateStructured(
    {
      instructions: buildInterviewPlanPrompt(),
      context,
    },
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

export async function markInterviewPlanFailed(
  database: PrismaClient,
  interviewId: string,
  userId: string,
) {
  await database.interview.updateMany({
    where: { id: interviewId, userId, status: "PREPARING" },
    data: { status: "FAILED" },
  });
}
