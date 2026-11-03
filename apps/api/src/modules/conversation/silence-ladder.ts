/**
 * Phase 3 turn-taking: the backend silence ladder.
 *
 * A human interviewer never leaves dead air and never loops forever. This
 * module owns that policy in one place: two canned nudges (instant, no LLM),
 * then a move-on turn that changes topic, then — once the per-interview budget
 * is spent — a graceful close.
 *
 * The ladder is transport-agnostic: `onStage` is supplied by the conversation
 * service, so the same timings and budget are enforced for the legacy and the
 * server-owned agent lanes. Timers are injectable, which is what makes the
 * failure scenarios (silent candidate, post-answer dead air, false start)
 * scriptable in tests with fake time.
 */

export type SilenceStage =
  { kind: "NUDGE"; strike: number } | { kind: "MOVE_ON" } | { kind: "CLOSE" };

export type SilenceLadderPolicy = {
  /** Canned re-engagement lines per listening period. */
  maxNudges: number;
  /** Topic changes allowed across the whole interview before closing. */
  maxMoveOns: number;
};

/**
 * Which ladder stage the next silence produces, or null when the ladder has
 * nothing left to do (defensive: the service closes at the last stage).
 */
export function resolveSilenceStage({
  strikes,
  moveOns,
  maxNudges,
  maxMoveOns,
}: SilenceLadderPolicy & { strikes: number; moveOns: number }): SilenceStage | null {
  if (strikes < 1) return null;
  if (strikes <= maxNudges) return { kind: "NUDGE", strike: strikes };
  if (strikes !== maxNudges + 1) return null;
  return { kind: moveOns < maxMoveOns ? "MOVE_ON" : "CLOSE" };
}

type TimerHandle = ReturnType<typeof setTimeout>;

export type SilenceLadderOptions = SilenceLadderPolicy & {
  /** Idle time before the first re-engagement. */
  nudgeDelayMs: number;
  /** Speech was detected but produced no finalized turn: wait longer. */
  speechPendingDelayMs: number;
  onStage: (key: string, stage: SilenceStage) => void | Promise<void>;
  onError?: (key: string, error: unknown) => void;
  /** Timers are injectable so scenarios can be scripted with fake time. */
  setTimer?: (callback: () => void, delayMs: number) => TimerHandle;
  clearTimer?: (handle: TimerHandle) => void;
};

/** Per-conversation silence state machine. */
export class SilenceLadder {
  private readonly timers = new Map<string, TimerHandle>();
  private readonly strikes = new Map<string, number>();
  private readonly moveOns = new Map<string, number>();

  constructor(private readonly options: SilenceLadderOptions) {}

  /** Starts (or restarts) the idle timer for one listening period. */
  arm(key: string, delayMs = this.options.nudgeDelayMs) {
    this.cancel(key);
    const setTimer = this.options.setTimer ?? setTimeout;
    const timer = setTimer(() => {
      this.timers.delete(key);
      void this.fire(key);
    }, delayMs);
    // A pending nudge must never keep the process alive on shutdown.
    (timer as { unref?: () => void }).unref?.();
    this.timers.set(key, timer);
  }

  /** Cancels the pending stage (speech detected, answer, completion). */
  cancel(key: string) {
    const timer = this.timers.get(key);
    if (!timer) return;
    (this.options.clearTimer ?? clearTimeout)(timer);
    this.timers.delete(key);
  }

  /** A fresh question opened a new listening period: nudge budget resets. */
  resetQuestion(key: string) {
    this.strikes.delete(key);
  }

  /** The interview is over for this conversation. */
  forget(key: string) {
    this.cancel(key);
    this.strikes.delete(key);
    this.moveOns.delete(key);
  }

  dispose() {
    for (const timer of this.timers.values()) {
      (this.options.clearTimer ?? clearTimeout)(timer);
    }
    this.timers.clear();
    this.strikes.clear();
    this.moveOns.clear();
  }

  /** Observability/test seam: current ladder position for a conversation. */
  snapshot(key: string) {
    return {
      armed: this.timers.has(key),
      strikes: this.strikes.get(key) ?? 0,
      moveOns: this.moveOns.get(key) ?? 0,
    };
  }

  private async fire(key: string) {
    const strikes = (this.strikes.get(key) ?? 0) + 1;
    const stage = resolveSilenceStage({
      strikes,
      moveOns: this.moveOns.get(key) ?? 0,
      maxNudges: this.options.maxNudges,
      maxMoveOns: this.options.maxMoveOns,
    });
    if (!stage) {
      this.strikes.delete(key);
      return;
    }
    this.strikes.set(key, strikes);
    if (stage.kind === "MOVE_ON") this.moveOns.set(key, (this.moveOns.get(key) ?? 0) + 1);
    try {
      await this.options.onStage(key, stage);
    } catch (error) {
      // The stage handler owns user-visible recovery; the ladder must stay
      // armed-able for the rest of the interview.
      this.options.onError?.(key, error);
    }
  }
}
