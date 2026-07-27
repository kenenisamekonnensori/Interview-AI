import { deleteResumeObject } from "../modules/resumes/storage.js";

type AccountDeletionDatabase = {
  user: {
    findUnique: (input: {
      where: { id: string };
      select: { id: true; resumes: { select: { storageKey: true } } };
    }) => Promise<{ id: string; resumes: Array<{ storageKey: string }> } | null>;
    delete: (input: { where: { id: string } }) => Promise<unknown>;
  };
};

/**
 * Operator-only deletion: removes R2 objects first, then deletes the user so
 * database cascades remove all owned records. A storage failure leaves the
 * account intact and makes the operation safely retryable.
 */
export async function deleteOwnedAccount({
  database,
  environment,
  userId,
  removeObject = deleteResumeObject,
}: {
  database: AccountDeletionDatabase;
  environment: Parameters<typeof deleteResumeObject>[0];
  userId: string;
  removeObject?: typeof deleteResumeObject;
}) {
  const user = await database.user.findUnique({
    where: { id: userId },
    select: { id: true, resumes: { select: { storageKey: true } } },
  });
  if (!user) return { deleted: false, objectCount: 0 };
  for (const resume of user.resumes) await removeObject(environment, resume.storageKey);
  await database.user.delete({ where: { id: user.id } });
  return { deleted: true, objectCount: user.resumes.length };
}
