import { finalizeTranscriptRequestSchema } from "@interviewer-ai/types";
import { z } from "zod";

export const conversationInterviewIdSchema = z.object({ id: z.uuid() });
export const conversationTurnIdSchema = z.object({ id: z.uuid(), turnId: z.uuid() });
export { finalizeTranscriptRequestSchema };
