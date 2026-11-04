import { conversationTurnTypeSchema, finalizeTranscriptRequestSchema } from "@interviewer-ai/types";
import { z } from "zod";

export const conversationInterviewIdSchema = z.object({ id: z.uuid() });
export const conversationTurnIdSchema = z.object({ id: z.uuid(), turnId: z.uuid() });
export { finalizeTranscriptRequestSchema };

export const internalTurnSyncSchema = z.object({
  speaker: z.enum(["USER", "AI", "SYSTEM"]),
  type: conversationTurnTypeSchema,
  text: z.string().trim().min(1),
  startedAt: z.string().datetime().optional(),
  endedAt: z.string().datetime().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  words: z
    .array(
      z.object({
        word: z.string(),
        start: z.number(),
        end: z.number(),
        confidence: z.number().optional(),
      }),
    )
    .optional(),
});
export type InternalTurnSyncInput = z.infer<typeof internalTurnSyncSchema>;
