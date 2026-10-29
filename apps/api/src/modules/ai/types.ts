import type { ConversationState } from "@interviewer-ai/types";

export type AiInterviewContext = {
  interviewType: string;
  difficulty: string;
  targetRole: string | null;
  language: string;
  objectives: string[];
  topics: string[];
  durationRemainingSeconds: number;
  selectedTopic?: { topic: string; priority: "HIGH" | "MEDIUM" | "LOW" } | undefined;
  resumeSummary?: string | undefined;
  resumeSkills?: string[] | undefined;
  jobRequiredSkills?: string[] | undefined;
  priorWeakAreas?: string[] | undefined;
  isGeneralIntake?: boolean | undefined;
};

export type AiConversationMemory = {
  coveredTopics: string[];
  questionCount: number;
  recentTurns: Array<{ speaker: string; type: string; text: string }>;
  unresolvedFollowUps: string[];
  askedQuestions: string[];
  questionDifficulty: string;
};

export type GenerateInterviewerResponseInput = {
  interviewContext: AiInterviewContext;
  conversationMemory: AiConversationMemory;
  latestCandidateAnswer: string | null;
  /** Real-time turns must fail fast instead of stalling the session. */
  timeoutMs?: number;
  /**
   * First-turn greeting: a compact prompt, small output budget, and tighter
   * attempt count, since every extra second is dead air before the interview
   * even starts.
   */
  greetingOnly?: boolean;
};

export type InterviewerResponseProposal = {
  responseText: string;
  responseType: "GREETING" | "QUESTION" | "FOLLOW_UP" | "CLARIFICATION" | "CLOSING";
  recommendedAction: "ASK_QUESTION" | "ASK_FOLLOW_UP" | "REQUEST_CLARIFICATION" | "CLOSE_INTERVIEW";
  topicReference?: string | undefined;
  objectiveReference?: string | undefined;
  suggestedNextConversationState: Extract<ConversationState, "SPEAKING" | "CLOSING">;
  assessment?:
    { answerDepth: "SHALLOW" | "ADEQUATE" | "STRONG"; followUpNeeded: boolean } | undefined;
};

export type AiStructuredRequest = {
  instructions: string;
  context: unknown;
  timeoutMs?: number;
  maxOutputTokens?: number;
  maxAttempts?: number;
};
