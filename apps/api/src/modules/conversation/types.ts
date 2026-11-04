import type { ConversationState, ConversationTurnType } from "@interviewer-ai/types";

export type ConversationTurnRecord = {
  id: string;
  sequence: number;
  speaker: "USER" | "AI" | "SYSTEM";
  type: ConversationTurnType;
  text: string;
  startedAt?: Date | null;
  endedAt?: Date | null;
  durationMs?: number | null;
  words?: unknown;
  createdAt: Date;
};

export type ConversationSessionContext = {
  objectives: string[];
  coveredTopics: string[];
  questionCount: number;
  durationRemainingSeconds: number;
  recentTurns: Array<{ speaker: string; type: string; text: string }>;
  unresolvedFollowUps: string[];
};

export type ConversationResult = {
  turn: ConversationTurnRecord;
  state: ConversationState;
  replayed?: boolean;
};
