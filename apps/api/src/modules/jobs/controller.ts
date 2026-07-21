import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "../../../prisma/generated/client.js";
import { createJobDescriptionSchema, jobDescriptionIdSchema } from "./schema.js";
import type { createCareerAnalysisQueue } from "../../services/career-analysis-queue.js";

const toDto = (job: {
  id: string;
  title: string | null;
  company: string | null;
  rawText: string;
  status: string;
  createdAt: Date;
}) => ({ ...job, createdAt: job.createdAt.toISOString() });

export function registerJobDescriptionRoutes(
  app: FastifyInstance,
  {
    database,
    queue,
  }: { database: PrismaClient; queue: ReturnType<typeof createCareerAnalysisQueue> },
) {
  app.post(
    "/api/v1/job-descriptions",
    { preHandler: app.requireVerifiedUser },
    async (request, reply) => {
      const input = createJobDescriptionSchema.safeParse(request.body);
      if (!input.success)
        return reply.status(400).send({
          code: "VALIDATION_ERROR",
          message: "Provide a job description of at least 100 characters.",
        });
      const job = await database.jobDescription.create({
        data: {
          userId: request.authContext!.user.id,
          rawText: input.data.rawText,
          title: input.data.title ?? null,
          company: input.data.company ?? null,
        },
      });
      return reply.status(201).send({ jobDescription: toDto(job) });
    },
  );
  app.get("/api/v1/job-descriptions", { preHandler: app.requireVerifiedUser }, async (request) => ({
    jobDescriptions: (
      await database.jobDescription.findMany({
        where: { userId: request.authContext!.user.id, deletedAt: null },
        orderBy: { createdAt: "desc" },
      })
    ).map(toDto),
  }));
  app.post(
    "/api/v1/job-descriptions/:id/analyze",
    { preHandler: app.requireVerifiedUser },
    async (request, reply) => {
      const params = jobDescriptionIdSchema.safeParse(request.params);
      if (!params.success)
        return reply
          .status(400)
          .send({ code: "VALIDATION_ERROR", message: "Invalid job description ID." });
      const job = await database.jobDescription.findFirst({
        where: { id: params.data.id, userId: request.authContext!.user.id, deletedAt: null },
      });
      if (!job)
        return reply
          .status(404)
          .send({ code: "JOB_DESCRIPTION_NOT_FOUND", message: "Job description not found." });
      if (job.status !== "ANALYZING") {
        await database.jobDescription.update({
          where: { id: job.id },
          data: { status: "ANALYZING" },
        });
        await queue.enqueue({
          kind: "job-description",
          jobDescriptionId: job.id,
          userId: job.userId,
        });
      }
      return reply.status(202).send({ status: "ANALYZING" });
    },
  );
  app.delete(
    "/api/v1/job-descriptions/:id",
    { preHandler: app.requireVerifiedUser },
    async (request, reply) => {
      const params = jobDescriptionIdSchema.safeParse(request.params);
      if (!params.success)
        return reply
          .status(400)
          .send({ code: "VALIDATION_ERROR", message: "Invalid job description ID." });
      const update = await database.jobDescription.updateMany({
        where: { id: params.data.id, userId: request.authContext!.user.id, deletedAt: null },
        data: { deletedAt: new Date(), status: "DELETED" },
      });
      return update.count
        ? reply.status(204).send()
        : reply
            .status(404)
            .send({ code: "JOB_DESCRIPTION_NOT_FOUND", message: "Job description not found." });
    },
  );
}
