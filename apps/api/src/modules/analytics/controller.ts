import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { PrismaClient } from "../../../prisma/generated/client.js";
import { AnalyticsService, PerformanceQueryError } from "./service.js";
import { ReadinessService } from "./readiness-service.js";
import { analyticsFilterSchema, interviewIdSchema, performanceQuerySchema } from "./schema.js";

export function registerAnalyticsRoutes(app: FastifyInstance, database: PrismaClient) {
  const service = new AnalyticsService(database);
  const readinessService = new ReadinessService(database);
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
    "/api/v1/analytics/overview",
    { preHandler: app.requireVerifiedUser },
    async (request) => ({
      overview: await service.overview(request.authContext!.user.id),
    }),
  );
  app.get(
    "/api/v1/analytics/next-practice",
    { preHandler: app.requireVerifiedUser },
    async (request) => ({
      recommendation: await service.nextPracticeRecommendation(request.authContext!.user.id),
    }),
  );
  app.get("/api/v1/analytics/skills", { preHandler: app.requireVerifiedUser }, async (request) => ({
    skills: await service.skillProfile(request.authContext!.user.id),
  }));
  app.get(
    "/api/v1/analytics/readiness",
    { preHandler: app.requireVerifiedUser },
    async (request) => ({
      readiness: await readinessService.assessment(request.authContext!.user.id),
    }),
  );
  app.get(
    "/api/v1/analytics/performance",
    { preHandler: app.requireVerifiedUser },
    async (request, reply) => {
      const query = performanceQuerySchema.safeParse(request.query);
      if (!query.success)
        return reply
          .status(400)
          .send({ code: "VALIDATION_ERROR", message: "Invalid performance range." });
      try {
        return {
          performance: await service.performance(request.authContext!.user.id, query.data),
        };
      } catch (error) {
        if (!(error instanceof PerformanceQueryError)) throw error;
        return reply.status(400).send({ code: error.code, message: error.message });
      }
    },
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
