import type { Resume as PrismaResume } from "../../../prisma/generated/client.js";
import type { Resume } from "@interviewer-ai/types";

export function toResumeDto(resume: PrismaResume): Resume {
  return {
    id: resume.id,
    fileName: resume.fileName,
    mimeType: resume.mimeType,
    fileSize: resume.fileSize,
    status: resume.status,
    isActive: resume.isActive,
    uploadedAt: resume.uploadedAt?.toISOString() ?? null,
    createdAt: resume.createdAt.toISOString(),
  };
}
