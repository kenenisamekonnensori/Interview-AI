import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ServerEnvironment } from "@interviewer-ai/config";

import { createResumeService, ResumeConflictError, ResumeNotFoundError } from "./service.js";
import { createResumeUploadSchema, listResumesQuerySchema, resumeIdSchema } from "./schema.js";
import { ResumeStorageConfigurationError, ResumeStorageError } from "./storage.js";
import { toResumeDto } from "./types.js";
import type { PrismaClient } from "../../../prisma/generated/client.js";

export function registerResumeRoutes(
  app: FastifyInstance,
  { database, environment }: { database: PrismaClient; environment: ServerEnvironment },
) {
  const service = createResumeService({ database, environment });
  const userId = (request: FastifyRequest) => request.authContext!.user.id;
  const handleError = (reply: FastifyReply, error: unknown) => {
    if (error instanceof ResumeNotFoundError)
      return reply.status(404).send({ code: "RESUME_NOT_FOUND", message: error.message });
    if (error instanceof ResumeConflictError)
      return reply.status(409).send({ code: "RESUME_CONFLICT", message: error.message });
    if (error instanceof ResumeStorageConfigurationError)
      return reply
        .status(503)
        .send({
          code: "RESUME_STORAGE_UNAVAILABLE",
          message: "Resume uploads are not configured yet.",
        });
    if (error instanceof ResumeStorageError)
      return reply.status(422).send({ code: "RESUME_UPLOAD_NOT_FOUND", message: error.message });
    throw error;
  };

  app.post(
    "/api/v1/resumes/uploads",
    { preHandler: app.requireVerifiedUser },
    async (request, reply) => {
      const input = createResumeUploadSchema.safeParse(request.body);
      if (!input.success)
        return reply
          .status(400)
          .send({ code: "VALIDATION_ERROR", message: "Upload a PDF or DOCX resume up to 10 MB." });
      try {
        const result = await service.requestUpload(userId(request), input.data);
        return reply
          .status(201)
          .send({
            resume: toResumeDto(result.resume),
            upload: {
              url: result.upload.url,
              headers: result.upload.headers,
              expiresAt: result.upload.expiresAt.toISOString(),
            },
          });
      } catch (error) {
        return handleError(reply, error);
      }
    },
  );

  app.get("/api/v1/resumes", { preHandler: app.requireVerifiedUser }, async (request, reply) => {
    const query = listResumesQuerySchema.safeParse(request.query);
    if (!query.success)
      return reply.status(400).send({ code: "VALIDATION_ERROR", message: "Invalid resume query." });
    const resumes = await service.list(userId(request), query.data.includePending);
    return { resumes: resumes.map(toResumeDto) };
  });

  app.post(
    "/api/v1/resumes/:id/complete",
    { preHandler: app.requireVerifiedUser },
    async (request, reply) => {
      const params = resumeIdSchema.safeParse(request.params);
      if (!params.success)
        return reply.status(400).send({ code: "VALIDATION_ERROR", message: "Invalid resume ID." });
      try {
        return { resume: toResumeDto(await service.complete(userId(request), params.data.id)) };
      } catch (error) {
        return handleError(reply, error);
      }
    },
  );

  app.post(
    "/api/v1/resumes/:id/activate",
    { preHandler: app.requireVerifiedUser },
    async (request, reply) => {
      const params = resumeIdSchema.safeParse(request.params);
      if (!params.success)
        return reply.status(400).send({ code: "VALIDATION_ERROR", message: "Invalid resume ID." });
      try {
        return { resume: toResumeDto(await service.setActive(userId(request), params.data.id)) };
      } catch (error) {
        return handleError(reply, error);
      }
    },
  );

  app.delete(
    "/api/v1/resumes/:id",
    { preHandler: app.requireVerifiedUser },
    async (request, reply) => {
      const params = resumeIdSchema.safeParse(request.params);
      if (!params.success)
        return reply.status(400).send({ code: "VALIDATION_ERROR", message: "Invalid resume ID." });
      try {
        await service.remove(userId(request), params.data.id);
        return reply.status(204).send();
      } catch (error) {
        return handleError(reply, error);
      }
    },
  );
}
