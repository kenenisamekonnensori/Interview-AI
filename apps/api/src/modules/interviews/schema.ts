import { z } from "zod";

export const createInterviewSchema = z.object({
  resumeId: z.uuid().optional(),
  jobDescriptionId: z.uuid().optional(),
  interviewType: z.enum(["BEHAVIORAL", "TECHNICAL", "CODING", "SYSTEM_DESIGN", "HR", "MIXED"]),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD", "EXPERT"]),
  durationMinutes: z.number().int().min(10).max(120),
  language: z.string().trim().min(2).max(10).default("en"),
  targetRole: z.string().trim().min(1).max(160).optional(),
});
export const interviewIdSchema = z.object({ id: z.uuid() });
