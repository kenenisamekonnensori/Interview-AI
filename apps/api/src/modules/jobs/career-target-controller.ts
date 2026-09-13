import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "../../../prisma/generated/client.js";
import { createCareerTargetSchema, updateCareerTargetSchema } from "@interviewer-ai/types";
import { BillingError } from "../billing/domain/errors.js";
import { sendBillingError } from "../billing/controller.js";
import { careerTargetIdSchema } from "./career-target-schema.js";
import { CareerTargetError, CareerTargetService } from "./career-target-service.js";

function sendTargetError(
  reply: { status: (statusCode: number) => { send: (payload: unknown) => unknown } },
  error: unknown,
) {
  if (!(error instanceof CareerTargetError)) throw error;
  const status = error.code.endsWith("NOT_FOUND") ? 404 : 409;
  return reply.status(status).send({ code: error.code, message: error.message });
}

export function registerCareerTargetRoutes(app: FastifyInstance, database: PrismaClient) {
  const service = new CareerTargetService(database);
  app.decorate("careerTargetService", service);

  app.post(
    "/api/v1/career-targets",
    { preHandler: app.requireVerifiedUser },
    async (request, reply) => {
      const input = createCareerTargetSchema.safeParse(request.body);
      if (!input.success)
        return reply.status(400).send({
          code: "VALIDATION_ERROR",
          message: "Provide a title and valid linked documents.",
        });
      try {
        const userId = request.authContext!.user.id;
        // Server-side plan check. It runs before the existing target is archived
        // so the free plan's single live target cannot be side-stepped by simply
        // creating another one.
        await app.entitlements.requireCareerTargetCapacity(userId);
        return reply.status(201).send({ careerTarget: await service.create(userId, input.data) });
      } catch (error) {
        if (error instanceof BillingError) return sendBillingError(reply, error);
        return sendTargetError(reply, error);
      }
    },
  );

  app.get("/api/v1/career-targets", { preHandler: app.requireVerifiedUser }, async (request) => ({
    careerTargets: await service.list(request.authContext!.user.id),
  }));

  app.get(
    "/api/v1/career-targets/:id",
    { preHandler: app.requireVerifiedUser },
    async (request, reply) => {
      const params = careerTargetIdSchema.safeParse(request.params);
      if (!params.success)
        return reply
          .status(400)
          .send({ code: "VALIDATION_ERROR", message: "Invalid career target ID." });
      try {
        return { careerTarget: await service.get(params.data.id, request.authContext!.user.id) };
      } catch (error) {
        return sendTargetError(reply, error);
      }
    },
  );

  app.patch(
    "/api/v1/career-targets/:id",
    { preHandler: app.requireVerifiedUser },
    async (request, reply) => {
      const params = careerTargetIdSchema.safeParse(request.params);
      if (!params.success)
        return reply
          .status(400)
          .send({ code: "VALIDATION_ERROR", message: "Invalid career target ID." });
      const input = updateCareerTargetSchema.safeParse(request.body);
      if (!input.success)
        return reply.status(400).send({
          code: "VALIDATION_ERROR",
          message: "Provide valid target fields.",
        });
      try {
        return {
          careerTarget: await service.update(
            params.data.id,
            request.authContext!.user.id,
            input.data,
          ),
        };
      } catch (error) {
        return sendTargetError(reply, error);
      }
    },
  );

  app.delete(
    "/api/v1/career-targets/:id",
    { preHandler: app.requireVerifiedUser },
    async (request, reply) => {
      const params = careerTargetIdSchema.safeParse(request.params);
      if (!params.success)
        return reply
          .status(400)
          .send({ code: "VALIDATION_ERROR", message: "Invalid career target ID." });
      try {
        await service.archive(params.data.id, request.authContext!.user.id);
        return reply.status(204).send();
      } catch (error) {
        return sendTargetError(reply, error);
      }
    },
  );
  return service;
}
