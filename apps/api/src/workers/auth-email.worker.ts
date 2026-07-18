import { setTimeout as delay } from "node:timers/promises";

import { serverEnvironmentSchema } from "@interviewer-ai/config";
import type { AuthEmailOutbox, PrismaClient } from "@prisma/client";

import { createAuthDatabase } from "../modules/auth/database.js";
import { authEmailMessageSchema, type AuthEmailMessage } from "../modules/auth/email-outbox.js";

const POLL_INTERVAL_MS = 1_000;
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

  if (message.kind === "verify-email") {
    return {
      subject: "Confirm your Interviewer AI email address",
      html: `<p>Hi ${name},</p><p>Confirm your email address to activate your Interviewer AI account.</p><p><a href="${message.verificationUrl}">Confirm email address</a></p><p>If you did not create this account, you can ignore this email.</p>`,
      text: `Hi ${message.name},\n\nConfirm your email address to activate your Interviewer AI account: ${message.verificationUrl}\n\nIf you did not create this account, you can ignore this email.`,
    };
  }

  return {
    subject: "Welcome to Interviewer AI",
    html: `<p>Hi ${name},</p><p>Welcome to Interviewer AI. Your account is ready for interview practice.</p>`,
    text: `Hi ${message.name},\n\nWelcome to Interviewer AI. Your account is ready for interview practice.`,
  };
}

async function sendEmail(
  environment: ReturnType<typeof serverEnvironmentSchema.parse>,
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

async function claimNextEmail(database: PrismaClient) {
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

  if (!email) {
    return null;
  }

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

async function markEmailFailure(database: PrismaClient, email: AuthEmailOutbox, error: unknown) {
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

async function processNextEmail(
  database: PrismaClient,
  environment: ReturnType<typeof serverEnvironmentSchema.parse>,
) {
  const email = await claimNextEmail(database);

  if (!email) {
    return false;
  }

  const message = authEmailMessageSchema.safeParse(email.payload);

  if (!message.success) {
    await markEmailFailure(database, email, new Error("Invalid auth email payload"));
    return true;
  }

  try {
    await sendEmail(environment, email.recipient, message.data);
    await database.authEmailOutbox.update({
      where: { id: email.id },
      data: { completedAt: new Date(), lockedAt: null },
    });
  } catch (error) {
    await markEmailFailure(database, email, error);
  }

  return true;
}

const environment = serverEnvironmentSchema.parse(process.env);
const database = createAuthDatabase(environment.DATABASE_URL);
let shuttingDown = false;

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    shuttingDown = true;
  });
}

while (!shuttingDown) {
  const processed = await processNextEmail(database, environment);

  if (!processed) {
    await delay(POLL_INTERVAL_MS);
  }
}

await database.$disconnect();
