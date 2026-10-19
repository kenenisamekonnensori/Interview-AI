import type { ServerEnvironment } from "@interviewer-ai/config";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import type { PrismaClient } from "../../../prisma/generated/client.js";
import type { BetterAuthOptions } from "better-auth";

import type Redis from "ioredis";
import { createAuthEmailOutbox } from "./email-outbox.js";
import { createRedisSecondaryStorage } from "./storage.js";

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
  redis?: Redis,
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
    onAPIError: {
      errorURL: `${environment.WEB_URL}/sign-in`,
    },
    database: prismaAdapter(database, {
      provider: "postgresql",
    }),
    ...(redis ? { secondaryStorage: createRedisSecondaryStorage(redis) } : {}),
    secret: environment.BETTER_AUTH_SECRET,
    trustedOrigins: [environment.WEB_URL],
    socialProviders,
    account: {
      accountLinking: {
        enabled: true,
        // Enforce explicit account linking to prevent account takeover if alternative
        // providers (or credentials) are enabled in the future.
        disableImplicitLinking: true,
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
            // When a new user signs up, initialize their profile with their name as the default preferredName
            if (user?.id && database?.userProfile?.upsert) {
              try {
                const trimmedName = user.name?.trim() || null;
                await database.userProfile.upsert({
                  where: { userId: user.id },
                  create: {
                    userId: user.id,
                    preferredName: trimmedName,
                  },
                  update: {},
                });
              } catch (error: unknown) {
                logger.error(
                  { errorType: error instanceof Error ? error.name : "UnknownError" },
                  "Unable to initialize user profile with default name on user create",
                );
              }
            }

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
      session: {
        create: {
          after: async (session) => {
            // When a user signs in, ensure their profile exists and has their name by default if not already customized
            if (session?.userId && database?.userProfile) {
              try {
                const existing = await database.userProfile.findUnique?.({
                  where: { userId: session.userId },
                  select: { preferredName: true },
                });

                if (!existing) {
                  const user = await database.user?.findUnique?.({
                    where: { id: session.userId },
                    select: { name: true },
                  });
                  const defaultName = user?.name?.trim() || null;
                  await database.userProfile.create?.({
                    data: {
                      userId: session.userId,
                      preferredName: defaultName,
                    },
                  });
                } else if (!existing.preferredName) {
                  // Only fill if preferredName is missing or null; never overwrite an edited preferred name
                  const user = await database.user?.findUnique?.({
                    where: { id: session.userId },
                    select: { name: true },
                  });
                  const defaultName = user?.name?.trim() || null;
                  if (defaultName) {
                    await database.userProfile.update?.({
                      where: { userId: session.userId },
                      data: { preferredName: defaultName },
                    });
                  }
                }
              } catch (error: unknown) {
                logger.error(
                  { errorType: error instanceof Error ? error.name : "UnknownError" },
                  "Unable to default user profile name on session create",
                );
              }
            }
          },
        },
      },
    },
  };
}
