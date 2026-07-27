import {
  interviewEvaluationSchema,
  type InterviewEvaluation,
  type NextPracticeRecommendation,
} from "@interviewer-ai/types";
import type { AnalyticsFilter } from "./schema.js";
import { AnalyticsRepository } from "./repository.js";
import type { PrismaClient } from "../../../prisma/generated/client.js";

const dimensions = ["technical", "communication", "confidence", "problemSolving"] as const;

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

  async nextPracticeRecommendation(userId: string): Promise<NextPracticeRecommendation> {
    const [profile, activeResume, jobDescription, reports] =
      await this.repository.recommendationContext(userId);
    const validReports = reports.flatMap((report) => {
      const evaluation = validEvaluation(report.report?.evaluation);
      return evaluation ? [{ report, evaluation }] : [];
    });
    const weaknesses = validReports.flatMap(({ evaluation }) =>
      evaluation.weaknesses.map((item) => item.text),
    );
    const counts = new Map<string, number>();
    for (const weakness of weaknesses) counts.set(weakness, (counts.get(weakness) ?? 0) + 1);
    const focusAreas = [...counts.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 3)
      .map(([text]) => text);
    const latest = validReports[0]?.report;
    const primaryFocus = focusAreas[0];
    const suggestedTargetRole =
      profile?.targetRole ?? jobDescription?.title ?? "General interview practice";
    const reasons = [
      profile?.targetRole ? `Uses your profile target role: ${profile.targetRole}.` : null,
      activeResume ? "Uses your active resume for relevant questions." : null,
      jobDescription
        ? `Uses your saved job description${jobDescription.title ? ` for ${jobDescription.title}` : ""}.`
        : null,
      primaryFocus
        ? `${counts.get(primaryFocus)! > 1 ? "Recurring" : "Recent"} feedback suggests focusing on ${primaryFocus}.`
        : null,
    ]
      .filter((reason): reason is string => Boolean(reason))
      .slice(0, 3);
    const basis = validReports.length ? "HISTORY" : "PROFILE";
    return {
      suggestedTargetRole,
      interviewType:
        (latest?.interviewType as NextPracticeRecommendation["interviewType"] | undefined) ??
        "MIXED",
      difficulty: profile?.defaultDifficulty ?? "MEDIUM",
      suggestedDurationMinutes: profile?.defaultInterviewDuration ?? 30,
      ...(activeResume ? { resumeId: activeResume.id } : {}),
      ...(jobDescription ? { jobDescriptionId: jobDescription.id } : {}),
      reasons: reasons.length ? reasons : ["Start with a focused role-based practice interview."],
      focusAreas,
      basis,
      ...(!profile?.targetRole && !activeResume && !jobDescription
        ? {
            setupSuggestion:
              "Add a target role, resume, or job description to make future practice more tailored.",
          }
        : {}),
    };
  }
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
