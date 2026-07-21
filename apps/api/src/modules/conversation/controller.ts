import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "../../../prisma/generated/client.js";
import type { ServerEnvironment } from "@interviewer-ai/config";
import { z } from "zod";
import { DeepgramConfigurationError, grantDeepgramAccessToken } from "./deepgram.js";

const idSchema = z.object({ id: z.uuid() });
const turnSchema = z.object({
  speaker: z.enum(["USER", "AI", "SYSTEM"]),
  type: z.enum(["GREETING", "QUESTION", "ANSWER", "FOLLOW_UP", "CLARIFICATION", "CLOSING"]),
  text: z.string().trim().min(1).max(20_000),
  state: z.enum(["GREETING", "LISTENING", "THINKING", "SPEAKING", "CLOSING", "COMPLETED"]),
});
const permitted: Record<string, string[]> = {
  GREETING: ["LISTENING", "SPEAKING"],
  LISTENING: ["THINKING", "CLOSING"],
  THINKING: ["SPEAKING", "CLOSING"],
  SPEAKING: ["LISTENING", "CLOSING"],
  CLOSING: ["COMPLETED"],
  COMPLETED: [],
};

export function registerConversationRoutes(
  app: FastifyInstance,
  database: PrismaClient,
  environment: ServerEnvironment,
) {
  app.post(
    "/api/v1/interviews/:id/voice-token",
    { preHandler: app.requireVerifiedUser },
    async (request, reply) => {
      const params = idSchema.safeParse(request.params);
      if (!params.success)
        return reply
          .status(400)
          .send({ code: "VALIDATION_ERROR", message: "Invalid interview ID." });
      const interview = await database.interview.findFirst({
        where: {
          id: params.data.id,
          userId: request.authContext!.user.id,
          status: { in: ["READY", "IN_PROGRESS"] },
        },
      });
      if (!interview)
        return reply
          .status(409)
          .send({
            code: "INTERVIEW_NOT_VOICE_READY",
            message: "Only ready or active interviews can use voice.",
          });
      try {
        return { accessToken: await grantDeepgramAccessToken(environment), expiresInSeconds: 30 };
      } catch (error) {
        if (error instanceof DeepgramConfigurationError)
          return reply
            .status(503)
            .send({ code: "VOICE_UNAVAILABLE", message: "Voice is not configured." });
        throw error;
      }
    },
  );
  app.post(
    "/api/v1/interviews/:id/conversation/start",
    { preHandler: app.requireVerifiedUser },
    async (request, reply) => {
      const params = idSchema.safeParse(request.params);
      if (!params.success)
        return reply
          .status(400)
          .send({ code: "VALIDATION_ERROR", message: "Invalid interview ID." });
      const interview = await database.interview.findFirst({
        where: { id: params.data.id, userId: request.authContext!.user.id, status: "READY" },
      });
      if (!interview)
        return reply
          .status(409)
          .send({ code: "INTERVIEW_NOT_READY", message: "Only ready interviews can start." });
      const conversation = await database.$transaction(async (tx) => {
        const value = await tx.conversation.upsert({
          where: { interviewId: interview.id },
          create: { interviewId: interview.id },
          update: {},
        });
        await tx.interview.update({ where: { id: interview.id }, data: { status: "IN_PROGRESS" } });
        return value;
      });
      return reply.status(201).send({ conversation });
    },
  );
  app.post(
    "/api/v1/interviews/:id/conversation/turns",
    { preHandler: app.requireVerifiedUser },
    async (request, reply) => {
      const params = idSchema.safeParse(request.params);
      const input = turnSchema.safeParse(request.body);
      if (!params.success || !input.success)
        return reply
          .status(400)
          .send({ code: "VALIDATION_ERROR", message: "Invalid conversation turn." });
      const conversation = await database.conversation.findFirst({
        where: { interviewId: params.data.id, interview: { userId: request.authContext!.user.id } },
      });
      if (!conversation)
        return reply
          .status(404)
          .send({ code: "CONVERSATION_NOT_FOUND", message: "Conversation not found." });
      if (!permitted[conversation.state]?.includes(input.data.state))
        return reply.status(409).send({
          code: "INVALID_STATE_TRANSITION",
          message: "This conversation transition is not allowed.",
        });
      const result = await database.$transaction(async (tx) => {
        const next = conversation.sequence + 1;
        const turn = await tx.conversationTurn.create({
          data: {
            conversationId: conversation.id,
            sequence: next,
            speaker: input.data.speaker,
            type: input.data.type,
            text: input.data.text,
          },
        });
        await tx.conversation.update({
          where: { id: conversation.id },
          data: {
            sequence: next,
            state: input.data.state,
            ...(input.data.state === "COMPLETED" ? { completedAt: new Date() } : {}),
          },
        });
        return turn;
      });
      return reply.status(201).send({ turn: result });
    },
  );
}
