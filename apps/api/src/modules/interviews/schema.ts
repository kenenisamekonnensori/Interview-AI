import { interviewConfigurationSchema } from "@interviewer-ai/types";
import { z } from "zod";

export const createInterviewSchema = interviewConfigurationSchema.extend({
  difficulty: interviewConfigurationSchema.shape.difficulty.optional(),
  durationMinutes: interviewConfigurationSchema.shape.durationMinutes.optional(),
  language: interviewConfigurationSchema.shape.language.optional(),
});
export type CreateInterviewInput = z.infer<typeof createInterviewSchema>;
export const interviewIdSchema = z.object({ id: z.uuid() });
