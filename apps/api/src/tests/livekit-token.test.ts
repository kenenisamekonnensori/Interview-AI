import { describe, expect, it } from "vitest";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import type { PrismaClient } from "../../prisma/generated/client.js";
import type { ServerEnvironment } from "@interviewer-ai/config";
import { TokenVerifier } from "livekit-server-sdk";
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

describe("LiveKit Token Minting Endpoint (Acceptance Check 2)", () => {
  it("validates token endpoint for anonymous, ready, and completed interviews", async () => {
    const readyInterviewId = "11111111-1111-4111-8111-111111111111";
    const completedInterviewId = "22222222-2222-4222-8222-222222222222";
    const testUserId = "33333333-3333-4333-8333-333333333333";

    let currentUserId: string | null = null;

    const mockDatabase = {
      interview: {
        findFirst: async ({ where }: { where: { id: string; userId: string } }) => {
          if (where.userId !== testUserId) return null;
          if (where.id === readyInterviewId) {
            return {
              id: readyInterviewId,
              userId: testUserId,
              status: "READY",
              language: "en",
              createdAt: new Date(),
            };
          }
          if (where.id === completedInterviewId) {
            return {
              id: completedInterviewId,
              userId: testUserId,
              status: "COMPLETED",
              language: "en",
              createdAt: new Date(),
            };
          }
          return null;
        },
      },
      conversation: {
        findFirst: async () => null,
      },
    } as unknown as PrismaClient;

    const mockInterviewService = {} as InterviewService;

    const app = Fastify();
    app.decorateRequest("authContext", null);

    // Simulated auth hook
    app.decorate("requireVerifiedUser", async (request: FastifyRequest, reply: FastifyReply) => {
      if (!currentUserId) {
        return reply.status(401).send({
          code: "UNAUTHORIZED",
          message: "Authentication is required.",
        });
      }
      request.authContext = {
        user: {
          id: currentUserId,
          email: "candidate@example.com",
          name: "Candidate",
          emailVerified: true,
        },
        sessionId: "session-1",
      };
    });

    registerConversationRoutes(app, mockDatabase, testEnvironment, mockInterviewService);

    await app.ready();

    // a) Anonymous request yields HTTP 401 UNAUTHORIZED
    currentUserId = null;
    const anonRes = await app.inject({
      method: "POST",
      url: `/api/v1/interviews/${readyInterviewId}/livekit-token`,
    });
    expect(anonRes.statusCode).toBe(401);
    expect(JSON.parse(anonRes.body).code).toBe("UNAUTHORIZED");

    // b) User with READY interview yields HTTP 200 with valid JWT string, url, and roomName
    currentUserId = testUserId;
    const readyRes = await app.inject({
      method: "POST",
      url: `/api/v1/interviews/${readyInterviewId}/livekit-token`,
    });
    expect(readyRes.statusCode).toBe(200);
    const readyPayload = JSON.parse(readyRes.body);
    expect(readyPayload).toMatchObject({
      url: "ws://localhost:7880",
      roomName: `interview-${readyInterviewId}`,
      participantIdentity: `user-${testUserId}`,
    });
    expect(typeof readyPayload.token).toBe("string");

    // c) Validates decoded JWT claims: video.roomJoin === true, video.room === "interview-<id>"
    const verifier = new TokenVerifier(
      testEnvironment.LIVEKIT_API_KEY!,
      testEnvironment.LIVEKIT_API_SECRET!,
    );
    const claims = await verifier.verify(readyPayload.token);
    expect(claims.video?.roomJoin).toBe(true);
    expect(claims.video?.room).toBe(`interview-${readyInterviewId}`);
    expect(claims.video?.canPublish).toBe(true);
    expect(claims.video?.canSubscribe).toBe(true);
    expect(claims.video?.canPublishData).toBe(true);
    expect(claims.sub).toBe(`user-${testUserId}`);
    expect(claims.roomConfig?.agents?.[0]?.agentName).toBe("interviewer-ai-voice-agent");

    // d) User with COMPLETED interview yields HTTP 409 INVALID_STATE_TRANSITION
    const completedRes = await app.inject({
      method: "POST",
      url: `/api/v1/interviews/${completedInterviewId}/livekit-token`,
    });
    expect(completedRes.statusCode).toBe(409);
    expect(JSON.parse(completedRes.body).code).toBe("INVALID_STATE_TRANSITION");

    await app.close();
  });
});
