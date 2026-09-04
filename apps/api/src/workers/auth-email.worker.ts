import "../load-environment.js";

import { setTimeout as delay } from "node:timers/promises";

import { serverEnvironmentSchema } from "@interviewer-ai/config";

import { createAuthDatabase } from "../modules/auth/database.js";
import { processNextAuthEmail } from "../services/auth-email.service.js";

/**
 * Auth Email Worker (Worker Mode - Future Architecture).
 * Preserved intact for multi-process email polling deployments.
 * Delegates processing to the reusable application service.
 */

const POLL_INTERVAL_MS = 1_000;

const environment = serverEnvironmentSchema.parse(process.env);
const database = createAuthDatabase(environment.DATABASE_URL);
let shuttingDown = false;

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    shuttingDown = true;
  });
}

while (!shuttingDown) {
  const processed = await processNextAuthEmail(database, environment);

  if (!processed) {
    await delay(POLL_INTERVAL_MS);
  }
}

await database.$disconnect();
