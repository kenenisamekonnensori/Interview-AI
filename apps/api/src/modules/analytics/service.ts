import { interviewEvaluationSchema, type InterviewEvaluation } from "@interviewer-ai/types";
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
        targetRole: interview.targetRole ?? interview.jobDescription?.title ?? null,
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
}

function validEvaluation(value: unknown) {
  const parsed = interviewEvaluationSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
type AnalyticsReportRow = {
  id: string;
  interviewType: string;
  targetRole: string | null;
  jobDescription: { title: string | null } | null;
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
    targetRole: row.targetRole ?? row.jobDescription?.title ?? null,
    completedAt: row.completedAt!.toISOString(),
    evaluation: row.evaluation,
  };
}
