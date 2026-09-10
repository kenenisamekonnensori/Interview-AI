import {
  interviewDifficultySchema,
  interviewTypeSchema,
  performanceRangePresetSchema,
} from "@interviewer-ai/types";
import { z } from "zod";
import { interviewIdSchema } from "../interviews/schema.js";

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

export const performanceQuerySchema = z.object({
  range: performanceRangePresetSchema.default("all"),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type PerformanceQuery = z.infer<typeof performanceQuerySchema>;

export { interviewIdSchema };
export type AnalyticsFilter = z.infer<typeof analyticsFilterSchema>;
