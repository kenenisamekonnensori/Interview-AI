import crypto from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import type { PrismaClient } from "../../prisma/generated/client.js";
import type { ServerEnvironment } from "@interviewer-ai/config";
import { registerConversationRoutes } from "../modules/conversation/controller.js";
import type { InterviewService } from "../modules/interviews/service.js";

const testEnvironment: ServerEnvironment = {
  API_PORT: 4000,
  BETTER_AUTH_SECRET: "test-secret-at-least-32-characters-long",
  BETTER_AUTH_URL: "http://localhost:4000",
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  VOICE_PIPELINE: "agent",
  VOICE_MAX_CONCURRENT_SESSIONS: 100,
  TRANSCRIPT_RETENTION_DAYS: 0,
  EMAIL_FROM: "test@example.com",
  GOOGLE_CLIENT_ID: "google-test-id",
  GOOGLE_CLIENT_SECRET: "google-test-secret",
  NODE_ENV: "test",
  OWNER_EMAILS: [],
  PADDLE_ENVIRONMENT: "sandbox",
  GEMINI_MODEL: "gemini-3.5-flash-lite",
  GEMINI_FALLBACK_MODELS: [],
  RESEND_API_KEY: "test-key",
  CORS_ALLOWED_ORIGINS: [],
  TRUST_PROXY: false,
  WEB_URL: "http://localhost:3000",
  LIVEKIT_URL: "ws://localhost:7880",
  LIVEKIT_API_KEY: "devkey",
  LIVEKIT_API_SECRET: "secret",
  INTERNAL_API_SECRET: "dev-internal-secret-min-16-chars",
};

describe("Internal State Synchronization Bridge (Acceptance Check 3)", () => {
  it("enforces constant-time authentication and persists turns with timing data", async () => {
    const interviewId = "11111111-1111-4111-8111-111111111111";
    const conversationId = "22222222-2222-4222-8222-222222222222";
    const userId = "33333333-3333-4333-8333-333333333333";

    const persistedTurns: Array<{
      id: string;
      createdAt: Date;
      speaker: string;
      type: string;
      text: string;
      startedAt?: Date | null;
      endedAt?: Date | null;
      durationMs?: number | null;
      words?: unknown;
    }> = [];
    let persistedMemory: Record<string, unknown> = {
      interviewId,
      askedQuestions: [],
      topicCoverage: [],
      candidateStrengths: [],
      weakAreas: [],
      missedFollowUps: [],
      questionDifficulty: "MEDIUM",
      remainingObjectives: ["Evaluate caching and distributed systems"],
    };

    let conversationState = "LISTENING";
    let conversationSequence = 1;

    const mockDatabase = {
      conversation: {
        findUnique: async () => ({
          id: conversationId,
          interviewId,
          state: conversationState,
          sequence: conversationSequence,
          interview: {
            id: interviewId,
            userId,
            status: "IN_PROGRESS",
            language: "en",
            plan: {
              objectives: ["Evaluate caching and distributed systems"],
              topics: ["Caching Strategies", "Consistent Hashing"],
            },
            memory: persistedMemory,
          },
        }),
        updateMany: async ({ data }: { data: { sequence: number; state: string } }) => {
          conversationSequence = data.sequence;
          conversationState = data.state;
          return { count: 1 };
        },
      },
      conversationTurn: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const record = {
            id: "turn-" + (persistedTurns.length + 1),
            createdAt: new Date(),
            ...data,
          };
          persistedTurns.push(record as (typeof persistedTurns)[number]);
          return record;
        },
      },
      interviewMemory: {
        upsert: async ({ update }: { create: unknown; update: Record<string, unknown> }) => {
          persistedMemory = { ...persistedMemory, ...update };
          return persistedMemory;
        },
      },
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(mockDatabase),
    };

    const mockInterviewService = {} as InterviewService;

    const app = Fastify();
    registerConversationRoutes(
      app,
      mockDatabase as unknown as PrismaClient,
      testEnvironment,
      mockInterviewService,
    );
    await app.ready();

    // a) Missing or invalid x-internal-secret header yields HTTP 401 UNAUTHORIZED
    const missingSecretRes = await app.inject({
      method: "POST",
      url: `/api/v1/internal/interviews/${interviewId}/turns`,
      payload: {
        speaker: "USER",
        type: "ANSWER",
        text: "I used consistent hashing to distribute keys evenly.",
      },
    });
    expect(missingSecretRes.statusCode).toBe(401);
    expect(JSON.parse(missingSecretRes.body).code).toBe("UNAUTHORIZED");

    // b) Timing attack check: verifies crypto.timingSafeEqual is used for token evaluation
    const timingSafeSpy = vi.spyOn(crypto, "timingSafeEqual");
    const invalidSecretRes = await app.inject({
      method: "POST",
      url: `/api/v1/internal/interviews/${interviewId}/turns`,
      headers: {
        "x-internal-secret": "wrong-secret-key-12345678",
      },
      payload: {
        speaker: "USER",
        type: "ANSWER",
        text: "I used consistent hashing to distribute keys evenly.",
      },
    });
    expect(invalidSecretRes.statusCode).toBe(401);
    expect(JSON.parse(invalidSecretRes.body).code).toBe("UNAUTHORIZED");
    expect(timingSafeSpy).toHaveBeenCalled();
    timingSafeSpy.mockRestore();

    // c) Valid secret and payload yields HTTP 201 CREATED; verify row exists in conversation_turn table with durationMs, startedAt, endedAt, words persisted
    const validTurnPayload = {
      speaker: "USER",
      type: "ANSWER",
      text: "I used consistent hashing to distribute keys evenly across redis nodes.",
      startedAt: "2026-11-04T12:00:00.000Z",
      endedAt: "2026-11-04T12:00:25.000Z",
      durationMs: 25000,
      words: [
        { word: "I", start: 0, end: 120, confidence: 0.99 },
        { word: "used", start: 130, end: 400, confidence: 0.98 },
        { word: "consistent", start: 410, end: 850, confidence: 0.97 },
      ],
    };

    const validRes = await app.inject({
      method: "POST",
      url: `/api/v1/internal/interviews/${interviewId}/turns`,
      headers: {
        "x-internal-secret": testEnvironment.INTERNAL_API_SECRET,
      },
      payload: validTurnPayload,
    });

    expect(validRes.statusCode).toBe(201);
    const body = JSON.parse(validRes.body);
    expect(body).toMatchObject({
      speaker: "USER",
      type: "ANSWER",
      text: validTurnPayload.text,
      startedAt: validTurnPayload.startedAt,
      endedAt: validTurnPayload.endedAt,
      durationMs: 25000,
    });
    expect(body.words).toHaveLength(3);

    // Verify persisted record in conversation_turn
    expect(persistedTurns).toHaveLength(1);
    const persisted = persistedTurns[0]!;
    expect(persisted.speaker).toBe("USER");
    expect(persisted.type).toBe("ANSWER");
    expect(persisted.durationMs).toBe(25000);
    expect(persisted.startedAt).toEqual(new Date("2026-11-04T12:00:00.000Z"));
    expect(persisted.endedAt).toEqual(new Date("2026-11-04T12:00:25.000Z"));
    expect(persisted.words).toEqual(validTurnPayload.words);

    // d) AI turn persistence updates InterviewMemory
    const aiTurnPayload = {
      speaker: "AI",
      type: "QUESTION",
      text: "How would you handle caching when nodes crash?",
      durationMs: 4000,
    };
    const aiRes = await app.inject({
      method: "POST",
      url: `/api/v1/internal/interviews/${interviewId}/turns`,
      headers: {
        "x-internal-secret": testEnvironment.INTERNAL_API_SECRET,
      },
      payload: aiTurnPayload,
    });
    expect(aiRes.statusCode).toBe(201);
    expect(persistedTurns).toHaveLength(2);
    expect(persistedMemory.askedQuestions).toContain(
      "How would you handle caching when nodes crash?",
    );

    await app.close();
  });
});
