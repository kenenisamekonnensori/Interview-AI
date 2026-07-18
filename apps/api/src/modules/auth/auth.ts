import type { ServerEnvironment } from "@interviewer-ai/config";
import { betterAuth } from "better-auth/minimal";
import type { FastifyBaseLogger } from "fastify";

import { createAuthConfig } from "./config.js";
import { createAuthDatabase } from "./database.js";

export function createAuth(environment: ServerEnvironment, logger: FastifyBaseLogger) {
  const database = createAuthDatabase(environment.DATABASE_URL);

  return {
    auth: betterAuth(createAuthConfig(environment, database, logger)),
    dispose: () => database.$disconnect(),
  };
}
