import { z } from "zod";

export const createJobDescriptionSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  company: z.string().trim().min(1).max(160).optional(),
  rawText: z.string().trim().min(100).max(50_000),
});
export const jobDescriptionIdSchema = z.object({ id: z.uuid() });
export type CreateJobDescriptionInput = z.infer<typeof createJobDescriptionSchema>;
