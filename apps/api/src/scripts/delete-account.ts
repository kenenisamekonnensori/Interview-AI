import "../load-environment.js";

import { serverEnvironmentSchema } from "@interviewer-ai/config";

import { createAuthDatabase } from "../modules/auth/database.js";
import { deleteOwnedAccount } from "../services/account-deletion.js";

const [userId, confirmation] = process.argv.slice(2);
if (!userId || confirmation !== "--confirm") {
  throw new Error("Usage: delete-account <user-id> --confirm");
}

const environment = serverEnvironmentSchema.parse(process.env);
const database = createAuthDatabase(environment.DATABASE_URL);

try {
  const result = await deleteOwnedAccount({ database, environment, userId });
  console.log(
    result.deleted ? `Deleted account and ${result.objectCount} R2 objects.` : "Account not found.",
  );
} finally {
  await database.$disconnect();
}
