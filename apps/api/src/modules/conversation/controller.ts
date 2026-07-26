import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "../../../prisma/generated/client.js";
import type { ServerEnvironment } from "@interviewer-ai/config";

import { AiProviderError } from "../ai/index.js";
import { DeepgramConfigurationError } from "./deepgram.js";
import { ConversationEventPublisher } from "./events.js";
import {
  conversationInterviewIdSchema,
  conversationTurnIdSchema,
  finalizeTranscriptRequestSchema,
} from "./schema.js";
import { ConversationError, ConversationService } from "./service.js";
import { InterviewLifecycleError, type InterviewService } from "../interviews/service.js";

function sendConversationError(
  reply: { status: (code: number) => { send: (payload: unknown) => unknown } },
  error: unknown,
) {
  if (error instanceof InterviewLifecycleError) {
    return reply
      .status(error.code === "INTERVIEW_NOT_FOUND" ? 404 : 409)
      .send({ code: error.code, message: error.message });
  }
  if (!(error instanceof ConversationError)) throw error;
  const status = error.code.endsWith("NOT_FOUND") || error.code === "AI_TURN_NOT_FOUND" ? 404 : 409;
  return reply.status(status).send({ code: error.code, message: error.message });
}

export function registerConversationRoutes(
  app: FastifyInstance,
  database: PrismaClient,
  environment: ServerEnvironment,
  interviewService: InterviewService,
) {
  const service = new ConversationService(
    database,
    environment,
    interviewService,
    new ConversationEventPublisher(app.log),
  );

  app.get(
    "/api/v1/interviews/:id/conversation/turns/:turnId/audio",
    { preHandler: app.requireVerifiedUser },
    async (request, reply) => {
      const params = conversationTurnIdSchema.safeParse(request.params);
      if (!params.success)
        return reply.status(400).send({ code: "VALIDATION_ERROR", message: "Invalid turn ID." });
      try {
        const turn = await service.getAudioTurn(
          params.data.id,
          params.data.turnId,
          request.authContext!.user.id,
        );
        reply.header("Content-Type", "audio/wav");
        reply.header("Cache-Control", "private, no-store");
        const audio = await service.synthesizeTurn(turn);
        service.publishPlaybackStarted(params.data.id, turn.conversationId, turn.id);
        return reply.send(audio);
      } catch (error) {
        if (error instanceof DeepgramConfigurationError)
          return reply
            .status(503)
            .send({ code: "VOICE_UNAVAILABLE", message: "Voice is not configured." });
        return sendConversationError(reply, error);
      }
    },
  );

  app.post(
    "/api/v1/interviews/:id/voice-token",
    { preHandler: app.requireVerifiedUser },
    async (request, reply) => {
      const params = conversationInterviewIdSchema.safeParse(request.params);
      if (!params.success)
        return reply
          .status(400)
          .send({ code: "VALIDATION_ERROR", message: "Invalid interview ID." });
      try {
        return await service.createVoiceToken(params.data.id, request.authContext!.user.id);
      } catch (error) {
        if (error instanceof DeepgramConfigurationError)
          return reply
            .status(503)
            .send({ code: "VOICE_UNAVAILABLE", message: "Voice is not configured." });
        return sendConversationError(reply, error);
      }
    },
  );

  app.post(
    "/api/v1/interviews/:id/conversation/start",
    { preHandler: app.requireVerifiedUser },
    async (request, reply) => {
      const params = conversationInterviewIdSchema.safeParse(request.params);
      if (!params.success)
        return reply
          .status(400)
          .send({ code: "VALIDATION_ERROR", message: "Invalid interview ID." });
      try {
        const result = await service.start(params.data.id, request.authContext!.user.id);
        return reply.status(result.started ? 201 : 200).send(result);
      } catch (error) {
        return sendConversationError(reply, error);
      }
    },
  );

  app.post(
    "/api/v1/interviews/:id/conversation/next-response",
    { preHandler: app.requireVerifiedUser },
    async (request, reply) => {
      const params = conversationInterviewIdSchema.safeParse(request.params);
      if (!params.success)
        return reply
          .status(400)
          .send({ code: "VALIDATION_ERROR", message: "Invalid interview ID." });
      try {
        return reply
          .status(201)
          .send(await service.generateResponse(params.data.id, request.authContext!.user.id));
      } catch (error) {
        if (error instanceof ConversationError) return sendConversationError(reply, error);
        if (error instanceof AiProviderError) {
          request.log.error(
            { category: error.category, diagnostic: error.diagnostic },
            "AI conversation response failed",
          );
        } else {
          request.log.error({ err: error }, "AI conversation response failed");
        }
        return reply.status(502).send({
          code: "AI_RESPONSE_FAILED",
          message: "The interviewer could not respond. Please try again.",
        });
      }
    },
  );

  app.post(
    "/api/v1/interviews/:id/conversation/transcripts",
    { preHandler: app.requireVerifiedUser },
    async (request, reply) => {
      const params = conversationInterviewIdSchema.safeParse(request.params);
      const input = finalizeTranscriptRequestSchema.safeParse(request.body);
      if (!params.success || !input.success)
        return reply
          .status(400)
          .send({ code: "VALIDATION_ERROR", message: "Invalid finalized transcript." });
      try {
        return reply
          .status(201)
          .send(
            await service.persistFinalTranscript(
              params.data.id,
              request.authContext!.user.id,
              input.data,
            ),
          );
      } catch (error) {
        return sendConversationError(reply, error);
      }
    },
  );

  app.post(
    "/api/v1/interviews/:id/conversation/turns/:turnId/playback-completed",
    { preHandler: app.requireVerifiedUser },
    async (request, reply) => {
      const params = conversationTurnIdSchema.safeParse(request.params);
      if (!params.success)
        return reply.status(400).send({ code: "VALIDATION_ERROR", message: "Invalid turn ID." });
      try {
        return reply.send(
          await service.acknowledgePlayback(
            params.data.id,
            params.data.turnId,
            request.authContext!.user.id,
          ),
        );
      } catch (error) {
        return sendConversationError(reply, error);
      }
    },
  );

  app.post(
    "/api/v1/interviews/:id/conversation/complete",
    { preHandler: app.requireVerifiedUser },
    async (request, reply) => {
      const params = conversationInterviewIdSchema.safeParse(request.params);
      if (!params.success)
        return reply
          .status(400)
          .send({ code: "VALIDATION_ERROR", message: "Invalid interview ID." });
      try {
        const interview = await service.requestCompletion(
          params.data.id,
          request.authContext!.user.id,
        );
        return reply.send({ state: interview.status });
      } catch (error) {
        return sendConversationError(reply, error);
      }
    },
  );
}
