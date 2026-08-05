import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "../../../prisma/generated/client.js";
import type { ServerEnvironment } from "@interviewer-ai/config";
import type { createReportQueue } from "../../services/report-queue.js";
import { InterviewEventPublisher } from "../interviews/events.js";
import { interviewIdSchema } from "../interviews/schema.js";
import { ReportLifecycleError, ReportService } from "./service.js";

function toDto(report: Awaited<ReturnType<ReportService["details"]>>) {
  return {
    ...report,
    generatedAt: report.generatedAt?.toISOString() ?? null,
    createdAt: report.createdAt.toISOString(),
    updatedAt: report.updatedAt.toISOString(),
  };
}

import type { MonolithExecutionManager } from "../../services/monolith-execution.js";

export function registerReportRoutes(
  app: FastifyInstance,
  database: PrismaClient,
  environment: ServerEnvironment,
  queue: ReturnType<typeof createReportQueue>,
  monolith?: MonolithExecutionManager,
) {
  const service = new ReportService(
    database,
    environment,
    queue,
    new InterviewEventPublisher(app.log),
    monolith,
  );
  app.get(
    "/api/v1/interviews/:id/report",
    { preHandler: app.requireVerifiedUser },
    async (request, reply) => {
      const params = interviewIdSchema.safeParse(request.params);
      if (!params.success)
        return reply
          .status(400)
          .send({ code: "VALIDATION_ERROR", message: "Invalid interview ID." });
      try {
        return {
          report: toDto(await service.details(params.data.id, request.authContext!.user.id)),
        };
      } catch (error) {
        if (error instanceof ReportLifecycleError)
          return reply
            .status(error.code === "REPORT_NOT_FOUND" ? 404 : 409)
            .send({ code: error.code, message: error.message });
        throw error;
      }
    },
  );
  app.post(
    "/api/v1/interviews/:id/report/retry",
    { preHandler: app.requireVerifiedUser },
    async (request, reply) => {
      const params = interviewIdSchema.safeParse(request.params);
      if (!params.success)
        return reply
          .status(400)
          .send({ code: "VALIDATION_ERROR", message: "Invalid interview ID." });
      try {
        return reply.status(202).send({
          report: toDto(await service.retry(params.data.id, request.authContext!.user.id)),
        });
      } catch (error) {
        if (error instanceof ReportLifecycleError)
          return reply
            .status(error.code === "REPORT_NOT_FOUND" ? 404 : 409)
            .send({ code: error.code, message: error.message });
        throw error;
      }
    },
  );
  return service;
}
