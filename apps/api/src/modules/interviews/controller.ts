import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "../../../prisma/generated/client.js";
import type { createCareerAnalysisQueue } from "../../services/career-analysis-queue.js";
import type { createReportQueue } from "../../services/report-queue.js";
import { createInterviewSchema, interviewIdSchema } from "./schema.js";
import { InterviewEventPublisher } from "./events.js";
import { InterviewLifecycleError, InterviewService } from "./service.js";

function toDto(interview: {
  id: string;
  status: string;
  interviewType: string;
  difficulty: string;
  durationMinutes: number;
  language: string;
  targetRole: string | null;
  createdAt: Date;
  startedAt?: Date | null;
  completedAt?: Date | null;
  resume?: { id: string; fileName: string } | null;
  jobDescription?: { id: string; title: string | null; company: string | null } | null;
}) {
  return {
    ...interview,
    createdAt: interview.createdAt.toISOString(),
    startedAt: interview.startedAt?.toISOString() ?? null,
    completedAt: interview.completedAt?.toISOString() ?? null,
  };
}

function sendLifecycleError(
  reply: { status: (statusCode: number) => { send: (payload: unknown) => unknown } },
  error: unknown,
) {
  if (!(error instanceof InterviewLifecycleError)) throw error;
  const status = error.code.endsWith("NOT_FOUND")
    ? 404
    : error.code === "RESUME_NOT_FOUND" || error.code === "JOB_DESCRIPTION_NOT_FOUND"
      ? 404
      : 409;
  return reply.status(status).send({ code: error.code, message: error.message });
}

export function registerInterviewRoutes(
  app: FastifyInstance,
  database: PrismaClient,
  queue: ReturnType<typeof createCareerAnalysisQueue>,
  reportQueue: ReturnType<typeof createReportQueue>,
) {
  const service = new InterviewService(database, queue, reportQueue, new InterviewEventPublisher(app.log));
  app.decorate("interviewService", service);

  app.post(
    "/api/v1/interviews",
    { preHandler: app.requireVerifiedUser },
    async (request, reply) => {
      const input = createInterviewSchema.safeParse(request.body);
      if (!input.success)
        return reply
          .status(400)
          .send({ code: "VALIDATION_ERROR", message: "Choose a valid interview configuration." });
      try {
        return reply.status(201).send({
          interview: toDto(await service.create(request.authContext!.user.id, input.data)),
        });
      } catch (error) {
        return sendLifecycleError(reply, error);
      }
    },
  );

  app.get("/api/v1/interviews", { preHandler: app.requireVerifiedUser }, async (request) => ({
    interviews: (await service.repository.listOwned(request.authContext!.user.id)).map(toDto),
  }));

  app.get(
    "/api/v1/interviews/:id",
    { preHandler: app.requireVerifiedUser },
    async (request, reply) => {
      const params = interviewIdSchema.safeParse(request.params);
      if (!params.success)
        return reply
          .status(400)
          .send({ code: "VALIDATION_ERROR", message: "Invalid interview ID." });
      try {
        return {
          interview: toDto(await service.details(params.data.id, request.authContext!.user.id)),
        };
      } catch (error) {
        return sendLifecycleError(reply, error);
      }
    },
  );

  app.post(
    "/api/v1/interviews/:id/prepare",
    { preHandler: app.requireVerifiedUser },
    async (request, reply) => {
      const params = interviewIdSchema.safeParse(request.params);
      if (!params.success)
        return reply
          .status(400)
          .send({ code: "VALIDATION_ERROR", message: "Invalid interview ID." });
      try {
        return reply
          .status(202)
          .send(await service.prepare(params.data.id, request.authContext!.user.id));
      } catch (error) {
        return sendLifecycleError(reply, error);
      }
    },
  );

  app.get(
    "/api/v1/interviews/:id/plan",
    { preHandler: app.requireVerifiedUser },
    async (request, reply) => {
      const params = interviewIdSchema.safeParse(request.params);
      if (!params.success)
        return reply
          .status(400)
          .send({ code: "VALIDATION_ERROR", message: "Invalid interview ID." });
      try {
        const interview = await service.details(params.data.id, request.authContext!.user.id);
        return { status: interview.status, plan: interview.plan };
      } catch (error) {
        return sendLifecycleError(reply, error);
      }
    },
  );

  app.get(
    "/api/v1/interviews/:id/state",
    { preHandler: app.requireVerifiedUser },
    async (request, reply) => {
      const params = interviewIdSchema.safeParse(request.params);
      if (!params.success)
        return reply
          .status(400)
          .send({ code: "VALIDATION_ERROR", message: "Invalid interview ID." });
      try {
        return service.state(params.data.id, request.authContext!.user.id);
      } catch (error) {
        return sendLifecycleError(reply, error);
      }
    },
  );

  app.delete(
    "/api/v1/interviews/:id",
    { preHandler: app.requireVerifiedUser },
    async (request, reply) => {
      const params = interviewIdSchema.safeParse(request.params);
      if (!params.success)
        return reply
          .status(400)
          .send({ code: "VALIDATION_ERROR", message: "Invalid interview ID." });
      try {
        await service.cancel(params.data.id, request.authContext!.user.id);
        return reply.status(204).send();
      } catch (error) {
        return sendLifecycleError(reply, error);
      }
    },
  );
}
