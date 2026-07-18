import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@prisma/client";
import { z } from "zod";

const verificationEmailSchema = z.object({
  kind: z.literal("verify-email"),
  name: z.string(),
  verificationUrl: z.url(),
});

const welcomeEmailSchema = z.object({
  kind: z.literal("welcome"),
  name: z.string(),
});

export const authEmailMessageSchema = z.discriminatedUnion("kind", [
  verificationEmailSchema,
  welcomeEmailSchema,
]);

export type AuthEmailMessage = z.infer<typeof authEmailMessageSchema>;

export function createAuthEmailOutbox(database: PrismaClient) {
  return {
    enqueue: async ({
      userId,
      recipient,
      message,
      eventKey,
    }: {
      userId: string;
      recipient: string;
      message: AuthEmailMessage;
      eventKey?: string;
    }) => {
      await database.authEmailOutbox.create({
        data: {
          id: randomUUID(),
          userId,
          recipient,
          payload: message,
          ...(eventKey === undefined ? {} : { eventKey }),
        },
      });
    },
    enqueueWelcome: async ({ userId, recipient, name }: { userId: string; recipient: string; name: string }) => {
      const eventKey = `welcome:${userId}`;

      await database.authEmailOutbox.upsert({
        where: { eventKey },
        create: {
          id: randomUUID(),
          eventKey,
          userId,
          recipient,
          payload: { kind: "welcome", name },
        },
        update: {},
      });
    },
  };
}
