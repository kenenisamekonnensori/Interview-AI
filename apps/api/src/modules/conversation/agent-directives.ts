/**
 * Control directives for the server-owned agent lane.
 *
 * Deepgram's agent only speaks in response to a turn, so server-side decisions
 * that must be voiced (move on after silence, close at the duration limit) are
 * delivered as an injected user message carrying an explicit interviewer
 * instruction. The provider echoes that injected text back as a user
 * statement; {@link isInjectedUserEcho} is what keeps that control text out of
 * the candidate's transcript and memory.
 */

export type MoveOnDirectiveInput = {
  /** Topic of the question the candidate did not answer, when it maps to the plan. */
  unansweredTopic: string | null;
  askedQuestions: string[];
  remainingObjectives: string[];
};

export function buildAgentMoveOnDirective({
  unansweredTopic,
  askedQuestions,
  remainingObjectives,
}: MoveOnDirectiveInput): string {
  const parts = [
    "[Interviewer control message — not spoken by the candidate]",
    "The candidate has been silent through two gentle prompts and has not answered the last question.",
    "Do not repeat, rephrase or follow up on that question, and do not ask why they are quiet.",
    "Briefly acknowledge the pause in one short clause, then ask ONE new question on a different planned topic that has not been asked yet.",
  ];
  if (unansweredTopic) parts.push(`Move away from: ${unansweredTopic}.`);
  if (remainingObjectives.length > 0)
    parts.push(`Objectives still to cover: ${remainingObjectives.slice(0, 6).join("; ")}.`);
  if (askedQuestions.length > 0)
    parts.push(
      `Questions already asked, never repeat any of them: ${askedQuestions.slice(-8).join(" | ")}.`,
    );
  return parts.join("\n");
}

export type ResumeDirectiveInput = {
  /** The interviewer's last question, when it is still unanswered. */
  pendingQuestion: string | null;
  /** The candidate answered last and the interviewer owes them a response. */
  awaitingReplyToAnswer: boolean;
};

/**
 * A reconnecting (or reloaded) session has persisted history but the provider
 * will not speak on its own: it only answers a turn. This directive makes the
 * interviewer pick the interview back up in one short turn instead of sitting
 * in dead air until the candidate talks first.
 */
export function buildAgentResumeDirective({
  pendingQuestion,
  awaitingReplyToAnswer,
}: ResumeDirectiveInput): string {
  const parts = [
    "[Interviewer control message — not spoken by the candidate]",
    "The candidate's voice session just reconnected. Continue the interview from the conversation history; do not restart it and do not re-introduce yourself.",
  ];
  if (awaitingReplyToAnswer) {
    parts.push(
      "The candidate answered your previous question last. Acknowledge it in one short clause, then ask your next question.",
    );
  } else if (pendingQuestion) {
    parts.push(
      `Your last question, still unanswered, was: "${pendingQuestion}". Ask the candidate to answer it, in one short sentence.`,
    );
  } else {
    parts.push("Ask your next question in one short sentence.");
  }
  return parts.join("\n");
}

/**
 * The directive a reconnecting session needs. Null means "this is a fresh
 * session": the provider speaks its verbatim greeting instead, so no turn has
 * to be injected at all. Pure so the decision can be tested without a provider
 * or a database.
 *
 * `turns` is newest first, as the conversation repository returns it.
 */
export function resolveAgentResumeDirective({
  turns,
}: {
  turns: Array<{ speaker: string; type: string; text: string }>;
}): string | null {
  const aiTurnCount = turns.filter((turn) => turn.speaker === "AI").length;
  if (aiTurnCount === 0) return null;
  const newest = turns[0];
  const pendingQuestion =
    newest?.speaker === "AI" &&
    ["GREETING", "QUESTION", "FOLLOW_UP", "CLARIFICATION"].includes(newest.type)
      ? newest.text
      : null;
  return buildAgentResumeDirective({
    pendingQuestion,
    awaitingReplyToAnswer: newest?.speaker === "USER",
  });
}

export function buildAgentClosingDirective({ reason }: { reason: "DURATION" | "SILENCE" }): string {
  const parts = [
    "[Interviewer control message — not spoken by the candidate]",
    reason === "DURATION"
      ? "The interview has reached its scheduled duration limit."
      : "The candidate has stopped engaging and the interviewer is ending the session.",
    "Thank the candidate briefly for their time in one short sentence, say that their feedback will be ready shortly, and then stop speaking. Do not ask another question.",
  ];
  return parts.join("\n");
}

function normalize(value: string) {
  return value
    .toLocaleLowerCase()
    .replaceAll(/[^a-z0-9\s]/g, "")
    .replaceAll(/\s+/g, " ")
    .trim();
}

/**
 * True when a provider user statement is the echo of an injected control
 * message. Exact equality is not guaranteed (punctuation and line breaks are
 * provider-dependent), so a long shared prefix counts as the same message.
 * Real candidate speech never coincidentally matches a multi-sentence
 * instruction.
 */
export function isInjectedUserEcho(statement: string, injected: string): boolean {
  const said = normalize(statement);
  const source = normalize(injected);
  if (!said || !source) return false;
  if (said === source) return true;
  const prefix = source.slice(0, Math.min(48, source.length));
  return prefix.length >= 24 && said.startsWith(prefix);
}
