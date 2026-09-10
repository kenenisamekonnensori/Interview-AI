import {
  interviewEvaluationSchema,
  type DashboardOverview,
  type InterviewEvaluation,
  type NextPracticeRecommendation,
  type PerformanceSummary,
  type SkillAnalysisDto,
  type SkillProfile,
} from "@interviewer-ai/types";
import type { AnalyticsFilter, PerformanceQuery } from "./schema.js";
import { AnalyticsRepository } from "./repository.js";
import { computeSkillProfile, validSkillReportRows } from "./skill-engine.js";
import { recommendNextAction } from "./recommendation-engine.js";
import { computeReadiness } from "./readiness-engine.js";
import type { PrismaClient } from "../../../prisma/generated/client.js";

const dimensions = ["technical", "communication", "confidence", "problemSolving"] as const;
const dimensionLabels: Record<(typeof dimensions)[number], string> = {
  technical: "Technical",
  communication: "Communication",
  confidence: "Confidence",
  problemSolving: "Problem solving",
};

const thirtyDaysMs = 30 * 24 * 60 * 60 * 1_000;
const ninetyDaysMs = 3 * thirtyDaysMs;

/** Returns the [from, to] completedAt window for a performance range preset. */
export function resolvePerformanceWindow(
  query: Pick<PerformanceQuery, "range" | "from" | "to">,
  now: Date = new Date(),
): { from: Date | null; to: Date | null } {
  if (query.range === "all") return { from: null, to: null };
  if (query.range === "30d") return { from: new Date(now.getTime() - thirtyDaysMs), to: null };
  if (query.range === "90d") return { from: new Date(now.getTime() - ninetyDaysMs), to: null };
  if (!query.from)
    throw new PerformanceQueryError("INVALID_RANGE", "A custom range requires a start date.");
  if (query.to && query.from > query.to)
    throw new PerformanceQueryError("INVALID_RANGE", "The start date must be before the end date.");
  return { from: query.from, to: query.to ?? null };
}

export class PerformanceQueryError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "PerformanceQueryError";
  }
}

/** Monday 00:00 UTC of the week containing the given date. */
export function startOfUtcWeek(now: Date) {
  const date = new Date(now);
  const utcMondayOffset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - utcMondayOffset);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

export class AnalyticsService {
  readonly repository: AnalyticsRepository;
  constructor(database: PrismaClient) {
    this.repository = new AnalyticsRepository(database);
  }

  async history(userId: string, filter: AnalyticsFilter) {
    const [interviews, total] = await this.repository.history(userId, filter);
    return {
      items: interviews.map((interview) => ({
        id: interview.id,
        status: interview.status,
        interviewType: interview.interviewType,
        difficulty: interview.difficulty,
        targetRole:
          interview.targetRole ??
          (interview.jobDescription?.deletedAt ? null : interview.jobDescription?.title) ??
          null,
        durationMinutes: interview.durationMinutes,
        createdAt: interview.createdAt.toISOString(),
        completedAt: interview.completedAt?.toISOString() ?? null,
        reportStatus: interview.report?.status ?? null,
        overallScore: validEvaluation(interview.report?.evaluation)?.overallScore ?? null,
      })),
      page: filter.page,
      pageSize: filter.pageSize,
      total,
      totalPages: Math.ceil(total / filter.pageSize),
    };
  }

  async reports(userId: string, filter: AnalyticsFilter) {
    const rows = filterValidRows(
      await this.repository.completedWithReports(userId, filter),
      filter.skillArea,
    );
    return { reports: rows.map(reportDto) };
  }

  async trends(userId: string, filter: AnalyticsFilter) {
    const rows = filterValidRows(
      await this.repository.completedWithReports(userId, filter),
      filter.skillArea,
    );
    const byType = new Map<string, typeof rows>();
    for (const row of rows)
      byType.set(row.interviewType, [...(byType.get(row.interviewType) ?? []), row]);
    return {
      scale: "0-100",
      comparisonNote: filter.interviewType
        ? "Trend is scoped to the selected interview type."
        : "Series are separated by interview type; they are not combined.",
      series: [...byType.entries()].map(([interviewType, values]) => ({
        interviewType,
        points: values.map((row) => ({
          interviewId: row.id,
          completedAt: row.completedAt!.toISOString(),
          overallScore: row.evaluation.overallScore,
          technical: row.evaluation.technical.score,
          communication: row.evaluation.communication.score,
          confidence: row.evaluation.confidence.score,
          problemSolving: row.evaluation.problemSolving.score,
        })),
      })),
    };
  }

  async summary(userId: string, filter: AnalyticsFilter) {
    const rows = filterValidRows(
      await this.repository.completedWithReports(userId, filter),
      filter.skillArea,
    );
    const grouped = new Map<string, typeof rows>();
    for (const row of rows)
      grouped.set(row.interviewType, [...(grouped.get(row.interviewType) ?? []), row]);
    const byInterviewType = [...grouped.entries()].map(([interviewType, values]) => {
      const latest = values.at(-1)!;
      const previous = values.at(-2);
      const changes = dimensions.map((name) => ({
        name,
        change: previous ? latest.evaluation[name].score - previous.evaluation[name].score : null,
      }));
      const weaknesses = new Map<string, number>();
      for (const value of values)
        for (const weakness of value.evaluation.weaknesses)
          weaknesses.set(weakness.text, (weaknesses.get(weakness.text) ?? 0) + 1);
      return {
        interviewType,
        validReportCount: values.length,
        latestOverallScore: latest.evaluation.overallScore,
        overallChange: previous
          ? latest.evaluation.overallScore - previous.evaluation.overallScore
          : null,
        improvingAreas: changes
          .filter((item) => (item.change ?? 0) > 0)
          .sort((a, b) => b.change! - a.change!)
          .slice(0, 3),
        recurringWeaknesses: [...weaknesses.entries()]
          .filter(([, count]) => count > 1)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([text, count]) => ({ text, count })),
      };
    });
    return {
      validReportCount: rows.length,
      comparisonNote:
        "Only completed interviews with schema-valid, ready reports are included. Scores use a 0-100 scale.",
      byInterviewType,
    };
  }

  async completedDetail(userId: string, interviewId: string) {
    const interview = await this.repository.completedDetail(userId, interviewId);
    if (!interview || !validEvaluation(interview.report?.evaluation)) return null;
    return interview;
  }

  /**
   * Server-authoritative dashboard overview. Every value is derived here — the
   * frontend never computes business metrics. Nullable fields are honest empty
   * states for features not yet populated (e.g. readiness, no scored reports).
   */
  async overview(userId: string): Promise<DashboardOverview> {
    const [
      completedInterviews,
      interviewsThisWeek,
      recentRows,
      scoredRows,
      profile,
      activeResume,
      savedJobDescriptionCount,
      activeInterviewRow,
      activeTargetRow,
    ] = await this.repository.overviewContext(userId, startOfUtcWeek(new Date()));
    const scoredEvaluations = scoredRows.flatMap((row) => {
      const evaluation = validEvaluation(row.report?.evaluation);
      return evaluation ? [evaluation] : [];
    });
    const averageOverallScore = scoredEvaluations.length
      ? Math.round(
          scoredEvaluations.reduce((total, evaluation) => total + evaluation.overallScore, 0) /
            scoredEvaluations.length,
        )
      : null;
    const recommendation = await this.nextPracticeRecommendation(userId);
    return {
      generatedAt: new Date().toISOString(),
      stats: {
        completedInterviews,
        interviewsThisWeek,
        averageOverallScore,
        latestOverallScore: scoredEvaluations[0]?.overallScore ?? null,
        scoredReportCount: scoredEvaluations.length,
      },
      preparation: {
        targetRole: activeTargetRow?.title ?? profile?.targetRole ?? null,
        activeTarget: activeTargetRow
          ? {
              id: activeTargetRow.id,
              title: activeTargetRow.title,
              company: activeTargetRow.company,
              jobUrl: activeTargetRow.jobUrl,
              location: activeTargetRow.location,
              updatedAt: activeTargetRow.updatedAt.toISOString(),
            }
          : null,
        hasActiveResume: activeResume !== null,
        savedJobDescriptionCount,
      },
      recommendation,
      activeInterview: activeInterviewRow
        ? {
            id: activeInterviewRow.id,
            status: activeInterviewRow.status,
            targetRole: activeInterviewRow.targetRole,
          }
        : null,
      recentInterviews: recentRows.map((interview) => ({
        id: interview.id,
        status: interview.status,
        interviewType: interview.interviewType,
        targetRole:
          interview.targetRole ??
          (interview.jobDescription?.deletedAt ? null : interview.jobDescription?.title) ??
          null,
        overallScore: validEvaluation(interview.report?.evaluation)?.overallScore ?? null,
        reportStatus: interview.report?.status ?? null,
        createdAt: interview.createdAt.toISOString(),
        completedAt: interview.completedAt?.toISOString() ?? null,
      })),
    };
  }

  /**
   * Longitudinal performance summary computed entirely from persisted,
   * schema-valid evaluations. Statistics are database-derived (no AI calls);
   * the query is bounded to the resolved window with indexed reads.
   */
  async performance(userId: string, query: PerformanceQuery): Promise<PerformanceSummary> {
    const window = resolvePerformanceWindow(query);
    const filter: AnalyticsFilter = {
      page: 1,
      pageSize: 50,
      ...(window.from ? { from: window.from } : {}),
      ...(window.to ? { to: window.to } : {}),
    };
    const [rows, completedInterviewCount] = await Promise.all([
      this.repository.completedWithReports(userId, filter),
      this.repository.completedCount(userId, filter),
    ]);
    const valid = filterValidRows(rows);
    const scores = valid.map((row) => row.evaluation.overallScore);
    const average = (values: number[]) =>
      values.length
        ? Math.round(values.reduce((total, value) => total + value, 0) / values.length)
        : null;
    const recentScore = scores.at(-1) ?? null;
    const firstScore = scores[0] ?? null;
    const change = (latest: number | null, baseline: number | null) =>
      latest !== null && baseline !== null ? latest - baseline : null;
    const previousScores = scores.slice(0, -1);
    const previousAverage = average(previousScores);
    return {
      window: {
        preset: query.range,
        from: window.from?.toISOString() ?? null,
        to: window.to?.toISOString() ?? null,
      },
      completedInterviewCount,
      validReportCount: valid.length,
      averageOverallScore: average(scores),
      recentScore,
      comparison: {
        latestScore: recentScore,
        previousAverage,
        change: change(recentScore, previousAverage),
      },
      trend: {
        change: change(recentScore, firstScore),
        direction:
          recentScore === null || firstScore === null
            ? null
            : recentScore > firstScore
              ? "up"
              : recentScore < firstScore
                ? "down"
                : "flat",
      },
      categories: dimensions.map((key) => {
        const values = valid.map((row) => row.evaluation[key].score);
        return {
          key,
          label: dimensionLabels[key],
          average: average(values),
          latest: values.at(-1) ?? null,
        };
      }),
      series: valid.slice(-60).map((row) => ({
        completedAt: row.completedAt!.toISOString(),
        overallScore: row.evaluation.overallScore,
        interviewType: row.interviewType as PerformanceSummary["series"][number]["interviewType"],
      })),
    };
  }

  /**
   * Longitudinal skill profile. Levels, trends, confidence, and statuses are
   * computed deterministically from persisted evaluations; the AI
   * interpretation is served only if the background job already persisted it
   * (the read path never calls the AI provider).
   */
  async skillProfile(userId: string): Promise<SkillProfile> {
    const [rows, analysis] = await Promise.all([
      this.repository.completedWithReports(userId, { page: 1, pageSize: 50 }),
      this.repository.skillAnalysisRow(userId),
    ]);
    const valid = validSkillReportRows(rows);
    return {
      generatedAt: new Date().toISOString(),
      validReportCount: valid.length,
      skills: computeSkillProfile(valid),
      analysis: analysis
        ? {
            status: analysis.status as SkillAnalysisDto["status"],
            version: analysis.version,
            summary: analysis.summary,
            insights: (analysis.insights as SkillAnalysisDto["insights"]) ?? null,
            basedOnObservationCount: analysis.basedOnObservationCount,
            basedOnInterviewIds: analysis.basedOnInterviewIds,
            model: analysis.model,
            generatedAt: analysis.generatedAt?.toISOString() ?? null,
          }
        : null,
    };
  }

  /**
   * Structured next-step recommendation. The engine picks the action
   * deterministically from persisted skills, readiness, plan, and history;
   * this method only gathers that data (user-scoped) and preserves the
   * pre-existing interview-creation defaults for the CTA.
   */
  async nextPracticeRecommendation(userId: string): Promise<NextPracticeRecommendation> {
    const [profile, activeResume, jobDescription, reports, careerTarget] =
      await this.repository.recommendationContext(userId);
    const validReports = reports.flatMap((report) => {
      const evaluation = validEvaluation(report.report?.evaluation);
      return evaluation ? [{ report, evaluation }] : [];
    });
    const skills = computeSkillProfile(
      validReports.map(({ report }) => ({
        id: report.id,
        interviewType: report.interviewType,
        report: { evaluation: (report as { report: { evaluation: unknown } }).report.evaluation },
        completedAt: report.completedAt,
      })),
    );
    const [rows, targetRow, snapshots, planRow] = await Promise.all([
      this.repository.completedWithReports(userId, { page: 1, pageSize: 50 }),
      this.repository.activeTargetWithJob(userId),
      this.repository.readinessSnapshots(userId),
      this.repository.practicePlanRow(userId),
    ]);
    const readiness = computeReadiness({
      reports: rows,
      skills,
      target: targetRow
        ? {
            id: targetRow.id,
            title: targetRow.title,
            company: targetRow.company,
            requiredSkills: extractRequiredSkills(targetRow.jobDescription),
          }
        : null,
      snapshots: snapshots.map((snapshot) => ({
        id: snapshot.id,
        overall: snapshot.overall,
        recordedAt: snapshot.recordedAt,
        interviewCount: snapshot.interviewCount,
      })),
      now: new Date(),
    });
    const plan = planRow
      ? {
          pendingCount: planRow.items.filter((item) => item.status === "PENDING").length,
          nextActivity: (() => {
            const item = planRow.items.find((entry) => entry.status === "PENDING");
            return item
              ? {
                  id: item.id,
                  activityType: item.activityType,
                  title: item.title,
                  priority: item.priority,
                  rationale: item.rationale,
                }
              : null;
          })(),
          items: planRow.items.map((item) => ({
            id: item.id,
            activityType: item.activityType,
            title: item.title,
            priority: item.priority,
            status: item.status,
          })),
        }
      : null;
    const latest = validReports[0]?.report ?? null;
    const result = recommendNextAction({
      profileTargetRole:
        careerTarget?.title ?? profile?.targetRole ?? jobDescription?.title ?? null,
      defaultDifficulty: profile?.defaultDifficulty ?? "MEDIUM",
      defaultDurationMinutes: profile?.defaultInterviewDuration ?? 30,
      skills,
      readiness,
      plan,
      target: careerTarget
        ? {
            id: careerTarget.id,
            title: careerTarget.title,
            company: careerTarget.company ?? null,
            requiredSkills: extractRequiredSkills(jobDescription),
          }
        : null,
      hasActiveResume: Boolean(activeResume),
      latestReport: latest
        ? {
            interviewId: latest.id,
            interviewType: latest.interviewType,
            summary: latest.report?.summary ?? null,
          }
        : null,
    });
    // Preserve the interview-creation defaults the CTA has always carried.
    return {
      ...result,
      ...(activeResume ? { resumeId: activeResume.id } : {}),
      ...(jobDescription ? { jobDescriptionId: jobDescription.id } : {}),
      ...(!careerTarget && !profile?.targetRole && !activeResume && !jobDescription
        ? {
            setupSuggestion:
              "Add a target job, target role, resume, or job description to make future practice more tailored.",
          }
        : {}),
    };
  }
}

function extractRequiredSkills(
  jobDescription: { deletedAt: Date | null; analysis: { requiredSkills: unknown } | null } | null,
): string[] {
  if (!jobDescription || jobDescription.deletedAt) return [];
  const raw = jobDescription.analysis?.requiredSkills;
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function validEvaluation(value: unknown) {
  const parsed = interviewEvaluationSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
type AnalyticsReportRow = {
  id: string;
  interviewType: string;
  targetRole: string | null;
  jobDescription: { title: string | null; deletedAt: Date | null } | null;
  report: { evaluation: unknown } | null;
  completedAt: Date | null;
};
type ValidAnalyticsReportRow = AnalyticsReportRow & { evaluation: InterviewEvaluation };

function filterValidRows<T extends AnalyticsReportRow>(rows: T[], skillArea?: string) {
  return rows
    .flatMap((row) => {
      const evaluation = validEvaluation(row.report?.evaluation);
      return evaluation ? [{ ...row, evaluation }] : [];
    })
    .filter(
      (row) =>
        !skillArea ||
        Object.keys(row.evaluation.categoryScores).some((category) =>
          category.toLowerCase().includes(skillArea.toLowerCase()),
        ),
    );
}
function reportDto(row: ValidAnalyticsReportRow) {
  return {
    interviewId: row.id,
    interviewType: row.interviewType,
    targetRole:
      row.targetRole ?? (row.jobDescription?.deletedAt ? null : row.jobDescription?.title) ?? null,
    completedAt: row.completedAt!.toISOString(),
    evaluation: row.evaluation,
  };
}
