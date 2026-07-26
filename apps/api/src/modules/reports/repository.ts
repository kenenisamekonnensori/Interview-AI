import type { PrismaClient } from "../../../prisma/generated/client.js";
import type { GeneratedReport } from "./schema.js";

export class ReportRepository {
  constructor(private readonly database: PrismaClient) {}

  findOwned(interviewId: string, userId: string) {
    return this.database.interviewReport.findFirst({
      where: { interviewId, interview: { userId } },
    });
  }

  async createPending(interviewId: string) {
    return this.database.interviewReport.upsert({
      where: { interviewId },
      create: { interviewId, status: "PENDING" },
      update: {},
    });
  }

  async claimGeneration(interviewId: string) {
    const claimed = await this.database.interviewReport.updateMany({
      where: { interviewId, status: { in: ["PENDING", "FAILED"] } },
      data: { status: "GENERATING", failureReason: null, generationAttempts: { increment: 1 } },
    });
    return claimed.count === 1;
  }

  context(interviewId: string) {
    return this.database.interview.findUnique({
      where: { id: interviewId },
      include: {
        conversation: { include: { turns: { orderBy: { sequence: "asc" } } } },
        plan: true,
        memory: true,
        resume: { include: { analysis: true } },
        jobDescription: { include: { analysis: true } },
      },
    });
  }

  saveReady(interviewId: string, report: GeneratedReport, model: string) {
    return this.database.interviewReport.updateMany({
      where: { interviewId, status: "GENERATING" },
      data: {
        status: "READY",
        evaluation: report.evaluation,
        summary: report.summary,
        evidence: report.evidence,
        hiringRecommendation: report.hiringRecommendation,
        model,
        generatedAt: new Date(),
        failureReason: null,
      },
    });
  }

  markFailed(interviewId: string, reason: string) {
    return this.database.interviewReport.updateMany({
      where: { interviewId, status: "GENERATING" },
      data: { status: "FAILED", failureReason: reason.slice(0, 500) },
    });
  }

  markPendingFailed(interviewId: string, reason: string) {
    return this.database.interviewReport.updateMany({
      where: { interviewId, status: "PENDING" },
      data: { status: "FAILED", failureReason: reason.slice(0, 500) },
    });
  }

  retry(interviewId: string, userId: string) {
    return this.database.interviewReport.updateMany({
      where: { interviewId, status: "FAILED", interview: { userId } },
      data: { status: "PENDING", failureReason: null },
    });
  }
}
