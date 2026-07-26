import {
  hiringRecommendationSchema,
  interviewEvaluationSchema,
  reportEvidenceReferenceSchema,
} from "@interviewer-ai/types";
import { z } from "zod";

export const generatedReportSchema = z.object({
  evaluation: interviewEvaluationSchema,
  summary: z.string().trim().min(1).max(8_000),
  hiringRecommendation: hiringRecommendationSchema,
  evidence: z.array(reportEvidenceReferenceSchema).min(1).max(40),
});

export type GeneratedReport = z.infer<typeof generatedReportSchema>;
