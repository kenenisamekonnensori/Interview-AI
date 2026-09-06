import { randomUUID } from "node:crypto";

import type { PrismaClient } from "../../../prisma/generated/client.js";
import { z } from "zod";

const welcomeEmailSchema = z.object({
  kind: z.literal("welcome"),
  name: z.string(),
});

export const authEmailMessageSchema = z.discriminatedUnion("kind", [welcomeEmailSchema]);

export type AuthEmailMessage = z.infer<typeof authEmailMessageSchema>;

import type { MonolithExecutionManager } from "../../services/monolith-execution.js";

export function createAuthEmailOutbox(database: PrismaClient, monolith?: MonolithExecutionManager) {
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
      monolith?.dispatchAuthEmail();
    },
    enqueueWelcome: async ({
      userId,
      recipient,
      name,
    }: {
      userId: string;
      recipient: string;
      name: string;
    }) => {
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
      monolith?.dispatchAuthEmail();
    },
  };
}
