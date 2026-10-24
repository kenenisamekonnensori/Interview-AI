import { safetyPrivacyPrompt } from "./safety.js";

/** Instructions for the persisted interview-plan contract owned by @interviewer-ai/types. */
export function buildInterviewPlanPrompt() {
  return `Create a realistic interview plan using only the supplied configuration and candidate context.
Return JSON only. Do not include Markdown, commentary, or extra keys.
The JSON object must have exactly these fields:
- objectives: a non-empty array of concise strings.
- topics: a non-empty array of { topic: string, priority: "HIGH" | "MEDIUM" | "LOW", minutes: integer }.
- evaluationRubric: a non-empty array of concise strings.
- timeline: a non-empty array of { phase: string, minutes: integer }.
- followUpStrategy: a non-empty string.
- fallbackStrategy: a non-empty string.
Use positive whole minutes. The topic and timeline allocations must each fit within the requested duration. If no resume, job description, or specific role is supplied (a general get-to-know-you practice session), design a warm intake and diagnostic interview plan focused on discovering the candidate's background, career aspirations, technical skills, and past project experiences. Do not expose this plan to the candidate. ${safetyPrivacyPrompt}`;
}
