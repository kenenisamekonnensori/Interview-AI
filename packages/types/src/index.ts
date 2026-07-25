import { z } from "zod";

export const interviewStatuses = [
  "DRAFT",
  "PREPARING",
  "READY",
  "IN_PROGRESS",
  "COMPLETING",
  "COMPLETED",
  "CANCELLED",
  "FAILED",
] as const;
export const interviewStatusSchema = z.enum(interviewStatuses);
export type InterviewStatus = z.infer<typeof interviewStatusSchema>;

export const conversationStates = [
  "GREETING",
  "LISTENING",
  "TRANSCRIBING",
  "THINKING",
  "SPEAKING",
  "CLOSING",
  "COMPLETED",
] as const;
export const conversationStateSchema = z.enum(conversationStates);
export type ConversationState = z.infer<typeof conversationStateSchema>;

export const interviewTypes = [
  "BEHAVIORAL",
  "TECHNICAL",
  "CODING",
  "SYSTEM_DESIGN",
  "HR",
  "MIXED",
] as const;
export const interviewTypeSchema = z.enum(interviewTypes);
export type InterviewType = z.infer<typeof interviewTypeSchema>;

export const interviewDifficulties = ["EASY", "MEDIUM", "HARD", "EXPERT"] as const;
export const interviewDifficultySchema = z.enum(interviewDifficulties);
export type InterviewDifficulty = z.infer<typeof interviewDifficultySchema>;

export const interviewConfigurationSchema = z.object({
  resumeId: z.uuid().optional(),
  jobDescriptionId: z.uuid().optional(),
  interviewType: interviewTypeSchema,
  difficulty: interviewDifficultySchema,
  durationMinutes: z.number().int().min(10).max(120),
  language: z.string().trim().min(2).max(10).default("en"),
  targetRole: z.string().trim().min(1).max(160).optional(),
});
export type InterviewConfiguration = z.infer<typeof interviewConfigurationSchema>;

export const interviewPlanSchema = z.object({
  objectives: z.array(z.string().trim().min(1)).min(1),
  topics: z
    .array(
      z.object({
        topic: z.string(),
        priority: z.enum(["HIGH", "MEDIUM", "LOW"]),
        minutes: z.number().int(),
      }),
    )
    .min(1),
  evaluationRubric: z.array(z.string().trim().min(1)).min(1),
  timeline: z.array(z.object({ phase: z.string(), minutes: z.number().int() })).min(1),
  followUpStrategy: z.string().trim().min(1),
  fallbackStrategy: z.string().trim().min(1),
});
export type InterviewPlan = z.infer<typeof interviewPlanSchema>;

export const jobDescriptionStatuses = [
  "READY",
  "ANALYZING",
  "ANALYZED",
  "FAILED",
  "DELETED",
] as const;
export const jobDescriptionStatusSchema = z.enum(jobDescriptionStatuses);
export type JobDescriptionStatus = z.infer<typeof jobDescriptionStatusSchema>;
export const jobDescriptionDtoSchema = z.object({
  id: z.uuid(),
  title: z.string().nullable(),
  company: z.string().nullable(),
  rawText: z.string(),
  status: jobDescriptionStatusSchema,
  createdAt: z.string().datetime(),
});
export type JobDescriptionDto = z.infer<typeof jobDescriptionDtoSchema>;
export const jobAnalysisDtoSchema = z.object({
  requiredSkills: z.array(z.string()),
  preferredSkills: z.array(z.string()),
  responsibilities: z.array(z.string()),
  keywords: z.array(z.string()),
  seniority: z.string().nullable(),
  technologyStack: z.array(z.string()),
});
export type JobAnalysisDto = z.infer<typeof jobAnalysisDtoSchema>;

export const conversationSpeakers = ["USER", "AI", "SYSTEM"] as const;
export const conversationSpeakerSchema = z.enum(conversationSpeakers);
export type ConversationSpeaker = z.infer<typeof conversationSpeakerSchema>;
export const conversationTurnTypes = [
  "GREETING",
  "QUESTION",
  "ANSWER",
  "FOLLOW_UP",
  "CLARIFICATION",
  "CLOSING",
] as const;
export const conversationTurnTypeSchema = z.enum(conversationTurnTypes);
export type ConversationTurnType = z.infer<typeof conversationTurnTypeSchema>;
export const conversationTurnSchema = z.object({
  id: z.uuid(),
  sequence: z.number().int().nonnegative(),
  speaker: conversationSpeakerSchema,
  type: conversationTurnTypeSchema,
  text: z.string(),
  createdAt: z.string().datetime(),
});
export type ConversationTurn = z.infer<typeof conversationTurnSchema>;

export const transcriptMetadataSchema = z.object({
  provider: z.string().trim().min(1),
  language: z.string().trim().min(2).max(10),
  confidence: z.number().min(0).max(1).optional(),
  startedAt: z.string().datetime().optional(),
  finalizedAt: z.string().datetime(),
});
export type TranscriptMetadata = z.infer<typeof transcriptMetadataSchema>;
export const finalizeTranscriptRequestSchema = z.object({
  text: z.string().trim().min(1).max(20_000),
  metadata: transcriptMetadataSchema.optional(),
});
export type FinalizeTranscriptRequest = z.infer<typeof finalizeTranscriptRequestSchema>;

export const interviewDtoSchema = interviewConfigurationSchema.extend({
  id: z.uuid(),
  status: interviewStatusSchema,
  createdAt: z.string().datetime(),
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  resume: z.object({ id: z.uuid(), fileName: z.string() }).nullable(),
  jobDescription: z
    .object({ id: z.uuid(), title: z.string().nullable(), company: z.string().nullable() })
    .nullable(),
});
export type InterviewDto = z.infer<typeof interviewDtoSchema>;
export type CreateInterviewRequest = InterviewConfiguration;
export type InterviewListResponse = { interviews: InterviewDto[] };

export const conversationDtoSchema = z.object({
  id: z.uuid(),
  interviewId: z.uuid(),
  state: conversationStateSchema,
  sequence: z.number().int().nonnegative(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
});
export type ConversationDto = z.infer<typeof conversationDtoSchema>;

export const evaluationDimensionSchema = z.object({
  score: z.number().min(0).max(100),
  feedback: z.string(),
});
export const interviewEvaluationSchema = z.object({
  overallScore: z.number().min(0).max(100),
  technical: evaluationDimensionSchema,
  communication: evaluationDimensionSchema,
  confidence: evaluationDimensionSchema,
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  recommendations: z.array(z.string()),
});
export type InterviewEvaluation = z.infer<typeof interviewEvaluationSchema>;
export const interviewReportSchema = z.object({
  id: z.uuid(),
  interviewId: z.uuid(),
  evaluation: interviewEvaluationSchema,
  summary: z.string(),
  generatedAt: z.string().datetime(),
});
export type InterviewReport = z.infer<typeof interviewReportSchema>;

export const apiErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  details: z.record(z.string(), z.unknown()).optional(),
});
export type ApiErrorShape = z.infer<typeof apiErrorSchema>;

export const realtimeEventNames = [
  "InterviewStarted",
  "UserSpeechStarted",
  "TranscriptFinalized",
  "AIResponseGenerated",
  "AIStartedSpeaking",
  "InterviewCompletionRequested",
  "InterviewCompleted",
  "ReportGenerated",
] as const;
export type RealtimeEventName = (typeof realtimeEventNames)[number];
export type RealtimeEventPayloads = {
  InterviewStarted: { interviewId: string; conversation: ConversationDto };
  UserSpeechStarted: { interviewId: string; conversationId: string; occurredAt: string };
  TranscriptFinalized: {
    interviewId: string;
    conversationId: string;
    turn: ConversationTurn;
    metadata?: TranscriptMetadata;
  };
  AIResponseGenerated: { interviewId: string; conversationId: string; turn: ConversationTurn };
  AIStartedSpeaking: {
    interviewId: string;
    conversationId: string;
    turnId: string;
    occurredAt: string;
  };
  InterviewCompletionRequested: { interviewId: string; conversationId: string; occurredAt: string };
  InterviewCompleted: { interviewId: string; conversationId: string; occurredAt: string };
  ReportGenerated: { interviewId: string; report: InterviewReport; occurredAt: string };
};
export type RealtimeEvent = {
  [Name in RealtimeEventName]: { name: Name; payload: RealtimeEventPayloads[Name] };
}[RealtimeEventName];

export type HealthStatus = { status: "ok" };
export type ResumeStatus =
  "PENDING_UPLOAD" | "READY" | "ANALYZING" | "ANALYZED" | "FAILED" | "DELETED";
export type Resume = {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  status: ResumeStatus;
  isActive: boolean;
  uploadedAt: string | null;
  createdAt: string;
};
export type ResumeUploadRequest = {
  fileName: string;
  mimeType:
    "application/pdf" | "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  fileSize: number;
};
export type ResumeUploadResponse = {
  resume: Resume;
  upload: { url: string; headers: Record<string, string>; expiresAt: string };
};
