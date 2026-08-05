import type { ServerEnvironment } from "@interviewer-ai/config";
import { betterAuth } from "better-auth/minimal";
import type { FastifyBaseLogger } from "fastify";

import { createAuthConfig } from "./config.js";
import { createAuthDatabase } from "./database.js";

import type { PrismaClient } from "../../../prisma/generated/client.js";
import type { MonolithExecutionManager } from "../../services/monolith-execution.js";

export function createAuth(
  environment: ServerEnvironment,
  logger: FastifyBaseLogger,
  monolithFactory?: (database: PrismaClient) => MonolithExecutionManager,
) {
  const database = createAuthDatabase(environment.DATABASE_URL);
  const monolith = monolithFactory ? monolithFactory(database) : undefined;

  return {
    auth: betterAuth(createAuthConfig(environment, database, logger, monolith)),
    database,
    monolith,
    dispose: () => database.$disconnect(),
  };
}
