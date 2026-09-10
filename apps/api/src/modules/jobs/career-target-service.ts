import type {
  CareerTargetDto,
  CreateCareerTargetRequest,
  UpdateCareerTargetRequest,
} from "@interviewer-ai/types";
import type { PrismaClient } from "../../../prisma/generated/client.js";

export class CareerTargetError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CareerTargetError";
  }
}

function toDto(target: {
  id: string;
  title: string;
  company: string | null;
  jobDescriptionId: string | null;
  jobUrl: string | null;
  location: string | null;
  resumeId: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}): CareerTargetDto {
  return {
    ...target,
    status: target.status as CareerTargetDto["status"],
    createdAt: target.createdAt.toISOString(),
    updatedAt: target.updatedAt.toISOString(),
  };
}

export class CareerTargetService {
  constructor(private readonly database: PrismaClient) {}

  list(userId: string) {
    return this.database.careerTarget
      .findMany({
        where: { userId },
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      })
      .then((targets) => targets.map(toDto));
  }

  /**
   * Creates a target and makes it the user's current target. The previous
   * ACTIVE target is archived in the same transaction so exactly one target is
   * current at any time. Linked documents must be owned by the user; no AI call
   * happens at creation time.
   */
  async create(userId: string, input: CreateCareerTargetRequest) {
    return this.database.$transaction(async (tx) => {
      if (input.jobDescriptionId) {
        const job = await tx.jobDescription.findFirst({
          where: { id: input.jobDescriptionId, userId, deletedAt: null },
          select: { id: true },
        });
        if (!job)
          throw new CareerTargetError(
            "JOB_DESCRIPTION_NOT_FOUND",
            "Choose a job description you own.",
          );
      }
      if (input.resumeId) {
        const resume = await tx.resume.findFirst({
          where: { id: input.resumeId, userId, deletedAt: null },
          select: { id: true },
        });
        if (!resume) throw new CareerTargetError("RESUME_NOT_FOUND", "Choose a resume you own.");
      }
      await tx.careerTarget.updateMany({
        where: { userId, status: "ACTIVE" },
        data: { status: "ARCHIVED" },
      });
      return toDto(
        await tx.careerTarget.create({
          data: {
            userId,
            title: input.title,
            company: input.company ?? null,
            jobDescriptionId: input.jobDescriptionId ?? null,
            jobUrl: input.jobUrl ?? null,
            location: input.location ?? null,
            resumeId: input.resumeId ?? null,
            status: "ACTIVE",
          },
        }),
      );
    });
  }

  async get(id: string, userId: string) {
    const target = await this.database.careerTarget.findFirst({ where: { id, userId } });
    if (!target) throw new CareerTargetError("CAREER_TARGET_NOT_FOUND", "Career target not found.");
    return toDto(target);
  }

  /**
   * Partial update. Activating a target demotes any other ACTIVE target so the
   * one-current-target invariant holds; archiving only changes this target.
   */
  async update(id: string, userId: string, input: UpdateCareerTargetRequest) {
    return this.database.$transaction(async (tx) => {
      const target = await tx.careerTarget.findFirst({ where: { id, userId } });
      if (!target)
        throw new CareerTargetError("CAREER_TARGET_NOT_FOUND", "Career target not found.");
      if (input.jobDescriptionId !== undefined && input.jobDescriptionId !== null) {
        const job = await tx.jobDescription.findFirst({
          where: { id: input.jobDescriptionId, userId, deletedAt: null },
          select: { id: true },
        });
        if (!job)
          throw new CareerTargetError(
            "JOB_DESCRIPTION_NOT_FOUND",
            "Choose a job description you own.",
          );
      }
      if (input.resumeId !== undefined && input.resumeId !== null) {
        const resume = await tx.resume.findFirst({
          where: { id: input.resumeId, userId, deletedAt: null },
          select: { id: true },
        });
        if (!resume) throw new CareerTargetError("RESUME_NOT_FOUND", "Choose a resume you own.");
      }
      if (input.status === "ACTIVE") {
        await tx.careerTarget.updateMany({
          where: { userId, status: "ACTIVE" },
          data: { status: "ARCHIVED" },
        });
      }
      const { status, ...fields } = input;
      return toDto(
        await tx.careerTarget.update({
          where: { id },
          data: {
            ...(fields.title !== undefined ? { title: fields.title } : {}),
            ...(fields.company !== undefined ? { company: fields.company } : {}),
            ...(fields.jobDescriptionId !== undefined
              ? { jobDescriptionId: fields.jobDescriptionId }
              : {}),
            ...(fields.jobUrl !== undefined ? { jobUrl: fields.jobUrl } : {}),
            ...(fields.location !== undefined ? { location: fields.location } : {}),
            ...(fields.resumeId !== undefined ? { resumeId: fields.resumeId } : {}),
            ...(status ? { status } : {}),
          },
        }),
      );
    });
  }

  /**
   * Archive (soft delete). The row is kept so completed interviews keep their
   * job context; it simply stops being the current target. Idempotent.
   */
  async archive(id: string, userId: string) {
    const target = await this.database.careerTarget.findFirst({ where: { id, userId } });
    if (!target) throw new CareerTargetError("CAREER_TARGET_NOT_FOUND", "Career target not found.");
    if (target.status === "ACTIVE") {
      await this.database.careerTarget.update({
        where: { id },
        data: { status: "ARCHIVED" },
      });
    }
  }
}
