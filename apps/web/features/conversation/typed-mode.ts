import type { ConversationState } from "@interviewer-ai/types";

/** The client may offer a text composer only when the server can accept a finalized answer. */
export function canSubmitTypedAnswer(
  state: ConversationState | "IDLE" | "CONNECTING" | "RECONNECTING" | "ERROR",
  text: string,
  pending = false,
) {
  return state === "LISTENING" && text.trim().length > 0 && !pending;
}
