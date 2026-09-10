import type { PrismaClient } from "../../../prisma/generated/client.js";

export class PracticePlanRepository {
  constructor(private readonly database: PrismaClient) {}

  /**
   * Batched, user-scoped context for building the plan: active target with its
   * saved job analysis, profile role, scored interviews, and the existing plan.
   */
  context(userId: string) {
    return Promise.all([
      this.database.careerTarget.findFirst({
        where: { userId, status: "ACTIVE" },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          title: true,
          company: true,
          jobDescription: {
            select: {
              deletedAt: true,
              analysis: { select: { requiredSkills: true } },
            },
          },
        },
      }),
      this.database.userProfile.findUnique({
        where: { userId },
        select: { targetRole: true },
      }),
      this.database.interview.findMany({
        where: { userId, status: "COMPLETED", report: { is: { status: "READY" } } },
        select: {
          id: true,
          interviewType: true,
          completedAt: true,
          report: { select: { evaluation: true } },
        },
        orderBy: { completedAt: "asc" },
      }),
      this.database.practicePlan.findUnique({
        where: { userId },
        include: { items: { orderBy: { position: "asc" } } },
      }),
    ]);
  }

  findPlan(userId: string) {
    return this.database.practicePlan.findUnique({
      where: { userId },
      include: { items: { orderBy: { position: "asc" } } },
    });
  }

  /** Replaces the user's plan atomically; completed items are carried over by the service. */
  replacePlan(
    userId: string,
    data: {
      version: number;
      goal: string;
      targetRole: string | null;
      careerTargetId: string | null;
      basedOnInterviewIds: string[];
      basedOnValidReportCount: number;
      items: Array<{
        position: number;
        phase: string;
        priority: string;
        activityType: string;
        title: string;
        description: string | null;
        rationale: string;
        estimatedMinutes: number;
        status: string;
        completedAt: Date | null;
      }>;
    },
  ) {
    return this.database.$transaction(async (tx) => {
      await tx.practicePlan.deleteMany({ where: { userId } });
      return tx.practicePlan.create({
        data: {
          userId,
          status: "READY",
          version: data.version,
          goal: data.goal,
          targetRole: data.targetRole,
          careerTargetId: data.careerTargetId,
          basedOnInterviewIds: data.basedOnInterviewIds,
          basedOnValidReportCount: data.basedOnValidReportCount,
          generatedAt: new Date(),
          items: { create: data.items },
        },
        include: { items: { orderBy: { position: "asc" } } },
      });
    });
  }

  /** Ownership-scoped lookup of a single item through its plan. */
  findItem(userId: string, itemId: string) {
    return this.database.practicePlanItem.findFirst({
      where: { id: itemId, practicePlan: { userId } },
    });
  }

  updateItemStatus(itemId: string, status: string, completedAt: Date | null) {
    return this.database.practicePlanItem.update({
      where: { id: itemId },
      data: { status, completedAt },
    });
  }
}
