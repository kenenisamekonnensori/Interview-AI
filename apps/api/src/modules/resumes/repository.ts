import type { PrismaClient } from "../../../prisma/generated/client.js";

export function createResumeRepository(database: PrismaClient) {
  return {
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
        where: { userId, deletedAt: null, ...(includePending ? {} : { status: "READY" }) },
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
