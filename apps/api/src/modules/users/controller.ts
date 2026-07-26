import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "../../../prisma/generated/client.js";
import { UserProfileService } from "./service.js";
import { userProfileUpdateSchema } from "./schema.js";

function toDto(profile: Awaited<ReturnType<UserProfileService["get"]>>) {
  return {
    ...profile,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  };
}
export function registerUserProfileRoutes(app: FastifyInstance, database: PrismaClient) {
  const service = new UserProfileService(database);
  app.get("/api/v1/profile", { preHandler: app.requireVerifiedUser }, async (request) => ({
    profile: toDto(await service.get(request.authContext!.user.id)),
  }));
  app.put("/api/v1/profile", { preHandler: app.requireVerifiedUser }, async (request, reply) => {
    const input = userProfileUpdateSchema.safeParse(request.body);
    if (!input.success)
      return reply
        .status(400)
        .send({ code: "VALIDATION_ERROR", message: "Provide valid profile settings." });
    return { profile: toDto(await service.update(request.authContext!.user.id, input.data)) };
  });
}
