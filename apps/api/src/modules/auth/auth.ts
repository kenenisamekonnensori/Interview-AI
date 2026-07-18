import type { ServerEnvironment } from "@interviewer-ai/config";
import { betterAuth } from "better-auth/minimal";

import { createAuthConfig } from "./config.js";
import { createAuthDatabase } from "./database.js";

export function createAuth(environment: ServerEnvironment) {
  const database = createAuthDatabase(environment.DATABASE_URL);

  return {
    auth: betterAuth(createAuthConfig(environment, database)),
    dispose: () => database.$disconnect(),
  };
}
