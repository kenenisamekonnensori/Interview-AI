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

test("interview, resume, and job inputs enforce documented limits", () => {
  assert.equal(
    interviewConfigurationSchema.safeParse({
      interviewType: "TECHNICAL", difficulty: "MEDIUM", durationMinutes: 30, language: "en",
    }).success,
    true,
  );
  assert.equal(createResumeUploadSchema.safeParse({ fileName: "resume.pdf", mimeType: "text/plain", fileSize: 200 }).success, false);
  assert.equal(createJobDescriptionSchema.safeParse({ rawText: "too short" }).success, false);
  assert.equal(createJobDescriptionSchema.safeParse({ rawText: "x".repeat(100) }).success, true);
});

test("AI interviewer proposals reject inconsistent actions and extra fields", () => {
  const valid = {
    responseText: "Tell me about a time you handled a production incident.",
    responseType: "QUESTION", recommendedAction: "ASK_QUESTION", suggestedNextConversationState: "SPEAKING",
  };
  assert.equal(interviewerResponseProposalSchema.safeParse(valid).success, true);
  assert.equal(interviewerResponseProposalSchema.safeParse({ ...valid, recommendedAction: "CLOSE_INTERVIEW" }).success, false);
  assert.equal(interviewerResponseProposalSchema.safeParse({ ...valid, internalReasoning: "ignore" }).success, false);
});

test("report schema requires score evidence and transcript references", () => {
  const dimension = { score: 72, feedback: "Explained the trade-off clearly.", evidenceTurnIds: [firstTurn] };
  const report = {
    evaluation: {
      overallScore: 72, technical: dimension, communication: dimension, confidence: dimension, problemSolving: dimension,
      categoryScores: { Architecture: dimension },
      strengths: [{ text: "Clear trade-off explanation.", evidenceTurnIds: [firstTurn] }],
      weaknesses: [{ text: "Could quantify impact.", evidenceTurnIds: [secondTurn] }],
      missedOpportunities: [], recommendations: ["Add measurable outcomes to examples."],
    },
    summary: "A solid technical discussion with a clear improvement area.", hiringRecommendation: "HIRE",
    evidence: [{ turnId: firstTurn, claim: "Explained a trade-off." }],
  };
  assert.equal(generatedReportSchema.safeParse(report).success, true);
  assert.equal(generatedReportSchema.safeParse({ ...report, evaluation: { ...report.evaluation, technical: { score: 72, feedback: "Missing evidence" } } }).success, false);
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
