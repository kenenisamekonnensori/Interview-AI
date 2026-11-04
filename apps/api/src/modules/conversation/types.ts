import type { ConversationState, ConversationTurnType } from "@interviewer-ai/types";

export type ConversationTurnRecord = {
  id: string;
  sequence: number;
  speaker: "USER" | "AI" | "SYSTEM";
  type: ConversationTurnType;
  text: string;
  startedAt?: Date | null | undefined;
  endedAt?: Date | null | undefined;
  durationMs?: number | null | undefined;
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
