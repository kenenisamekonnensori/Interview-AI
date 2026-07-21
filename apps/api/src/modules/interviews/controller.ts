import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "../../../prisma/generated/client.js";
import { createInterviewSchema, interviewIdSchema } from "./schema.js";
import type { createCareerAnalysisQueue } from "../../services/career-analysis-queue.js";

function toDto(interview: {
  id: string;
  status: string;
  interviewType: string;
  difficulty: string;
  durationMinutes: number;
  language: string;
  targetRole: string | null;
  createdAt: Date;
  resume?: { id: string; fileName: string } | null;
  jobDescription?: { id: string; title: string | null; company: string | null } | null;
}) {
  return { ...interview, createdAt: interview.createdAt.toISOString() };
}

export function registerInterviewRoutes(
  app: FastifyInstance,
  database: PrismaClient,
  queue: ReturnType<typeof createCareerAnalysisQueue>,
) {
  app.post(
    "/api/v1/interviews",
    { preHandler: app.requireVerifiedUser },
    async (request, reply) => {
      const input = createInterviewSchema.safeParse(request.body);
      if (!input.success)
        return reply
          .status(400)
          .send({ code: "VALIDATION_ERROR", message: "Choose a valid interview configuration." });
      const userId = request.authContext!.user.id;
      const [resume, job] = await Promise.all([
        input.data.resumeId
          ? database.resume.findFirst({
              where: {
                id: input.data.resumeId,
                userId,
                deletedAt: null,
                status: { in: ["READY", "ANALYZED"] },
              },
            })
          : null,
        input.data.jobDescriptionId
          ? database.jobDescription.findFirst({
              where: { id: input.data.jobDescriptionId, userId, deletedAt: null },
            })
          : null,
      ]);
      if (input.data.resumeId && !resume)
        return reply.status(404).send({
          code: "RESUME_NOT_FOUND",
          message: "Choose a resume you own that is ready to use.",
        });
      if (input.data.jobDescriptionId && !job)
        return reply.status(404).send({
          code: "JOB_DESCRIPTION_NOT_FOUND",
          message: "Choose a job description you own.",
        });
      const interview = await database.interview.create({
        data: {
          userId,
          interviewType: input.data.interviewType,
          difficulty: input.data.difficulty,
          durationMinutes: input.data.durationMinutes,
          language: input.data.language,
          targetRole: input.data.targetRole ?? null,
          resumeId: resume?.id ?? null,
          jobDescriptionId: job?.id ?? null,
        },
        include: {
          resume: { select: { id: true, fileName: true } },
          jobDescription: { select: { id: true, title: true, company: true } },
        },
      });
      return reply.status(201).send({ interview: toDto(interview) });
    },
  );
  app.get("/api/v1/interviews", { preHandler: app.requireVerifiedUser }, async (request) => ({
    interviews: (
      await database.interview.findMany({
        where: { userId: request.authContext!.user.id },
        include: {
          resume: { select: { id: true, fileName: true } },
          jobDescription: { select: { id: true, title: true, company: true } },
        },
        orderBy: { createdAt: "desc" },
      })
    ).map(toDto),
  }));
  app.post(
    "/api/v1/interviews/:id/prepare",
    { preHandler: app.requireVerifiedUser },
    async (request, reply) => {
      const params = interviewIdSchema.safeParse(request.params);
      if (!params.success)
        return reply
          .status(400)
          .send({ code: "VALIDATION_ERROR", message: "Invalid interview ID." });
      const interview = await database.interview.findFirst({
        where: { id: params.data.id, userId: request.authContext!.user.id },
      });
      if (!interview)
        return reply
          .status(404)
          .send({ code: "INTERVIEW_NOT_FOUND", message: "Interview not found." });
      if (interview.status !== "DRAFT" && interview.status !== "FAILED")
        return reply.status(409).send({
          code: "INTERVIEW_NOT_PREPARABLE",
          message: "Only draft interviews can be prepared.",
        });
      await database.interview.update({
        where: { id: interview.id },
        data: { status: "PREPARING" },
      });
      await queue.enqueue({
        kind: "interview-plan",
        interviewId: interview.id,
        userId: interview.userId,
      });
      return reply.status(202).send({ status: "PREPARING" });
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
      const interview = await database.interview.findFirst({
        where: { id: params.data.id, userId: request.authContext!.user.id },
        include: { plan: true },
      });
      if (!interview)
        return reply
          .status(404)
          .send({ code: "INTERVIEW_NOT_FOUND", message: "Interview not found." });
      return { status: interview.status, plan: interview.plan };
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
      const update = await database.interview.updateMany({
        where: { id: params.data.id, userId: request.authContext!.user.id, status: "DRAFT" },
        data: { status: "CANCELLED" },
      });
      return update.count
        ? reply.status(204).send()
        : reply.status(409).send({
            code: "INTERVIEW_NOT_CANCELLABLE",
            message: "Only draft interviews can be cancelled.",
          });
    },
  );
}
