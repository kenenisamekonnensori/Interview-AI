import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "../../../prisma/generated/client.js";
import type { ServerEnvironment } from "@interviewer-ai/config";
import {
  finalizeTranscriptRequestSchema,
  type ConversationState,
} from "@interviewer-ai/types";
import { buildInterviewerPrompt } from "@interviewer-ai/prompts";
import { z } from "zod";
import { createAiProvider } from "../ai/index.js";
import {
  DeepgramConfigurationError,
  grantDeepgramAccessToken,
  synthesizeSpeech,
} from "./deepgram.js";
import {
  assertConversationTransition,
  InvalidStateTransitionError,
} from "./state-machine.js";
import { InterviewLifecycleError, type InterviewService } from "../interviews/service.js";

const idSchema = z.object({ id: z.uuid() });
const turnIdSchema = z.object({ id: z.uuid(), turnId: z.uuid() });

function asConversationState(state: string): ConversationState {
  return state as ConversationState;
}

export function registerConversationRoutes(
  app: FastifyInstance,
  database: PrismaClient,
  environment: ServerEnvironment,
  interviewService: InterviewService,
) {
  const aiProvider = createAiProvider(environment);
  app.get(
    "/api/v1/interviews/:id/conversation/turns/:turnId/audio",
    { preHandler: app.requireVerifiedUser },
    async (request, reply) => {
      const params = turnIdSchema.safeParse(request.params);
      if (!params.success)
        return reply.status(400).send({ code: "VALIDATION_ERROR", message: "Invalid turn ID." });
      const turn = await database.conversationTurn.findFirst({
        where: {
          id: params.data.turnId,
          speaker: "AI",
          conversation: {
            interviewId: params.data.id,
            interview: { userId: request.authContext!.user.id },
          },
        },
      });
      if (!turn)
        return reply.status(404).send({ code: "AI_TURN_NOT_FOUND", message: "AI turn not found." });
      try {
        reply.header("Content-Type", "audio/wav");
        reply.header("Cache-Control", "private, no-store");
        return reply.send(await synthesizeSpeech(environment, turn.text));
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
    "/api/v1/interviews/:id/conversation/next-response",
    { preHandler: app.requireVerifiedUser },
    async (request, reply) => {
      const params = idSchema.safeParse(request.params);
      if (!params.success)
        return reply
          .status(400)
          .send({ code: "VALIDATION_ERROR", message: "Invalid interview ID." });
      const conversation = await database.conversation.findFirst({
        where: {
          interviewId: params.data.id,
          interview: { userId: request.authContext!.user.id, status: "IN_PROGRESS" },
        },
        include: {
          interview: { include: { plan: true } },
          turns: { orderBy: { sequence: "desc" }, take: 12 },
        },
      });
      if (!conversation || !conversation.interview.plan)
        return reply.status(409).send({
          code: "CONVERSATION_NOT_READY",
          message: "A planned active conversation is required.",
        });
      if (conversation.state !== "GREETING" && conversation.state !== "THINKING")
        return reply.status(409).send({
          code: "INVALID_STATE_TRANSITION",
          message: "The interviewer cannot respond in the current state.",
        });
      try {
        const prompt = buildInterviewerPrompt({
          interviewType: conversation.interview.interviewType,
          difficulty: conversation.interview.difficulty,
          targetRole: conversation.interview.targetRole,
        });
        const ai = await aiProvider.generateInterviewerResponse({
          instructions: prompt,
          context: {
            plan: conversation.interview.plan,
            recentTurns: conversation.turns
              .reverse()
              .map((turn) => ({ speaker: turn.speaker, type: turn.type, text: turn.text })),
          },
        });
        const result = await database.$transaction(async (tx) => {
          const nextState: ConversationState = ai.turnType === "CLOSING" ? "CLOSING" : "SPEAKING";
          assertConversationTransition(asConversationState(conversation.state), nextState);
          const sequence = conversation.sequence + 1;
          const turn = await tx.conversationTurn.create({
            data: {
              conversationId: conversation.id,
              sequence,
              speaker: "AI",
              type: ai.turnType,
              text: ai.text,
            },
          });
          await tx.conversation.update({
            where: { id: conversation.id },
            data: { sequence, state: nextState },
          });
          return { turn, state: nextState };
        });
        return reply.status(201).send(result);
      } catch (error) {
        if (error instanceof InvalidStateTransitionError)
          return reply
            .status(409)
            .send({ code: "INVALID_STATE_TRANSITION", message: error.message });
        request.log.error({ err: error }, "AI conversation response failed");
        return reply.status(502).send({
          code: "AI_RESPONSE_FAILED",
          message: "The interviewer could not respond. Please try again.",
        });
      }
    },
  );
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
        return reply.status(409).send({
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
      try {
        const result = await interviewService.start(params.data.id, request.authContext!.user.id);
        return reply.status(result.started ? 201 : 200).send({ conversation: result.conversation });
      } catch (error) {
        if (error instanceof InterviewLifecycleError)
          return reply.status(error.code === "INTERVIEW_NOT_FOUND" ? 404 : 409).send({ code: error.code, message: error.message });
        throw error;
      }
    },
  );
  app.post(
    "/api/v1/interviews/:id/conversation/transcripts",
    { preHandler: app.requireVerifiedUser },
    async (request, reply) => {
      const params = idSchema.safeParse(request.params);
      const input = finalizeTranscriptRequestSchema.safeParse(request.body);
      if (!params.success || !input.success)
        return reply
          .status(400)
          .send({ code: "VALIDATION_ERROR", message: "Invalid finalized transcript." });
      const conversation = await database.conversation.findFirst({
        where: { interviewId: params.data.id, interview: { userId: request.authContext!.user.id } },
      });
      if (!conversation)
        return reply
          .status(404)
          .send({ code: "CONVERSATION_NOT_FOUND", message: "Conversation not found." });
      if (conversation.state !== "LISTENING")
        return reply.status(409).send({
          code: "INVALID_STATE_TRANSITION",
          message: "This conversation transition is not allowed.",
        });
      const result = await database.$transaction(async (tx) => {
        assertConversationTransition(asConversationState(conversation.state), "TRANSCRIBING");
        await tx.conversation.update({
          where: { id: conversation.id },
          data: { state: "TRANSCRIBING" },
        });
        const next = conversation.sequence + 1;
        const turn = await tx.conversationTurn.create({
          data: {
            conversationId: conversation.id,
            sequence: next,
            speaker: "USER",
            type: "ANSWER",
            text: input.data.text,
          },
        });
        assertConversationTransition("TRANSCRIBING", "THINKING");
        await tx.conversation.update({
          where: { id: conversation.id },
          data: {
            sequence: next,
            state: "THINKING",
          },
        });
        return { turn, state: "THINKING" as const };
      });
      return reply.status(201).send(result);
    },
  );

  app.post(
    "/api/v1/interviews/:id/conversation/turns/:turnId/playback-completed",
    { preHandler: app.requireVerifiedUser },
    async (request, reply) => {
      const params = turnIdSchema.safeParse(request.params);
      if (!params.success)
        return reply.status(400).send({ code: "VALIDATION_ERROR", message: "Invalid turn ID." });
      const conversation = await database.conversation.findFirst({
        where: {
          interviewId: params.data.id,
          interview: { userId: request.authContext!.user.id },
          turns: { some: { id: params.data.turnId, speaker: "AI" } },
        },
        include: { interview: true, turns: { where: { id: params.data.turnId } } },
      });
      const turn = conversation?.turns[0];
      if (!conversation || !turn)
        return reply.status(404).send({ code: "AI_TURN_NOT_FOUND", message: "AI turn not found." });
      try {
        if (turn.type === "CLOSING") {
          const interview = await interviewService.requestCompletion(params.data.id, request.authContext!.user.id);
          return reply.send({ state: interview.status });
        }
        const result = await database.$transaction(async (tx) => {
          assertConversationTransition(asConversationState(conversation.state), "LISTENING");
          await tx.conversation.update({
            where: { id: conversation.id },
            data: { state: "LISTENING" },
          });
          return { state: "LISTENING" as const };
        });
        return reply.send(result);
      } catch (error) {
        if (error instanceof InterviewLifecycleError)
          return reply.status(error.code === "INTERVIEW_NOT_FOUND" ? 404 : 409).send({ code: error.code, message: error.message });
        if (error instanceof InvalidStateTransitionError)
          return reply
            .status(409)
            .send({ code: "INVALID_STATE_TRANSITION", message: error.message });
        throw error;
      }
    },
  );

  app.post(
    "/api/v1/interviews/:id/conversation/complete",
    { preHandler: app.requireVerifiedUser },
    async (request, reply) => {
      const params = idSchema.safeParse(request.params);
      if (!params.success)
        return reply
          .status(400)
          .send({ code: "VALIDATION_ERROR", message: "Invalid interview ID." });
      try {
        const interview = await interviewService.requestCompletion(params.data.id, request.authContext!.user.id);
        return reply.send({ state: interview.status });
      } catch (error) {
        if (error instanceof InterviewLifecycleError)
          return reply.status(error.code === "INTERVIEW_NOT_FOUND" ? 404 : 409).send({ code: error.code, message: error.message });
        if (error instanceof InvalidStateTransitionError)
          return reply
            .status(409)
            .send({ code: "INVALID_STATE_TRANSITION", message: error.message });
        throw error;
      }
    },
  );
}
