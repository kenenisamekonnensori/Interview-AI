import type { PrismaClient } from "../../../prisma/generated/client.js";

export class InterviewRepository {
  constructor(private readonly database: PrismaClient) {}

  findOwned(id: string, userId: string) {
    return this.database.interview.findFirst({
      where: { id, userId },
      include: {
        plan: true,
        conversation: { include: { turns: { orderBy: { sequence: "asc" } } } },
        report: true,
        resume: { select: { id: true, fileName: true } },
        jobDescription: { select: { id: true, title: true, company: true } },
      },
    });
  }

  listOwned(userId: string) {
    return this.database.interview.findMany({
      where: { userId },
      include: {
        resume: { select: { id: true, fileName: true } },
        jobDescription: { select: { id: true, title: true, company: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }
}
