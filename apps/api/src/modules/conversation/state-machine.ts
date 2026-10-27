import type { ConversationState, InterviewStatus } from "@interviewer-ai/types";

export class InvalidStateTransitionError extends Error {
  constructor(
    readonly machine: "interview" | "conversation",
    readonly from: string,
    readonly to: string,
  ) {
    super(`Invalid ${machine} transition: ${from} -> ${to}.`);
    this.name = "InvalidStateTransitionError";
  }
}

const interviewTransitions: Record<InterviewStatus, readonly InterviewStatus[]> = {
  DRAFT: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY", "CANCELLED", "FAILED"],
  READY: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETING", "FAILED"],
  COMPLETING: ["COMPLETED", "FAILED"],
  COMPLETED: [],
  CANCELLED: [],
  FAILED: [],
};

const conversationTransitions: Record<ConversationState, readonly ConversationState[]> = {
  GREETING: ["SPEAKING", "CLOSING"],
  // LISTENING -> SPEAKING is the backend-only canned nudge: when the candidate
  // stays silent after a question, the interviewer re-engages with a fixed
  // prompt line (never a fabricated answer), exactly like a human interviewer.
  LISTENING: ["TRANSCRIBING", "CLOSING", "SPEAKING"],
  TRANSCRIBING: ["THINKING", "CLOSING"],
  THINKING: ["SPEAKING", "CLOSING"],
  SPEAKING: ["LISTENING", "CLOSING"],
  CLOSING: ["COMPLETED"],
  COMPLETED: [],
};

export function assertInterviewTransition(from: InterviewStatus, to: InterviewStatus) {
  if (!interviewTransitions[from].includes(to)) {
    throw new InvalidStateTransitionError("interview", from, to);
  }
}

export function assertConversationTransition(from: ConversationState, to: ConversationState) {
  if (!conversationTransitions[from].includes(to)) {
    throw new InvalidStateTransitionError("conversation", from, to);
  }
}

export { conversationTransitions, interviewTransitions };
