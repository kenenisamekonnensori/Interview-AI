import type { PrismaClient } from "../../../prisma/generated/client.js";
import type { AnalyticsFilter } from "./schema.js";

export class AnalyticsRepository {
  constructor(private readonly database: PrismaClient) {}

  private where(userId: string, filter: AnalyticsFilter) {
    return {
      userId,
      ...(filter.from || filter.to
        ? {
            completedAt: {
              ...(filter.from ? { gte: filter.from } : {}),
              ...(filter.to ? { lte: filter.to } : {}),
            },
          }
        : {}),
      ...(filter.interviewType ? { interviewType: filter.interviewType } : {}),
      ...(filter.difficulty ? { difficulty: filter.difficulty } : {}),
      ...(filter.role
        ? { targetRole: { contains: filter.role, mode: "insensitive" as const } }
        : {}),
    };
  }

  history(userId: string, filter: AnalyticsFilter) {
    const where = this.where(userId, filter);
    return Promise.all([
      this.database.interview.findMany({
        where,
        include: { report: true, jobDescription: { select: { title: true } } },
        orderBy: { createdAt: "desc" },
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
      }),
      this.database.interview.count({ where }),
    ]);
  }

  completedWithReports(userId: string, filter: AnalyticsFilter) {
    return this.database.interview.findMany({
      where: {
        ...this.where(userId, filter),
        status: "COMPLETED",
        report: { is: { status: "READY" } },
      },
      include: { report: true, jobDescription: { select: { title: true } } },
      orderBy: { completedAt: "asc" },
    });
  }

  completedDetail(userId: string, interviewId: string) {
    return this.database.interview.findFirst({
      where: { id: interviewId, userId, status: "COMPLETED", report: { is: { status: "READY" } } },
      include: {
        report: true,
        conversation: { include: { turns: { orderBy: { sequence: "asc" } } } },
        plan: true,
      },
    });
  }
}
