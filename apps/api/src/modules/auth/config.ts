import type { ServerEnvironment } from "@interviewer-ai/config";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import type { PrismaClient } from "../../../prisma/generated/client.js";
import type { BetterAuthOptions } from "better-auth";

import { createAuthEmailOutbox } from "./email-outbox.js";

type AuthLogger = {
  error: (payload: unknown, message: string) => void;
};

function logOutboxError(logger: AuthLogger, error: unknown, message: string) {
  logger.error({ errorType: error instanceof Error ? error.name : "UnknownError" }, message);
}

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
    socialProviders: {
      google: {
        clientId: environment.GOOGLE_CLIENT_ID,
        clientSecret: environment.GOOGLE_CLIENT_SECRET,
        prompt: "select_account",
        scope: ["openid", "email", "profile"],
      },
    },
    account: {
      accountLinking: {
        enabled: true,
        disableImplicitLinking: false,
      },
    },
    session: {
      expiresIn: 30 * 24 * 60 * 60,
      updateAge: 24 * 60 * 60,
      freshAge: 10 * 60,
    },
    advanced: {
      useSecureCookies: environment.NODE_ENV === "production",
      cookiePrefix: "interviewer-ai",
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            if (!user.emailVerified) {
              return;
            }

            void emailOutbox
              .enqueueWelcome({
                userId: user.id,
                recipient: user.email,
                name: user.name,
              })
              .catch((error: unknown) => {
                logOutboxError(logger, error, "Unable to enqueue Google welcome email");
              });
          },
        },
      },
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
            logOutboxError(logger, error, "Unable to enqueue email verification message");
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
            logOutboxError(logger, error, "Unable to enqueue welcome email");
          });
      },
    },
  };
}
