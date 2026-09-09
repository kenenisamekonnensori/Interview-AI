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
  careerTargetId: z.uuid().optional(),
  interviewType: interviewTypeSchema,
  difficulty: interviewDifficultySchema,
  durationMinutes: z.number().int().min(10).max(120),
  language: z.string().trim().min(2).max(10).default("en"),
  targetRole: z.string().trim().min(1).max(160).optional(),
});
export type InterviewConfiguration = z.infer<typeof interviewConfigurationSchema>;

export const careerTargetStatuses = ["ACTIVE", "ARCHIVED"] as const;
export const careerTargetStatusSchema = z.enum(careerTargetStatuses);
export type CareerTargetStatus = z.infer<typeof careerTargetStatusSchema>;

export const createCareerTargetSchema = z.object({
  title: z.string().trim().min(1).max(160),
  company: z.string().trim().max(160).optional(),
  jobDescriptionId: z.uuid().optional(),
  jobUrl: z.string().trim().url().max(2048).optional(),
  location: z.string().trim().max(160).optional(),
  resumeId: z.uuid().optional(),
});
export type CreateCareerTargetRequest = z.infer<typeof createCareerTargetSchema>;

export const updateCareerTargetSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  company: z.string().trim().max(160).nullable().optional(),
  jobDescriptionId: z.uuid().nullable().optional(),
  jobUrl: z.string().trim().url().max(2048).nullable().optional(),
  location: z.string().trim().max(160).nullable().optional(),
  resumeId: z.uuid().nullable().optional(),
  status: careerTargetStatusSchema.optional(),
});
export type UpdateCareerTargetRequest = z.infer<typeof updateCareerTargetSchema>;

export const careerTargetDtoSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  company: z.string().nullable(),
  jobDescriptionId: z.uuid().nullable(),
  jobUrl: z.string().nullable(),
  location: z.string().nullable(),
  resumeId: z.uuid().nullable(),
  status: careerTargetStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type CareerTargetDto = z.infer<typeof careerTargetDtoSchema>;
export type CareerTargetListResponse = { careerTargets: CareerTargetDto[] };

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
  careerTarget: z
    .object({ id: z.uuid(), title: z.string(), company: z.string().nullable() })
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
export const liveConversationSnapshotSchema = conversationDtoSchema.extend({
  turns: z.array(conversationTurnSchema).max(60),
});
export type LiveConversationSnapshot = z.infer<typeof liveConversationSnapshotSchema>;

export const evaluationDimensionSchema = z.object({
  score: z.number().min(0).max(100),
  feedback: z.string().trim().min(1).max(1_000),
  evidenceTurnIds: z.array(z.uuid()).min(1).max(5),
});
export const reportEvidenceReferenceSchema = z.object({
  turnId: z.uuid(),
  claim: z.string().trim().min(1).max(1_000),
});
export type ReportEvidenceReference = z.infer<typeof reportEvidenceReferenceSchema>;
export const evidenceBackedFindingSchema = z.object({
  text: z.string().trim().min(1).max(1_000),
  evidenceTurnIds: z.array(z.uuid()).min(1).max(5),
});
export type EvidenceBackedFinding = z.infer<typeof evidenceBackedFindingSchema>;
export const interviewEvaluationSchema = z.object({
  overallScore: z.number().min(0).max(100),
  technical: evaluationDimensionSchema,
  communication: evaluationDimensionSchema,
  confidence: evaluationDimensionSchema,
  problemSolving: evaluationDimensionSchema,
  categoryScores: z.record(z.string().trim().min(1).max(100), evaluationDimensionSchema),
  strengths: z.array(evidenceBackedFindingSchema).max(10),
  weaknesses: z.array(evidenceBackedFindingSchema).max(10),
  missedOpportunities: z.array(evidenceBackedFindingSchema).max(10),
  recommendations: z.array(z.string().trim().min(1).max(1_000)).max(10),
});
export type InterviewEvaluation = z.infer<typeof interviewEvaluationSchema>;
export const reportStatuses = ["PENDING", "GENERATING", "READY", "FAILED"] as const;
export const reportStatusSchema = z.enum(reportStatuses);
export type ReportStatus = z.infer<typeof reportStatusSchema>;
export const hiringRecommendations = ["STRONG_HIRE", "HIRE", "NO_HIRE", "STRONG_NO_HIRE"] as const;
export const hiringRecommendationSchema = z.enum(hiringRecommendations);
export type HiringRecommendation = z.infer<typeof hiringRecommendationSchema>;
export const interviewReportSchema = z.object({
  id: z.uuid(),
  interviewId: z.uuid(),
  status: reportStatusSchema,
  evaluation: interviewEvaluationSchema.nullable(),
  summary: z.string().nullable(),
  evidence: z.array(reportEvidenceReferenceSchema),
  hiringRecommendation: hiringRecommendationSchema.nullable(),
  failureReason: z.string().nullable(),
  generatedAt: z.string().datetime().nullable(),
});
export type InterviewReport = z.infer<typeof interviewReportSchema>;

export const performanceRangePresets = ["all", "30d", "90d", "custom"] as const;
export const performanceRangePresetSchema = z.enum(performanceRangePresets);
export type PerformanceRangePreset = z.infer<typeof performanceRangePresetSchema>;

/**
 * Server-authoritative longitudinal performance summary. Every value is
 * computed by the API from schema-valid, persisted evaluations; no AI call is
 * used for statistics. Nullable fields are explicit empty states.
 */
export const performanceSummarySchema = z.object({
  window: z.object({
    preset: performanceRangePresetSchema,
    from: z.string().datetime().nullable(),
    to: z.string().datetime().nullable(),
  }),
  completedInterviewCount: z.number().int().nonnegative(),
  validReportCount: z.number().int().nonnegative(),
  averageOverallScore: z.number().min(0).max(100).nullable(),
  recentScore: z.number().min(0).max(100).nullable(),
  comparison: z.object({
    latestScore: z.number().min(0).max(100).nullable(),
    previousAverage: z.number().min(0).max(100).nullable(),
    change: z.number().min(-100).max(100).nullable(),
  }),
  trend: z.object({
    change: z.number().min(-100).max(100).nullable(),
    direction: z.enum(["up", "down", "flat"]).nullable(),
  }),
  categories: z
    .array(
      z.object({
        key: z.string().min(1),
        label: z.string().min(1),
        average: z.number().min(0).max(100).nullable(),
        latest: z.number().min(0).max(100).nullable(),
      }),
    )
    .max(6),
  series: z
    .array(
      z.object({
        completedAt: z.string().datetime(),
        overallScore: z.number().min(0).max(100),
        interviewType: interviewTypeSchema,
      }),
    )
    .max(60),
});
export type PerformanceSummary = z.infer<typeof performanceSummarySchema>;

export const apiErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  details: z.record(z.string(), z.unknown()).optional(),
});
export type ApiErrorShape = z.infer<typeof apiErrorSchema>;

export const nextPracticeRecommendationSchema = z.object({
  suggestedTargetRole: z.string().min(1),
  interviewType: interviewTypeSchema,
  difficulty: interviewDifficultySchema,
  suggestedDurationMinutes: z.number().int().min(10).max(120),
  resumeId: z.uuid().optional(),
  jobDescriptionId: z.uuid().optional(),
  careerTargetId: z.uuid().optional(),
  reasons: z.array(z.string().min(1)).max(3),
  focusAreas: z.array(z.string().min(1)).max(3),
  basis: z.enum(["PROFILE", "HISTORY"]),
  setupSuggestion: z.string().min(1).optional(),
});
export type NextPracticeRecommendation = z.infer<typeof nextPracticeRecommendationSchema>;

/**
 * Server-authoritative dashboard overview. Every metric is computed by the API
 * from persisted, schema-valid data; nullable fields are explicit empty states
 * (never fabricated client-side).
 */
export const dashboardOverviewSchema = z.object({
  generatedAt: z.string().datetime(),
  stats: z.object({
    completedInterviews: z.number().int().nonnegative(),
    interviewsThisWeek: z.number().int().nonnegative(),
    averageOverallScore: z.number().min(0).max(100).nullable(),
    latestOverallScore: z.number().min(0).max(100).nullable(),
    /** Number of schema-valid reports behind the average, for explainability. */
    scoredReportCount: z.number().int().nonnegative(),
  }),
  preparation: z.object({
    targetRole: z.string().nullable(),
    activeTarget: z
      .object({
        id: z.uuid(),
        title: z.string(),
        company: z.string().nullable(),
        jobUrl: z.string().nullable(),
        location: z.string().nullable(),
        updatedAt: z.string().datetime(),
      })
      .nullable(),
    hasActiveResume: z.boolean(),
    savedJobDescriptionCount: z.number().int().nonnegative(),
  }),
  recommendation: nextPracticeRecommendationSchema,
  activeInterview: z
    .object({
      id: z.uuid(),
      status: interviewStatusSchema,
      targetRole: z.string().nullable(),
    })
    .nullable(),
  recentInterviews: z
    .array(
      z.object({
        id: z.uuid(),
        status: interviewStatusSchema,
        interviewType: interviewTypeSchema,
        targetRole: z.string().nullable(),
        overallScore: z.number().min(0).max(100).nullable(),
        reportStatus: reportStatusSchema.nullable(),
        createdAt: z.string().datetime(),
        completedAt: z.string().datetime().nullable(),
      }),
    )
    .max(5),
});
export type DashboardOverview = z.infer<typeof dashboardOverviewSchema>;

/** Safe, application-level guidance supplied when a persisted candidate turn awaits an AI turn. */
export const aiResponseRecoverySchema = z.object({
  transcriptSaved: z.literal(true),
  conversationState: z.literal("THINKING"),
  retryable: z.literal(true),
  actions: z.object({
    retry: z.literal(true),
    continueByTyping: z.literal(true),
    endInterview: z.literal(true),
  }),
});
export type AiResponseRecovery = z.infer<typeof aiResponseRecoverySchema>;

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
