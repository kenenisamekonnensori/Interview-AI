import type { PrismaClient } from "../../../prisma/generated/client.js";

export function createResumeRepository(database: PrismaClient) {
  return {
    /**
     * Transitions READY | ANALYZED | FAILED -> ANALYZING and stamps the dispatch
     * time. Returns the number of matching rows: callers dispatch work only
     * when this returns 1, which is what keeps concurrent /analyze requests
     * from dispatching duplicate jobs.
     */
    beginAnalysis: async (id: string) =>
      (
        await database.resume.updateMany({
          where: { id, status: { in: ["READY", "ANALYZED", "FAILED"] } },
          data: { status: "ANALYZING", analysisFailureCode: null, analysisStartedAt: new Date() },
        })
      ).count,
    /**
     * Claims a stale ANALYZING resume for one new dispatch. The atomic
     * compare-and-swap on analysisStartedAt guarantees exactly one dispatcher
     * wins even when several requests race; it returns 1 for that winner.
     */
    claimStaleAnalysis: async (id: string, staleBefore: Date) =>
      (
        await database.resume.updateMany({
          where: { id, status: "ANALYZING", analysisStartedAt: { lt: staleBefore } },
          data: { analysisStartedAt: new Date() },
        })
      ).count,
    create: (data: {
      userId: string;
      storageKey: string;
      fileName: string;
      mimeType: string;
      fileSize: number;
    }) => database.resume.create({ data }),
    findOwned: (id: string, userId: string) =>
      database.resume.findFirst({ where: { id, userId, deletedAt: null } }),
    list: (userId: string, includePending: boolean) =>
      database.resume.findMany({
        where: {
          userId,
          deletedAt: null,
          ...(includePending ? {} : { status: { not: "PENDING_UPLOAD" } }),
        },
        orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
      }),
    complete: (id: string) =>
      database.resume.update({ where: { id }, data: { status: "READY", uploadedAt: new Date() } }),
    activate: async (id: string, userId: string) =>
      database.$transaction(async (transaction) => {
        await transaction.resume.updateMany({
          where: { userId, isActive: true },
          data: { isActive: false },
        });
        return transaction.resume.update({ where: { id }, data: { isActive: true } });
      }),
    setActiveWhenNone: async (id: string, userId: string) =>
      database.$transaction(async (transaction) => {
        const active = await transaction.resume.findFirst({
          where: { userId, isActive: true, deletedAt: null },
        });
        return active
          ? null
          : transaction.resume.update({ where: { id }, data: { isActive: true } });
      }),
    softDelete: (id: string) =>
      database.resume.update({
        where: { id },
        data: { deletedAt: new Date(), status: "DELETED", isActive: false },
      }),
  };
}
