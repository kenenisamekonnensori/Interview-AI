import { interviewDifficultySchema } from "@interviewer-ai/types";
import { z } from "zod";

const optionalText = z.string().trim().min(1).max(160).nullable().optional();
export const accessibilityPreferencesSchema = z.object({
  captions: z.boolean().default(false),
  reduceMotion: z.boolean().default(false),
  highContrast: z.boolean().default(false),
  keyboardNavigation: z.boolean().default(false),
});
export const userProfileUpdateSchema = z.object({
  preferredName: optionalText,
  profession: optionalText,
  targetRole: optionalText,
  seniority: optionalText,
  yearsOfExperience: z.number().int().min(0).max(80).nullable().optional(),
  preferredLanguage: z.string().trim().min(2).max(10).optional(),
  defaultInterviewDuration: z.number().int().min(10).max(120).optional(),
  defaultDifficulty: interviewDifficultySchema.optional(),
  voicePreference: z.string().trim().min(1).max(80).nullable().optional(),
  accessibilityPreferences: accessibilityPreferencesSchema.optional(),
});
export type UserProfileUpdate = z.infer<typeof userProfileUpdateSchema>;
