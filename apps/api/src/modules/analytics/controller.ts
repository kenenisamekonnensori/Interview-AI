import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { PrismaClient } from "../../../prisma/generated/client.js";
import { AnalyticsService } from "./service.js";
import { analyticsFilterSchema, interviewIdSchema } from "./schema.js";

export function registerAnalyticsRoutes(app: FastifyInstance, database: PrismaClient) {
  const service = new AnalyticsService(database);
  const filtered =
    <T>(
      handler: (
        userId: string,
        filter: ReturnType<typeof analyticsFilterSchema.parse>,
      ) => Promise<T>,
    ) =>
    async (request: FastifyRequest, reply: FastifyReply) => {
      const filter = analyticsFilterSchema.safeParse(request.query);
      if (!filter.success)
        return reply
          .status(400)
          .send({ code: "VALIDATION_ERROR", message: "Invalid analytics filters." });
      return handler(request.authContext!.user.id, filter.data);
    };
  app.get(
    "/api/v1/analytics/history",
    { preHandler: app.requireVerifiedUser },
    filtered((userId, filter) => service.history(userId, filter)),
  );
  app.get(
    "/api/v1/analytics/reports",
    { preHandler: app.requireVerifiedUser },
    filtered((userId, filter) => service.reports(userId, filter)),
  );
  app.get(
    "/api/v1/analytics/trends",
    { preHandler: app.requireVerifiedUser },
    filtered((userId, filter) => service.trends(userId, filter)),
  );
  app.get(
    "/api/v1/analytics/summary",
    { preHandler: app.requireVerifiedUser },
    filtered((userId, filter) => service.summary(userId, filter)),
  );
  app.get(
    "/api/v1/analytics/interviews/:id",
    { preHandler: app.requireVerifiedUser },
    async (request, reply) => {
      const params = interviewIdSchema.safeParse(request.params);
      if (!params.success)
        return reply
          .status(400)
          .send({ code: "VALIDATION_ERROR", message: "Invalid interview ID." });
      const interview = await service.completedDetail(request.authContext!.user.id, params.data.id);
      return interview
        ? { interview }
        : reply.status(404).send({
            code: "COMPLETED_INTERVIEW_NOT_FOUND",
            message: "Completed interview with a valid report not found.",
          });
    },
  );
}
