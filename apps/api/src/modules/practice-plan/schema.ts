import { practiceItemStatusSchema } from "@interviewer-ai/types";
import { z } from "zod";

export const practiceItemUpdateSchema = z.object({
  status: practiceItemStatusSchema,
});
export type PracticeItemUpdate = z.infer<typeof practiceItemUpdateSchema>;

export const practiceItemIdSchema = z.object({
  id: z.uuid(),
});
export type PracticeItemId = z.infer<typeof practiceItemIdSchema>;
