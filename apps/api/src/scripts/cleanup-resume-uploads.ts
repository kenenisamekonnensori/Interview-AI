import "../load-environment.js";

import { serverEnvironmentSchema } from "@interviewer-ai/config";

import { createAuthDatabase } from "../modules/auth/database.js";
import { deleteResumeObject } from "../modules/resumes/storage.js";

const execute = process.argv.includes("--execute");
const environment = serverEnvironmentSchema.parse(process.env);
const database = createAuthDatabase(environment.DATABASE_URL);
const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1_000);

try {
  const candidates = await database.resume.findMany({
    where: { status: "PENDING_UPLOAD", createdAt: { lt: cutoff }, deletedAt: null },
    select: { id: true, storageKey: true },
    take: 500,
  });
  if (!execute) {
    console.log(
      `Dry run: ${candidates.length} abandoned uploads older than 24 hours. Re-run with --execute.`,
    );
  } else {
    for (const resume of candidates) {
      await deleteResumeObject(environment, resume.storageKey);
      await database.resume.update({
        where: { id: resume.id },
        data: { status: "DELETED", deletedAt: new Date(), isActive: false },
      });
    }
    console.log(`Removed ${candidates.length} abandoned uploads.`);
  }
} finally {
  await database.$disconnect();
}
