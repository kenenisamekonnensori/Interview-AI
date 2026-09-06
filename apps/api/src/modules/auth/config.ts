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

import type { MonolithExecutionManager } from "../../services/monolith-execution.js";

export function createAuthConfig(
  environment: ServerEnvironment,
  database: PrismaClient,
  logger: AuthLogger,
  monolith?: MonolithExecutionManager,
): BetterAuthOptions {
  const emailOutbox = createAuthEmailOutbox(database, monolith);

  const socialProviders: NonNullable<BetterAuthOptions["socialProviders"]> = {
    google: {
      clientId: environment.GOOGLE_CLIENT_ID,
      clientSecret: environment.GOOGLE_CLIENT_SECRET,
      prompt: "select_account",
      scope: ["openid", "email", "profile"],
    },
  };

  if (environment.GITHUB_CLIENT_ID && environment.GITHUB_CLIENT_SECRET) {
    socialProviders.github = {
      clientId: environment.GITHUB_CLIENT_ID,
      clientSecret: environment.GITHUB_CLIENT_SECRET,
      redirectURI: `${environment.BETTER_AUTH_URL.replace(/\/$/, "")}/api/auth/callback/github`,
    };
  }

  return {
    baseURL: environment.BETTER_AUTH_URL,
    database: prismaAdapter(database, {
      provider: "postgresql",
    }),
    secret: environment.BETTER_AUTH_SECRET,
    trustedOrigins: [environment.WEB_URL],
    socialProviders,
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
                logOutboxError(logger, error, "Unable to enqueue welcome email");
              });
          },
        },
      },
    },
  };
}