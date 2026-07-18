import type { ServerEnvironment } from "@interviewer-ai/config";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import type { PrismaClient } from "@prisma/client";
import type { BetterAuthOptions } from "better-auth";

export function createAuthConfig(
  environment: ServerEnvironment,
  database: PrismaClient,
): BetterAuthOptions {
  return {
    baseURL: environment.BETTER_AUTH_URL,
    database: prismaAdapter(database, {
      provider: "postgresql",
    }),
    secret: environment.BETTER_AUTH_SECRET,
    trustedOrigins: [environment.WEB_URL],
  };
}
