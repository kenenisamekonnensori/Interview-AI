import assert from "node:assert/strict";
import { test } from "vitest";

import { interviewConfigurationSchema } from "@interviewer-ai/types";
import { createJobDescriptionSchema } from "../modules/jobs/schema.js";
import { generatedReportSchema } from "../modules/reports/schema.js";
import { createResumeUploadSchema } from "../modules/resumes/schema.js";
import {
  assertConversationTransition,
  assertInterviewTransition,
  InvalidStateTransitionError,
} from "../modules/conversation/state-machine.js";
import { interviewerResponseProposalSchema } from "../modules/ai/output-schema.js";
import { AiProviderError } from "../modules/ai/errors.js";
import { withAiRetry } from "../modules/ai/retry.js";
import { RequestRateLimiter, requestRateLimitPolicy } from "../services/request-rate-limit.js";
import { configuredCorsOrigins } from "../services/security.js";
import { assertResumeMimeMatchesContent, ResumeParseError } from "../modules/resumes/parser.js";
import { serverEnvironmentSchema } from "@interviewer-ai/config";
import { createRequestId, redactObservabilityAttributes } from "../services/observability.js";
import { classifyQueueFailure, processQueueJob } from "../services/queue-worker.js";
import { deleteOwnedAccount } from "../services/account-deletion.js";
import {
  pendingAiResponseRecovery,
  recoveryForAiResponseFailure,
  replayGeneratedResponse,
} from "../modules/conversation/recovery.js";
import {
  DeepgramConfigurationError,
  grantDeepgramAccessToken,
} from "../modules/conversation/deepgram.js";

const firstTurn = "11111111-1111-4111-8111-111111111111";
const secondTurn = "22222222-2222-4222-8222-222222222222";

test("interview lifecycle accepts only documented transitions", () => {
  assert.doesNotThrow(() => assertInterviewTransition("READY", "IN_PROGRESS"));
  assert.doesNotThrow(() => assertInterviewTransition("IN_PROGRESS", "COMPLETING"));
  assert.doesNotThrow(() => assertInterviewTransition("COMPLETING", "COMPLETED"));
  assert.throws(
    () => assertInterviewTransition("COMPLETED", "IN_PROGRESS"),
    InvalidStateTransitionError,
  );
  assert.throws(
    () => assertInterviewTransition("DRAFT", "IN_PROGRESS"),
    /Invalid interview transition/,
  );
});

test("conversation lifecycle rejects terminal and skipped states", () => {
  assert.doesNotThrow(() => assertConversationTransition("GREETING", "SPEAKING"));
  assert.doesNotThrow(() => assertConversationTransition("SPEAKING", "LISTENING"));
  assert.doesNotThrow(() => assertConversationTransition("LISTENING", "CLOSING"));
  assert.throws(() => assertConversationTransition("COMPLETED", "LISTENING"));
  assert.throws(() => assertConversationTransition("LISTENING", "SPEAKING"));
});

test("AI failure after transcript persistence returns safe recovery while keeping THINKING", () => {
  assert.deepEqual(recoveryForAiResponseFailure("THINKING"), pendingAiResponseRecovery);
  assert.equal(pendingAiResponseRecovery.transcriptSaved, true);
  assert.equal(pendingAiResponseRecovery.retryable, true);
  assert.equal(recoveryForAiResponseFailure("SPEAKING"), null);
});

test("a pending response retry advances from THINKING to SPEAKING only after an AI turn exists", () => {
  assert.doesNotThrow(() => assertConversationTransition("THINKING", "SPEAKING"));
  assert.throws(() => assertConversationTransition("THINKING", "LISTENING"));
});

test("repeated response retries replay the persisted AI turn without creating another turn", () => {
  const turn = {
    id: firstTurn,
    sequence: 4,
    speaker: "AI" as const,
    type: "QUESTION" as const,
    text: "What trade-offs did you consider?",
    createdAt: new Date("2026-07-27T00:00:00.000Z"),
  };
  const result = replayGeneratedResponse("SPEAKING", [turn]);
  assert.deepEqual(result, { turn, state: "SPEAKING", replayed: true });
  assert.equal(replayGeneratedResponse("THINKING", [turn]), null);
});

test("an interview can end after an AI failure without reopening the conversation", () => {
  assert.doesNotThrow(() => assertConversationTransition("THINKING", "CLOSING"));
  assert.doesNotThrow(() => assertConversationTransition("CLOSING", "COMPLETED"));
  assert.throws(() => assertConversationTransition("COMPLETED", "THINKING"));
});

test("an unavailable voice token is explicit so a client can switch to text", async () => {
  await assert.rejects(
    grantDeepgramAccessToken({ DEEPGRAM_API_KEY: undefined } as never),
    DeepgramConfigurationError,
  );
});

test("a typed answer follows the same full conversation turn transitions", () => {
  assert.doesNotThrow(() => assertConversationTransition("LISTENING", "TRANSCRIBING"));
  assert.doesNotThrow(() => assertConversationTransition("TRANSCRIBING", "THINKING"));
  assert.doesNotThrow(() => assertConversationTransition("THINKING", "SPEAKING"));
  assert.doesNotThrow(() => assertConversationTransition("SPEAKING", "LISTENING"));
});

test("voice and playback failures can continue through the normal acknowledgement transition", () => {
  assert.doesNotThrow(() => assertConversationTransition("SPEAKING", "LISTENING"));
  assert.doesNotThrow(() => assertConversationTransition("LISTENING", "TRANSCRIBING"));
});

test("text submission is prevented outside the server-owned listening state", () => {
  assert.throws(() => assertConversationTransition("SPEAKING", "TRANSCRIBING"));
  assert.throws(() => assertConversationTransition("THINKING", "TRANSCRIBING"));
});

test("a restored listening session can accept the next persisted transcript", () => {
  assert.doesNotThrow(() => assertConversationTransition("LISTENING", "TRANSCRIBING"));
});

test("a restored thinking session accepts only the pending AI response or completion", () => {
  assert.doesNotThrow(() => assertConversationTransition("THINKING", "SPEAKING"));
  assert.doesNotThrow(() => assertConversationTransition("THINKING", "CLOSING"));
  assert.throws(() => assertConversationTransition("THINKING", "TRANSCRIBING"));
});

test("a restored speaking session can safely acknowledge playback after reconnect", () => {
  assert.doesNotThrow(() => assertConversationTransition("SPEAKING", "LISTENING"));
  assert.throws(() => assertConversationTransition("SPEAKING", "THINKING"));
});

test("interview, resume, and job inputs enforce documented limits", () => {
  assert.equal(
    interviewConfigurationSchema.safeParse({
      interviewType: "TECHNICAL",
      difficulty: "MEDIUM",
      durationMinutes: 30,
      language: "en",
    }).success,
    true,
  );
  assert.equal(
    createResumeUploadSchema.safeParse({
      fileName: "resume.pdf",
      mimeType: "text/plain",
      fileSize: 200,
    }).success,
    false,
  );
  assert.equal(createJobDescriptionSchema.safeParse({ rawText: "too short" }).success, false);
  assert.equal(createJobDescriptionSchema.safeParse({ rawText: "x".repeat(100) }).success, true);
});

test("AI interviewer proposals reject inconsistent actions and extra fields", () => {
  const valid = {
    responseText: "Tell me about a time you handled a production incident.",
    responseType: "QUESTION",
    recommendedAction: "ASK_QUESTION",
    suggestedNextConversationState: "SPEAKING",
  };
  assert.equal(interviewerResponseProposalSchema.safeParse(valid).success, true);
  assert.equal(
    interviewerResponseProposalSchema.safeParse({ ...valid, recommendedAction: "CLOSE_INTERVIEW" })
      .success,
    false,
  );
  assert.equal(
    interviewerResponseProposalSchema.safeParse({ ...valid, internalReasoning: "ignore" }).success,
    false,
  );
});

test("report schema requires score evidence and transcript references", () => {
  const dimension = {
    score: 72,
    feedback: "Explained the trade-off clearly.",
    evidenceTurnIds: [firstTurn],
  };
  const report = {
    evaluation: {
      overallScore: 72,
      technical: dimension,
      communication: dimension,
      confidence: dimension,
      problemSolving: dimension,
      categoryScores: { Architecture: dimension },
      strengths: [{ text: "Clear trade-off explanation.", evidenceTurnIds: [firstTurn] }],
      weaknesses: [{ text: "Could quantify impact.", evidenceTurnIds: [secondTurn] }],
      missedOpportunities: [],
      recommendations: ["Add measurable outcomes to examples."],
    },
    summary: "A solid technical discussion with a clear improvement area.",
    hiringRecommendation: "HIRE",
    evidence: [{ turnId: firstTurn, claim: "Explained a trade-off." }],
  };
  assert.equal(generatedReportSchema.safeParse(report).success, true);
  assert.equal(
    generatedReportSchema.safeParse({
      ...report,
      evaluation: { ...report.evaluation, technical: { score: 72, feedback: "Missing evidence" } },
    }).success,
    false,
  );
});

test("AI retry retries transient failures but does not retry invalid output", async () => {
  let transientAttempts = 0;
  const value = await withAiRetry(async () => {
    transientAttempts += 1;
    if (transientAttempts < 3) throw new AiProviderError("TRANSIENT", "timeout");
    return "recovered";
  });
  assert.equal(value, "recovered");
  assert.equal(transientAttempts, 3);
  let invalidAttempts = 0;
  await assert.rejects(
    withAiRetry(async () => {
      invalidAttempts += 1;
      throw new AiProviderError("INVALID_OUTPUT", "bad JSON");
    }),
    AiProviderError,
  );
  assert.equal(invalidAttempts, 1);
});

test("rate-limit policies cover authentication and expensive candidate actions", () => {
  assert.deepEqual(requestRateLimitPolicy("POST", "/api/auth/sign-in/email"), {
    name: "authentication",
    limit: 10,
    windowSeconds: 600,
  });
  assert.equal(requestRateLimitPolicy("POST", "/api/v1/resumes/uploads")?.name, "resume-upload");
  assert.equal(
    requestRateLimitPolicy("POST", "/api/v1/interviews/interview-id/voice-token")?.name,
    "voice-token",
  );
  assert.equal(
    requestRateLimitPolicy("POST", "/api/v1/interviews/interview-id/conversation/transcripts")
      ?.name,
    "conversation",
  );
  assert.equal(requestRateLimitPolicy("GET", "/api/v1/interviews/interview-id/voice-token"), null);
});

test("rate limiter rejects requests over its configured limit", async () => {
  let count = 0;
  const limiter = new RequestRateLimiter({
    eval: async () => [++count, 60],
  });
  let result;
  for (let index = 0; index < 11; index += 1) {
    result = await limiter.consume({
      method: "POST",
      url: "/api/auth/sign-in/email",
      ip: "127.0.0.1",
    });
  }
  assert.equal(result?.exceeded, true);
  assert.equal(result?.resetSeconds, 60);
});

test("CORS origins are explicit and resume content must match its declared MIME type", () => {
  assert.deepEqual(
    configuredCorsOrigins({
      WEB_URL: "https://app.example.com",
      CORS_ALLOWED_ORIGINS: ["https://preview.example.com", "https://app.example.com"],
    }),
    ["https://app.example.com", "https://preview.example.com"],
  );
  assert.doesNotThrow(() =>
    assertResumeMimeMatchesContent(
      new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]),
      "application/pdf",
    ),
  );
  assert.throws(
    () =>
      assertResumeMimeMatchesContent(
        new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]),
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    ResumeParseError,
  );
});

test("TRUST_PROXY only enables proxy trust for an explicit true value", () => {
  const base = {
    BETTER_AUTH_SECRET: "a".repeat(32),
    BETTER_AUTH_URL: "http://localhost:4000",
    DATABASE_URL: "postgresql://user:password@localhost:5432/app",
    EMAIL_FROM: "Interviewer AI <no-reply@example.com>",
    GOOGLE_CLIENT_ID: "client-id",
    GOOGLE_CLIENT_SECRET: "client-secret",
    REDIS_URL: "redis://localhost:6379",
    RESEND_API_KEY: "resend-key",
    WEB_URL: "http://localhost:3000",
  };
  assert.equal(serverEnvironmentSchema.parse({ ...base, TRUST_PROXY: "false" }).TRUST_PROXY, false);
  assert.equal(serverEnvironmentSchema.parse({ ...base, TRUST_PROXY: "true" }).TRUST_PROXY, true);
});

test("request IDs propagate valid caller IDs and observability attributes redact candidate data", () => {
  assert.equal(createRequestId("request_123"), "request_123");
  assert.match(createRequestId("invalid request id"), /^[0-9a-f-]{36}$/);
  assert.deepEqual(
    redactObservabilityAttributes({
      requestId: "request_123",
      prompt: "private instructions",
      transcript: "private answer",
      token: "secret",
    }),
    {
      requestId: "request_123",
      prompt: "[REDACTED]",
      transcript: "[REDACTED]",
      token: "[REDACTED]",
    },
  );
});

test("queue failure policy retries only transient dependencies and preserves safe terminal codes", async () => {
  const transient = new AiProviderError("TRANSIENT", "provider timed out");
  assert.deepEqual(classifyQueueFailure(transient), {
    code: "AI_PROVIDER_REJECTED",
    retryable: true,
  });
  assert.deepEqual(classifyQueueFailure(new ResumeParseError()), {
    code: "DOCUMENT_INVALID",
    retryable: false,
  });

  const job = { id: "job-1", attemptsMade: 0, opts: { attempts: 3 } } as never;
  let terminalFailures = 0;
  await assert.rejects(
    processQueueJob(job, {
      queue: "career-analysis",
      execute: async () => {
        throw transient;
      },
      onTerminalFailure: async () => {
        terminalFailures += 1;
      },
    }),
    /QUEUE_FAILURE:AI_PROVIDER_REJECTED/,
  );
  assert.equal(terminalFailures, 0);

  await assert.rejects(
    processQueueJob({ id: "job-1", attemptsMade: 2, opts: { attempts: 3 } } as never, {
      queue: "career-analysis",
      execute: async () => {
        throw new ResumeParseError();
      },
      onTerminalFailure: async (failure) => {
        terminalFailures += failure.code === "DOCUMENT_INVALID" ? 1 : 0;
      },
    }),
    /QUEUE_FAILURE:DOCUMENT_INVALID/,
  );
  assert.equal(terminalFailures, 1);
});

test("account deletion removes only owned object keys before deleting the owned account", async () => {
  const removedKeys: string[] = [];
  let deletedUserId: string | null = null;
  const result = await deleteOwnedAccount({
    database: {
      user: {
        findUnique: async () => ({
          id: "user-1",
          resumes: [{ storageKey: "resumes/user-1/a.pdf" }, { storageKey: "resumes/user-1/b.pdf" }],
        }),
        delete: async ({ where }) => {
          deletedUserId = where.id;
          return {};
        },
      },
    },
    environment: {} as never,
    userId: "user-1",
    removeObject: async (_environment, key) => {
      removedKeys.push(key);
    },
  });
  assert.deepEqual(removedKeys, ["resumes/user-1/a.pdf", "resumes/user-1/b.pdf"]);
  assert.equal(deletedUserId, "user-1");
  assert.deepEqual(result, { deleted: true, objectCount: 2 });
});
