import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "../../../prisma/generated/client.js";
import type { ServerEnvironment } from "@interviewer-ai/config";

import { AiProviderError } from "../ai/index.js";
import {
  DeepgramAudioUnavailableError,
  DeepgramConfigurationError,
  DeepgramTokenGrantError,
  createDeepgramLiveStream,
  voiceLiveConnectDeadlineMs,
} from "./deepgram.js";
import { startAgentVoiceGateway } from "./agent-gateway.js";
import { ConversationEventPublisher } from "./events.js";
import {
  conversationInterviewIdSchema,
  conversationTurnIdSchema,
  finalizeTranscriptRequestSchema,
} from "./schema.js";
import { ConversationError, ConversationService } from "./service.js";
import { InterviewLifecycleError, type InterviewService } from "../interviews/service.js";
import { logSafeError } from "../../services/security.js";
import { observability } from "../../services/observability.js";
import type { RealtimeEventBus } from "../../services/realtime-events.js";

const sseHeartbeatIntervalMs = 15_000;

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
  if (error.code === "VOICE_LANGUAGE_UNSUPPORTED") {
    return reply.status(400).send({ code: error.code, message: error.message });
  }
  const status = error.code.endsWith("NOT_FOUND") || error.code === "AI_TURN_NOT_FOUND" ? 404 : 409;
  return reply.status(status).send({ code: error.code, message: error.message });
}

export function registerConversationRoutes(
  app: FastifyInstance,
  database: PrismaClient,
  environment: ServerEnvironment,
  interviewService: InterviewService,
  eventBus?: RealtimeEventBus,
) {
  const events = new ConversationEventPublisher(app.log, eventBus);
  const service = new ConversationService(
    database,
    environment,
    interviewService,
    events,
  );

  app.get(
    "/api/v1/interviews/:id/conversation/turns/:turnId/audio",
    { preHandler: app.requireVerifiedUser },
    async (request, reply) => {
      const params = conversationTurnIdSchema.safeParse(request.params);
      if (!params.success)
        return reply.status(400).send({ code: "VALIDATION_ERROR", message: "Invalid turn ID." });
      try {
        const { turn, audio } = await service.getTurnAudio(
          params.data.id,
          params.data.turnId,
          request.authContext!.user.id,
        );
        reply.header("Content-Type", "audio/wav");
        reply.header("Cache-Control", "private, no-store");
        service.publishPlaybackStarted(params.data.id, turn.conversationId, turn.id);
        return reply.send(audio);
      } catch (error) {
        if (
          error instanceof DeepgramConfigurationError ||
          error instanceof DeepgramTokenGrantError ||
          error instanceof DeepgramAudioUnavailableError
        )
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
        const token = await service.createVoiceToken(params.data.id, request.authContext!.user.id);
        observability().event("voice.token.created", {
          requestId: request.id,
          interviewId: params.data.id,
        });
        return token;
      } catch (error) {
        if (error instanceof DeepgramConfigurationError)
          return reply
            .status(503)
            .send({ code: "VOICE_UNAVAILABLE", message: "Voice is not configured." });
        return sendConversationError(reply, error);
      }
    },
  );

  app.get(
    "/api/v1/interviews/:id/conversation/voice-stream",
    { websocket: true },
    async (socket, request) => {
      let isClosed = false;
      let forwardToDeepgram: ((buffer: Buffer) => void) | null = null;
      let forwardToAgent: ((buffer: Buffer) => void) | null = null;
      const earlyChunks: Buffer[] = [];

      socket.on("message", (data: unknown, isBinary: boolean) => {
        if (isClosed) return;
        try {
          if (isBinary || Buffer.isBuffer(data)) {
            const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
            if (forwardToAgent) {
              forwardToAgent(buffer);
            } else if (forwardToDeepgram) {
              forwardToDeepgram(buffer);
            } else if (earlyChunks.length < 50) {
              earlyChunks.push(buffer);
            }
          }
        } catch (sendErr) {
          app.log.warn({ sendErr }, "Failed to process early audio chunk");
        }
      });

      socket.on("close", () => {
        isClosed = true;
      });

      const params = conversationInterviewIdSchema.safeParse(request.params);
      if (!params.success) {
        socket.close(1008, "Invalid interview ID");
        return;
      }
      const interviewId = params.data.id;
      const query = request.query as { ticket?: string } | undefined;
      const ticket = query?.ticket;

      let userId: string | null = null;
      if (ticket) {
        const consumed = await service.ticketService.consumeTicket(ticket, interviewId);
        if (consumed) {
          userId = consumed.userId;
        }
      }

      if (!userId && request.authContext?.user?.id) {
        userId = request.authContext.user.id;
      }

      if (!userId) {
        socket.close(1008, "Unauthorized voice session");
        return;
      }

      const interview = await service.repository.findOwnedInterview(interviewId, userId);
      if (!interview || !["READY", "IN_PROGRESS"].includes(interview.status)) {
        socket.close(1008, "Interview is not active or owned");
        return;
      }

      if (isClosed) return;

      // VOICE_PIPELINE=agent: the server owns the whole Deepgram Voice Agent
      // session (see agent-gateway.ts). Legacy stays the default pipeline.
      if (environment.VOICE_PIPELINE === "agent") {
        try {
          const gateway = await startAgentVoiceGateway({
            log: app.log,
            environment,
            database,
            service,
            events,
            socket,
            interviewId,
            userId,
          });
          forwardToAgent = (buffer) => gateway.sendClientAudio(buffer);
          for (const chunk of earlyChunks.splice(0)) forwardToAgent(chunk);
          socket.on("close", () => {
            forwardToAgent = null;
          });
        } catch (err) {
          app.log.error({ err }, "Failed to start the agent voice gateway");
          socket.close(1011, "Voice session initialization failed");
        }
        return;
      }

      try {
        const liveStream = await createDeepgramLiveStream(environment, interview.language);
        let isLiveStreamOpen = false;
        const pendingAudioChunks: Buffer[] = [...earlyChunks];
        earlyChunks.length = 0;

        // Phase 0 deadline: if the provider stream never opens, the client must
        // get a clean failure to retry on, not an open socket in dead air.
        const connectDeadlineMs = voiceLiveConnectDeadlineMs;
        const connectTimer = setTimeout(() => {
          if (isLiveStreamOpen) return;
          observability().event("voice.provider.deadline_exceeded", {
            segment: "live-stream-open",
            deadlineMs: connectDeadlineMs,
          });
          try {
            liveStream.close();
          } catch {
            // best-effort teardown; the close event handles the rest
          }
          if (socket.readyState === socket.OPEN) {
            socket.close(1013, "The transcription service did not connect in time. Please retry.");
          }
        }, connectDeadlineMs);
        connectTimer.unref();

        const flushChunks = () => {
          while (pendingAudioChunks.length > 0) {
            const chunk = pendingAudioChunks.shift();
            if (chunk) {
              try {
                liveStream.sendMedia(chunk);
              } catch (sendErr) {
                app.log.warn({ sendErr }, "Failed to send buffered audio chunk to Deepgram");
              }
            }
          }
        };

        liveStream.on("open", () => {
          isLiveStreamOpen = true;
          clearTimeout(connectTimer);
          if (socket.readyState === socket.OPEN) {
            socket.send(JSON.stringify({ type: "connected", interviewId }));
          }
          flushChunks();
        });

        liveStream.on("message", (msg: unknown) => {
          if (socket.readyState === socket.OPEN) {
            socket.send(typeof msg === "string" ? msg : JSON.stringify(msg));
          }
        });

        liveStream.on("error", (err: unknown) => {
          app.log.error({ err }, "Deepgram live stream error");
          if (socket.readyState === socket.OPEN) {
            socket.send(JSON.stringify({ type: "error", message: "Transcription error" }));
          }
        });

        liveStream.on("close", () => {
          isLiveStreamOpen = false;
          clearTimeout(connectTimer);
          if (socket.readyState === socket.OPEN) {
            socket.close(1000, "Transcription stream closed");
          }
        });

        liveStream.connect();

        forwardToDeepgram = (buffer: Buffer) => {
          if (isLiveStreamOpen) {
            liveStream.sendMedia(buffer);
          } else if (pendingAudioChunks.length < 50) {
            pendingAudioChunks.push(buffer);
          }
        };

        socket.on("close", () => {
          isLiveStreamOpen = false;
          forwardToDeepgram = null;
          pendingAudioChunks.length = 0;
          try {
            liveStream.close();
          } catch {
            // ignore
          }
        });
      } catch (err) {
        app.log.error({ err }, "Failed to initialize Deepgram live stream");
        socket.close(1011, "Voice transcription initialization failed");
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
          logSafeError(request.log, "AI conversation response failed", error, {
            category: error.category,
            diagnostic: error.diagnostic,
          });
        } else {
          logSafeError(request.log, "AI conversation response failed", error);
        }
        const recovery = await service.getAiResponseFailureRecovery(
          params.data.id,
          request.authContext!.user.id,
        );
        return reply.status(502).send({
          code: "AI_RESPONSE_FAILED",
          message: "We could not generate the next question right now.",
          ...(recovery ? { details: { recovery } } : {}),
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
        const transcriptResult = await service.persistFinalTranscript(
          params.data.id,
          request.authContext!.user.id,
          input.data,
        );
        const query = request.query as { respondImmediately?: string } | undefined;
        const bodyObj = request.body as { respondImmediately?: boolean } | undefined;
        const shouldRespond =
          query?.respondImmediately === "true" || bodyObj?.respondImmediately === true;

        if (shouldRespond) {
          try {
            const aiResponse = await service.generateResponse(
              params.data.id,
              request.authContext!.user.id,
            );
            return reply.status(201).send({
              ...transcriptResult,
              nextResponse: aiResponse,
            });
          } catch (aiError) {
            request.log.warn({ aiError }, "Auto-generate response after transcript failed");
            return reply.status(201).send(transcriptResult);
          }
        }

        return reply.status(201).send(transcriptResult);
      } catch (error) {
        return sendConversationError(reply, error);
      }
    },
  );

  app.post(
    "/api/v1/interviews/:id/conversation/speaking",
    { preHandler: app.requireVerifiedUser },
    async (request, reply) => {
      const params = conversationInterviewIdSchema.safeParse(request.params);
      if (!params.success)
        return reply
          .status(400)
          .send({ code: "VALIDATION_ERROR", message: "Invalid interview ID." });
      try {
        return reply.send(
          await service.notifyUserSpeechStarted(params.data.id, request.authContext!.user.id),
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

  app.get(
    "/api/v1/interviews/:id/conversation/stream",
    { preHandler: app.requireVerifiedUser },
    async (request, reply) => {
      const params = conversationInterviewIdSchema.safeParse(request.params);
      if (!params.success)
        return reply
          .status(400)
          .send({ code: "VALIDATION_ERROR", message: "Invalid interview ID." });
      const interview = await service.repository.findOwnedInterview(
        params.data.id,
        request.authContext!.user.id,
      );
      if (!interview || !eventBus) {
        if (!interview)
          return reply
            .status(404)
            .send({ code: "INTERVIEW_NOT_FOUND", message: "Interview not found." });
        return reply
          .status(501)
          .send({ code: "STREAM_UNAVAILABLE", message: "Live updates are not available." });
      }
      const interviewId = params.data.id;
      let closed = false;
      let unsubscribe: () => void = () => {};
      const heartbeat = { timer: null as NodeJS.Timeout | null };
      const close = () => {
        if (closed) return;
        closed = true;
        if (heartbeat.timer) clearInterval(heartbeat.timer);
        unsubscribe();
      };
      reply.hijack();
      const raw = reply.raw;
      raw.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      const write = (chunk: string) => {
        if (!closed && !raw.writableEnded) raw.write(chunk);
      };
      unsubscribe = eventBus.subscribe(interviewId, (event) => {
        write(`event: ${event.name}\ndata: ${JSON.stringify(event.payload)}\n\n`);
      });
      heartbeat.timer = setInterval(() => write(": ping\n\n"), sseHeartbeatIntervalMs);
      raw.on("close", close);
      raw.on("error", close);
      return reply;
    },
  );
}
