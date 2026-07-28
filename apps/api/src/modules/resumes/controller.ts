import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ServerEnvironment } from "@interviewer-ai/config";

import { createResumeService, ResumeConflictError, ResumeNotFoundError } from "./service.js";
import { createResumeUploadSchema, listResumesQuerySchema, resumeIdSchema } from "./schema.js";
import { ResumeStorageConfigurationError, ResumeStorageError } from "./storage.js";
import { toResumeDto } from "./types.js";
import type { PrismaClient } from "../../../prisma/generated/client.js";
import type { createCareerAnalysisQueue } from "../../services/career-analysis-queue.js";
import { observability } from "../../services/observability.js";

const resumeContentTypes: string[] = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const maximumResumeFileSize = 10 * 1024 * 1024;

export function registerResumeRoutes(
  app: FastifyInstance,
  {
    database,
    environment,
    queue,
  }: {
    database: PrismaClient;
    environment: ServerEnvironment;
    queue: ReturnType<typeof createCareerAnalysisQueue>;
  },
) {
  app.addContentTypeParser(resumeContentTypes, { parseAs: "buffer" }, (_request, body, done) =>
    done(null, body),
  );
  const service = createResumeService({ database, environment });
  const userId = (request: FastifyRequest) => request.authContext!.user.id;
  const handleError = (reply: FastifyReply, error: unknown) => {
    if (error instanceof ResumeNotFoundError)
      return reply.status(404).send({ code: "RESUME_NOT_FOUND", message: error.message });
    if (error instanceof ResumeConflictError)
      return reply.status(409).send({ code: "RESUME_CONFLICT", message: error.message });
    if (error instanceof ResumeStorageConfigurationError)
      return reply.status(503).send({
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
        observability().event("resume.upload.created", {
          requestId: request.id,
          resumeId: result.resume.id,
        });
        return reply.status(201).send({
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

  app.post(
    "/api/v1/resumes/:id/analyze",
    { preHandler: app.requireVerifiedUser },
    async (request, reply) => {
      const params = resumeIdSchema.safeParse(request.params);
      if (!params.success)
        return reply.status(400).send({ code: "VALIDATION_ERROR", message: "Invalid resume ID." });
      const resume = await service.requireOwned(userId(request), params.data.id);
      if (resume.status === "PENDING_UPLOAD")
        return reply.status(409).send({
          code: "RESUME_NOT_READY",
          message: "Finish uploading this resume before analysis.",
        });
      if (resume.status !== "ANALYZING") {
        await database.resume.update({ where: { id: resume.id }, data: { status: "ANALYZING" } });
        await queue.enqueue({
          kind: "resume",
          resumeId: resume.id,
          userId: resume.userId,
          correlationId: request.id,
        });
      }
      return reply.status(202).send({ status: "ANALYZING" });
    },
  );

  app.post(
    "/api/v1/resumes/:id/content",
    { preHandler: app.requireVerifiedUser, bodyLimit: maximumResumeFileSize },
    async (request, reply) => {
      const params = resumeIdSchema.safeParse(request.params);
      if (!params.success)
        return reply.status(400).send({ code: "VALIDATION_ERROR", message: "Invalid resume ID." });
      if (!Buffer.isBuffer(request.body))
        return reply.status(400).send({
          code: "VALIDATION_ERROR",
          message: "Upload the resume file as PDF or DOCX content.",
        });
      try {
        const resume = await service.uploadThroughApi(
          userId(request),
          params.data.id,
          request.body,
        );
        observability().event("resume.upload.completed", {
          requestId: request.id,
          resumeId: resume.id,
          transport: "api-fallback",
        });
        return { resume: toResumeDto(resume) };
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

  app.get(
    "/api/v1/resumes/:id/analysis",
    { preHandler: app.requireVerifiedUser },
    async (request, reply) => {
      const params = resumeIdSchema.safeParse(request.params);
      if (!params.success)
        return reply.status(400).send({ code: "VALIDATION_ERROR", message: "Invalid resume ID." });
      const resume = await database.resume.findFirst({
        where: { id: params.data.id, userId: userId(request), deletedAt: null },
        include: { analysis: true },
      });
      if (!resume)
        return reply.status(404).send({ code: "RESUME_NOT_FOUND", message: "Resume not found." });
      return { status: resume.status, analysis: resume.analysis };
    },
  );

  app.post(
    "/api/v1/resumes/:id/complete",
    { preHandler: app.requireVerifiedUser },
    async (request, reply) => {
      const params = resumeIdSchema.safeParse(request.params);
      if (!params.success)
        return reply.status(400).send({ code: "VALIDATION_ERROR", message: "Invalid resume ID." });
      try {
        const resume = await service.complete(userId(request), params.data.id);
        observability().event("resume.upload.completed", {
          requestId: request.id,
          resumeId: resume.id,
        });
        return { resume: toResumeDto(resume) };
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
