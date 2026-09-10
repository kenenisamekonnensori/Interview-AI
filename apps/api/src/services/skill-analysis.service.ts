import { buildSkillAnalysisPrompt } from "@interviewer-ai/prompts";
import type { ServerEnvironment } from "@interviewer-ai/config";
import type { SkillKey } from "@interviewer-ai/types";

import type { PrismaClient } from "../../prisma/generated/client.js";
import { createAiProvider } from "../modules/ai/index.js";
import { AiProviderError, isRetryableAiError } from "../modules/ai/errors.js";
import { skillAnalysisOutputSchema } from "../modules/analytics/skill-analysis-schema.js";
import { AnalyticsRepository } from "../modules/analytics/repository.js";
import {
  computeSkillObservations,
  computeSkillProfile,
  validSkillReportRows,
} from "../modules/analytics/skill-engine.js";
import type { createCareerAnalysisQueue } from "./career-analysis-queue.js";
import type { MonolithExecutionManager } from "./monolith-execution.js";
import { logSafeError } from "./security.js";

/**
 * Persisted AI interpretation of the deterministic skill profile.
 *
 * The deterministic profile (levels, trends, confidence) is always computed
 * from evaluations and never depends on this service. `analyzeUserSkills` is
 * an explicit background operation triggered only after an interview report
 * completes — never on page load — and its output is stored with a version and
 * the interview ids it was based on.
 */
export async function analyzeUserSkills(
  database: PrismaClient,
  environment: ServerEnvironment,
  userId: string,
): Promise<void> {
  if (!(await claimGeneration(database, userId))) return;
  const aiProvider = createAiProvider(environment);
  try {
    const analytics = new AnalyticsRepository(database);
    const rows = await analytics.completedWithReports(userId, { page: 1, pageSize: 50 });
    const valid = validSkillReportRows(rows);
    const observations = computeSkillObservations(valid);
    const observationCount = [...observations.values()].reduce(
      (total, list) => total + list.length,
      0,
    );
    // A single interview cannot establish a pattern; keep the deterministic
    // profile and skip the AI call (no row is created, profile stays honest).
    if (valid.length < 2 || observationCount < 2) return;
    const skills = computeSkillProfile(valid);
    const generated = await aiProvider.generateStructured(
      {
        instructions: buildSkillAnalysisPrompt(),
        context: {
          validReportCount: valid.length,
          skills: skills.map((skill) => ({
            skillKey: skill.skillKey,
            label: skill.label,
            level: skill.level,
            latestScore: skill.latestScore,
            observationCount: skill.observationCount,
            trendDirection: skill.trend.direction,
            change: skill.trend.change,
            recentFeedback: clip(observations.get(skill.skillKey)?.at(-1)?.feedback),
          })),
        },
      },
      skillAnalysisOutputSchema.parse,
    );
    const supplied = new Set<SkillKey>(skills.map((skill) => skill.skillKey));
    for (const skillKey of Object.keys(generated.insights))
      if (!supplied.has(skillKey as SkillKey))
        throw new AiProviderError(
          "INVALID_OUTPUT",
          "Skill analysis referenced a skill outside the supplied profile.",
        );
    const basedOnInterviewIds = valid.map((row) => row.id);
    await database.skillAnalysis.upsert({
      where: { userId },
      create: {
        userId,
        status: "READY",
        version: 1,
        model: environment.GEMINI_MODEL,
        summary: generated.summary,
        insights: generated.insights,
        basedOnInterviewIds,
        basedOnObservationCount: observationCount,
        generatedAt: new Date(),
      },
      update: {
        status: "READY",
        version: { increment: 1 },
        model: environment.GEMINI_MODEL,
        summary: generated.summary,
        insights: generated.insights,
        basedOnInterviewIds,
        basedOnObservationCount: observationCount,
        failureReason: null,
        generatedAt: new Date(),
      },
    });
  } catch (error) {
    if (error instanceof AiProviderError)
      logSafeError(consoleLogger, "Skill analysis failed", error, {
        userId,
        category: error.category,
        diagnostic: error.diagnostic,
      });
    await markSkillAnalysisFailed(database, userId, publicFailureReason(error));
    if (isRetryableAiError(error)) throw error;
  }
}

export async function markSkillAnalysisFailed(
  database: PrismaClient,
  userId: string,
  reason?: string,
) {
  const failureReason = reason ?? "The skill analysis could not be generated.";
  await database.skillAnalysis.upsert({
    where: { userId },
    create: { userId, status: "FAILED", failureReason },
    update: { status: "FAILED", failureReason },
  });
}

/** Event-driven trigger used by the API process after a report becomes ready. */
export class SkillAnalysisService {
  constructor(
    private readonly database: PrismaClient,
    private readonly environment: ServerEnvironment,
    private readonly queue: ReturnType<typeof createCareerAnalysisQueue>,
    private readonly monolith?: MonolithExecutionManager,
  ) {}

  async enqueueRefresh(userId: string) {
    const dispatched = this.monolith?.dispatchSkillAnalysis(userId);
    if (!dispatched) await this.queue.enqueue({ kind: "skill-analysis", userId });
  }
}

/** Claims the single per-user analysis row; skips when a run is in flight. */
async function claimGeneration(database: PrismaClient, userId: string): Promise<boolean> {
  const rerun = await database.skillAnalysis.updateMany({
    where: { userId, status: { in: ["READY", "FAILED"] } },
    data: { status: "GENERATING", failureReason: null },
  });
  if (rerun.count) return true;
  const existing = await database.skillAnalysis.findUnique({ where: { userId } });
  if (existing) return false;
  await database.skillAnalysis.create({ data: { userId, status: "GENERATING" } });
  return true;
}

function publicFailureReason(error: unknown) {
  return error instanceof AiProviderError
    ? "Your skill interpretation could not be generated yet. Your deterministic profile below stays up to date."
    : "Your skill interpretation could not be generated. Please try again later.";
}

function clip(text: string | undefined) {
  if (!text) return undefined;
  const singleLine = text.replace(/\s+/g, " ").trim();
  return singleLine.length > 200 ? `${singleLine.slice(0, 197)}…` : singleLine;
}

const consoleLogger = {
  error: (payload: unknown, message?: string) => console.error(message, payload),
} as const;
