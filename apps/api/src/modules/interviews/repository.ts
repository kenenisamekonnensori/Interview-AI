import type { PrismaClient } from "../../../prisma/generated/client.js";

export class InterviewRepository {
  constructor(private readonly database: PrismaClient) {}

  findOwned(id: string, userId: string) {
    return this.database.interview.findFirst({
      where: { id, userId },
      include: {
        plan: true,
        conversation: {
          include: {
            // The live view needs recent context, not an unbounded transcript on every refresh.
            turns: { orderBy: { sequence: "desc" }, take: 60 },
          },
        },
        report: true,
        resume: { select: { id: true, fileName: true, deletedAt: true } },
        jobDescription: { select: { id: true, title: true, company: true, deletedAt: true } },
      },
    });
  }

  listOwned(userId: string) {
    return this.database.interview.findMany({
      where: { userId },
      include: {
        resume: { select: { id: true, fileName: true, deletedAt: true } },
        jobDescription: { select: { id: true, title: true, company: true, deletedAt: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }
}
