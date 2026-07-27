import type { ConversationState } from "@interviewer-ai/types";

import type { ConversationResult, ConversationTurnRecord } from "./types.js";

export const pendingAiResponseRecovery = {
  transcriptSaved: true,
  conversationState: "THINKING",
  retryable: true,
  actions: {
    retry: true,
    continueByTyping: true,
    endInterview: true,
  },
} as const;

export function recoveryForAiResponseFailure(state: ConversationState) {
  return state === "THINKING" ? pendingAiResponseRecovery : null;
}

export function replayGeneratedResponse(
  state: ConversationState,
  turns: readonly ConversationTurnRecord[],
): ConversationResult | null {
  if (state !== "SPEAKING") return null;
  const turn = turns.find((candidate) => candidate.speaker === "AI");
  return turn ? { turn, state: "SPEAKING", replayed: true } : null;
}
