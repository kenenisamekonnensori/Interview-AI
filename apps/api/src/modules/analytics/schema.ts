import {
  interviewDifficultySchema,
  interviewIdSchema,
  interviewTypeSchema,
} from "@interviewer-ai/types";
import { z } from "zod";

export const analyticsFilterSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  interviewType: interviewTypeSchema.optional(),
  role: z.string().trim().min(1).max(160).optional(),
  difficulty: interviewDifficultySchema.optional(),
  skillArea: z.string().trim().min(1).max(100).optional(),
});

export { interviewIdSchema };
export type AnalyticsFilter = z.infer<typeof analyticsFilterSchema>;
