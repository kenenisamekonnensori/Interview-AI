import type { PrismaClient } from "../../../prisma/generated/client.js";
import {
  interviewEvaluationSchema,
  readinessFormulaVersion,
  type ReadinessAssessment,
} from "@interviewer-ai/types";

import { computeReadiness, MIN_INTERVIEWS_FOR_SCORE } from "./readiness-engine.js";
import { computeSkillProfile } from "./skill-engine.js";

/**
 * Server-authoritative readiness for the user's active target job. Scores are
 * computed deterministically from persisted evaluations (formula documented in
 * readiness-engine.ts); the read path never calls the AI provider. Snapshots
 * are recorded when reports complete — never on page load — so the trend
 * reflects real history.
 */
export class ReadinessService {
  constructor(private readonly database: PrismaClient) {}

  async assessment(userId: string): Promise<ReadinessAssessment> {
    const rows = await this.completedRows(userId);
    const [target, snapshots] = await Promise.all([
      this.activeTarget(userId),
      this.database.readinessSnapshot.findMany({
        where: { userId },
        orderBy: { recordedAt: "desc" },
        take: 30,
      }),
    ]);
    return computeReadiness({
      reports: rows,
      skills: computeSkillProfile(rows),
      target: target ? this.toReadinessTarget(target) : null,
      snapshots: snapshots.map((snapshot) => ({
        id: snapshot.id,
        overall: snapshot.overall,
        recordedAt: snapshot.recordedAt,
        interviewCount: snapshot.interviewCount,
      })),
      now: new Date(),
    });
  }

  /**
   * Records a readiness snapshot after a report becomes READY. Each newly READY
   * report increments the valid-report count by exactly one, so retries of the
   * same report must not append a second point for the same count.
   *
   * Idempotency is enforced in two layers: the unique
   * (userId, careerTargetId, validReportCount) constraint covers targets that
   * exist, and the explicit guard below also covers the target-less case — in
   * Postgres, NULLs are distinct in a unique index, so a retried snapshot for a
   * user with no active target would otherwise be allowed through.
   *
   * Failure must never fail report generation; callers wrap this in try/catch.
   */
  async recordSnapshotAfterReport(userId: string): Promise<void> {
    const rows = await this.completedRows(userId);
    const validRows = rows.filter(
      (row) =>
        row.completedAt !== null &&
        interviewEvaluationSchema.safeParse(row.report?.evaluation).success,
    );
    if (validRows.length < MIN_INTERVIEWS_FOR_SCORE) return;
    const target = await this.activeTarget(userId);
    const assessment = computeReadiness({
      reports: rows,
      skills: computeSkillProfile(rows),
      target: target ? this.toReadinessTarget(target) : null,
      snapshots: [],
      now: new Date(),
    });
    if (assessment.overall === null) return;
    const careerTargetId = assessment.careerTarget?.id ?? null;
    const existing = await this.database.readinessSnapshot.findFirst({
      where: { userId, careerTargetId, validReportCount: validRows.length },
      select: { id: true },
    });
    if (existing) return;
    await this.database.readinessSnapshot.create({
      data: {
        userId,
        careerTargetId,
        overall: assessment.overall,
        components: assessment.components,
        formulaVersion: readinessFormulaVersion,
        interviewCount: validRows.length,
        validReportCount: validRows.length,
        trigger: "REPORT_READY",
      },
    });
  }

  private async completedRows(userId: string) {
    return this.database.interview.findMany({
      where: { userId, status: "COMPLETED", report: { is: { status: "READY" } } },
      select: {
        id: true,
        interviewType: true,
        completedAt: true,
        report: { select: { evaluation: true } },
      },
      orderBy: { completedAt: "asc" },
    });
  }

  private async activeTarget(userId: string) {
    return this.database.careerTarget.findFirst({
      where: { userId, status: "ACTIVE" },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        company: true,
        jobDescription: {
          select: { deletedAt: true, analysis: { select: { requiredSkills: true } } },
        },
      },
    });
  }

  private toReadinessTarget(row: {
    id: string;
    title: string;
    company: string | null;
    jobDescription: { deletedAt: Date | null; analysis: { requiredSkills: unknown } | null } | null;
  }) {
    const raw = row.jobDescription?.analysis?.requiredSkills;
    return {
      id: row.id,
      title: row.title,
      company: row.company,
      requiredSkills: Array.isArray(raw)
        ? raw.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        : [],
    };
  }
}
