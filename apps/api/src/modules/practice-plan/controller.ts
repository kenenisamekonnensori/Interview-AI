import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { PrismaClient } from "../../../prisma/generated/client.js";

import { PracticePlanError, PracticePlanService } from "./service.js";
import { practiceItemIdSchema, practiceItemUpdateSchema } from "./schema.js";

export function registerPracticePlanRoutes(app: FastifyInstance, database: PrismaClient) {
  const service = new PracticePlanService(database);

  app.get(
    "/api/v1/practice-plan",
    { preHandler: app.requireVerifiedUser },
    async (request: FastifyRequest) => ({
      plan: await service.getPlan(request.authContext!.user.id),
    }),
  );

  app.post(
    "/api/v1/practice-plan/regenerate",
    { preHandler: app.requireVerifiedUser },
    async (request: FastifyRequest) => ({
      plan: await service.regenerate(request.authContext!.user.id),
    }),
  );

  app.patch(
    "/api/v1/practice-plan/items/:id",
    { preHandler: app.requireVerifiedUser },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = practiceItemIdSchema.safeParse(request.params);
      if (!params.success)
        return reply
          .status(400)
          .send({ code: "VALIDATION_ERROR", message: "Invalid practice item ID." });
      const body = practiceItemUpdateSchema.safeParse(request.body);
      if (!body.success)
        return reply
          .status(400)
          .send({ code: "VALIDATION_ERROR", message: "Invalid practice item update." });
      try {
        return {
          item: await service.updateItem(
            request.authContext!.user.id,
            params.data.id,
            body.data.status,
          ),
        };
      } catch (error) {
        if (error instanceof PracticePlanError)
          return reply
            .status(error.code === "PRACTICE_ITEM_NOT_FOUND" ? 404 : 409)
            .send({ code: error.code, message: error.message });
        throw error;
      }
    },
  );
}
