/**
 * Phase 3: the live session director.
 *
 * The silence ladder lives in the conversation service, but only the live
 * voice session can make the interviewer *speak next*. In the server-owned
 * agent lane the gateway registers a director for its conversation; the
 * service asks that director to move the interview on, and the provider — which
 * already holds the plan, resume and memory in its think context — asks the
 * next planned question without a server-side LLM round trip.
 *
 * Registration is in-process, exactly like the silence timers and the TTS
 * cache it sits beside: one API process owns a live websocket session. The
 * registry is therefore a map, not a utility service, and Phase 4's
 * multi-instance work (Redis-backed session ownership) replaces it with a
 * routed command rather than changing this contract.
 */

export type MoveOnRequest = {
  interviewId: string;
  conversationId: string;
  /** Why the ladder escalated: the candidate stayed silent. */
  reason: "SILENCE";
};

export type ClosingRequest = {
  interviewId: string;
  conversationId: string;
  reason: "SILENCE" | "DURATION";
};

export type InterviewSessionDirector = {
  /**
   * True when the live session took ownership of the turn. False means the
   * caller must fall back to its own generation path (legacy lane).
   */
  requestMoveOn(request: MoveOnRequest): Promise<boolean>;
  /**
   * Asks the live interviewer to say goodbye and stop. The same ownership rule
   * applies: false means the caller appends the canned closing turn itself.
   */
  requestClosing(request: ClosingRequest): Promise<boolean>;
};

const directors = new Map<string, InterviewSessionDirector>();

/** Registers the director for one conversation; returns its disposer. */
export function registerSessionDirector(
  conversationId: string,
  director: InterviewSessionDirector,
): () => void {
  directors.set(conversationId, director);
  return () => {
    // Only the registration that still owns the slot may remove it: a
    // reconnecting session registers a new director before the old socket's
    // cleanup runs, and that cleanup must not unregister the live one.
    if (directors.get(conversationId) === director) directors.delete(conversationId);
  };
}

export function sessionDirectorFor(conversationId: string): InterviewSessionDirector | undefined {
  return directors.get(conversationId);
}
