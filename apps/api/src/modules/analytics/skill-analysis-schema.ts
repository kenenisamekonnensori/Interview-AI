import { skillKeySchema } from "@interviewer-ai/types";
import { z } from "zod";

const skillInsightSchema = z
  .object({
    insight: z.string().trim().min(1).max(600),
    recommendedPractice: z.string().trim().min(1).max(600),
  })
  .strict();

/**
 * Strict output contract for the persisted AI skill interpretation. Only
 * canonical taxonomy keys are accepted; every claim must be grounded in the
 * supplied deterministic statistics (enforced by the prompt and post-checks).
 */
export const skillAnalysisOutputSchema = z
  .object({
    summary: z.string().trim().min(1).max(2_000),
    insights: z.record(z.string(), skillInsightSchema).superRefine((insights, context) => {
      for (const key of Object.keys(insights))
        if (!skillKeySchema.safeParse(key).success)
          context.addIssue({ code: "custom", message: `Unknown skill key: ${key}` });
    }),
  })
  .strict();

export type SkillAnalysisOutput = z.infer<typeof skillAnalysisOutputSchema>;
