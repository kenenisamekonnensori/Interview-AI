import type { ServerEnvironment } from "@interviewer-ai/config";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import type { PrismaClient } from "@prisma/client";
import type { BetterAuthOptions } from "better-auth";

import { createAuthEmailOutbox } from "./email-outbox.js";

type AuthLogger = {
  error: (error: unknown, message: string) => void;
};

export function createAuthConfig(
  environment: ServerEnvironment,
  database: PrismaClient,
  logger: AuthLogger,
): BetterAuthOptions {
  const emailOutbox = createAuthEmailOutbox(database);

  return {
    baseURL: environment.BETTER_AUTH_URL,
    database: prismaAdapter(database, {
      provider: "postgresql",
    }),
    secret: environment.BETTER_AUTH_SECRET,
    trustedOrigins: [environment.WEB_URL],
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      requireEmailVerification: true,
    },
    emailVerification: {
      sendVerificationEmail: async ({ user, url }) => {
        void emailOutbox
          .enqueue({
            userId: user.id,
            recipient: user.email,
            message: {
              kind: "verify-email",
              name: user.name,
              verificationUrl: url,
            },
          })
          .catch((error: unknown) => {
            logger.error(error, "Unable to enqueue email verification message");
          });
      },
      afterEmailVerification: async (user) => {
        void emailOutbox
          .enqueueWelcome({
            userId: user.id,
            recipient: user.email,
            name: user.name,
          })
          .catch((error: unknown) => {
            logger.error(error, "Unable to enqueue welcome email");
          });
      },
    },
  };
}
