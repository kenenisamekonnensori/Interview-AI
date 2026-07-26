import type { ConversationState } from "@interviewer-ai/types";

export type AiInterviewContext = {
  interviewType: string;
  difficulty: string;
  targetRole: string | null;
  objectives: string[];
  topics: string[];
  durationRemainingSeconds: number;
};

export type AiConversationMemory = {
  coveredTopics: string[];
  questionCount: number;
  recentTurns: Array<{ speaker: string; type: string; text: string }>;
  unresolvedFollowUps: string[];
};

export type GenerateInterviewerResponseInput = {
  interviewContext: AiInterviewContext;
  conversationMemory: AiConversationMemory;
  latestCandidateAnswer: string | null;
};

export type InterviewerResponseProposal = {
  responseText: string;
  responseType: "QUESTION" | "FOLLOW_UP" | "CLARIFICATION" | "CLOSING";
  recommendedAction: "ASK_QUESTION" | "ASK_FOLLOW_UP" | "REQUEST_CLARIFICATION" | "CLOSE_INTERVIEW";
  topicReference?: string | undefined;
  objectiveReference?: string | undefined;
  suggestedNextConversationState: Extract<ConversationState, "SPEAKING" | "CLOSING">;
};

export type AiStructuredRequest = { instructions: string; context: unknown };
