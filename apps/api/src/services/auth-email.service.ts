import type { ServerEnvironment } from "@interviewer-ai/config";
import type { AuthEmailOutbox, PrismaClient } from "../../prisma/generated/client.js";
import { authEmailMessageSchema, type AuthEmailMessage } from "../modules/auth/email-outbox.js";

const LOCK_TIMEOUT_MS = 5 * 60 * 1_000;
const MAX_ATTEMPTS = 5;

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    };
    return entities[character] ?? character;
  });
}

function createEmailContent(message: AuthEmailMessage) {
  const name = escapeHtml(message.name);
  return {
    subject: "Welcome to Interviewer AI",
    html: `<p>Hi ${name},</p><p>Welcome to Interviewer AI. Your account is ready for interview practice.</p>`,
    text: `Hi ${message.name},\n\nWelcome to Interviewer AI. Your account is ready for interview practice.`,
  };
}

export async function sendAuthEmail(
  environment: ServerEnvironment,
  recipient: string,
  message: AuthEmailMessage,
) {
  const content = createEmailContent(message);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${environment.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: environment.EMAIL_FROM,
      to: [recipient],
      ...content,
    }),
  });

  if (!response.ok) {
    throw new Error(`Resend rejected the email with status ${response.status}`);
  }
}

export async function claimNextAuthEmail(database: PrismaClient) {
  const now = new Date();
  const lockExpiry = new Date(now.getTime() - LOCK_TIMEOUT_MS);
  const email = await database.authEmailOutbox.findFirst({
    where: {
      completedAt: null,
      failedAt: null,
      availableAt: { lte: now },
      OR: [{ lockedAt: null }, { lockedAt: { lt: lockExpiry } }],
    },
    orderBy: { createdAt: "asc" },
  });

  if (!email) return null;

  const claim = await database.authEmailOutbox.updateMany({
    where: {
      id: email.id,
      completedAt: null,
      failedAt: null,
      OR: [{ lockedAt: null }, { lockedAt: { lt: lockExpiry } }],
    },
    data: { lockedAt: now },
  });

  return claim.count === 1 ? email : null;
}

export async function markAuthEmailFailure(
  database: PrismaClient,
  email: AuthEmailOutbox,
  error: unknown,
) {
  const attempts = email.attempts + 1;
  const message = error instanceof Error ? error.message : "Unknown email delivery error";

  await database.authEmailOutbox.update({
    where: { id: email.id },
    data:
      attempts >= MAX_ATTEMPTS
        ? { attempts, failedAt: new Date(), lockedAt: null, lastError: message }
        : {
            attempts,
            availableAt: new Date(Date.now() + 2 ** attempts * 1_000),
            lockedAt: null,
            lastError: message,
          },
  });
}

/**
 * Core business logic for processing an outbox email.
 * Reused by both Monolith Mode (direct execution on enqueue) and Worker Mode (auth-email.worker.ts).
 */
export async function processNextAuthEmail(database: PrismaClient, environment: ServerEnvironment) {
  const email = await claimNextAuthEmail(database);
  if (!email) return false;

  const message = authEmailMessageSchema.safeParse(email.payload);
  if (!message.success) {
    await markAuthEmailFailure(database, email, new Error("Invalid auth email payload"));
    return true;
  }

  try {
    await sendAuthEmail(environment, email.recipient, message.data);
    await database.authEmailOutbox.update({
      where: { id: email.id },
      data: { completedAt: new Date(), lockedAt: null },
    });
  } catch (error) {
    await markAuthEmailFailure(database, email, error);
  }

  return true;
}
