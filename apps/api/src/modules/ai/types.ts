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
};

export type InterviewerResponseProposal = {
  responseText: string;
  responseType: "QUESTION" | "FOLLOW_UP" | "CLARIFICATION" | "CLOSING";
  recommendedAction: "ASK_QUESTION" | "ASK_FOLLOW_UP" | "REQUEST_CLARIFICATION" | "CLOSE_INTERVIEW";
  topicReference?: string | undefined;
  objectiveReference?: string | undefined;
  suggestedNextConversationState: Extract<ConversationState, "SPEAKING" | "CLOSING">;
  assessment?:
    { answerDepth: "SHALLOW" | "ADEQUATE" | "STRONG"; followUpNeeded: boolean } | undefined;
};

export type AiStructuredRequest = { instructions: string; context: unknown };
