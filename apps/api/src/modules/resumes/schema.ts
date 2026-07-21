import { z } from "zod";

const supportedResumeMimeTypes = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export const createResumeUploadSchema = z.object({
  fileName: z.string().trim().min(1).max(180),
  mimeType: z.enum(supportedResumeMimeTypes),
  fileSize: z
    .number()
    .int()
    .positive()
    .max(10 * 1024 * 1024),
});

export const resumeIdSchema = z.object({ id: z.uuid() });

export const listResumesQuerySchema = z.object({
  includePending: z.coerce.boolean().optional().default(false),
});

export type CreateResumeUploadInput = z.infer<typeof createResumeUploadSchema>;
