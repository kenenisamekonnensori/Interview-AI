/**
 * Shared persistence + timing primitives for dismissible dashboard nudges.
 *
 * A nudge is a quiet reminder card (profile setup, resume setup, …). This
 * module deliberately knows nothing about any specific nudge's re-show
 * *policy* — each nudge decides what a dismissal means for it. Storage access
 * and the cooldown math are the only genuinely shared concerns.
 *
 * Deliberately pure: no React, no storage access at module scope, and every
 * storage call is guarded — private-mode browsers and quota errors must never
 * break the dashboard.
 */

/** One dismissal unit: when it happened. Nudges attach their own context. */
export type NudgeDismissal = {
  /** Epoch milliseconds of the dismissal. */
  dismissedAt: number;
};

export type PersistentStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whether a dismissal old enough to re-surface. Boundary-inclusive: a
 * `reshowDays`-old dismissal is exactly expired, so a nudge can never nag more
 * often than once per window.
 */
export function isNudgeDismissalExpired(
  dismissedAt: number,
  now: number,
  reshowDays: number,
): boolean {
  return now - dismissedAt >= reshowDays * DAY_MS;
}

/**
 * Reads and validates a stored dismissal. `isValid` guards against corrupted
 * or structurally wrong payloads (hand-edited storage, older schema, bugs):
 * anything questionable is treated as "no dismissal".
 */
export function readStoredNudge<T extends NudgeDismissal>(
  storage: PersistentStorage | undefined | null,
  storageKey: string,
  isValid: (value: unknown) => value is T,
): T | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isValid(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeStoredNudge<T extends NudgeDismissal>(
  storage: PersistentStorage | undefined | null,
  storageKey: string,
  dismissal: T,
): void {
  if (!storage) return;
  try {
    storage.setItem(storageKey, JSON.stringify(dismissal));
  } catch {
    // Storage unavailable (private mode, quota) — dismissal lives for the
    // session only, which is the correct degradation.
  }
}

/** Clear the stored dismissal once the nudge no longer applies (tidy state). */
export function clearStoredNudge(
  storage: PersistentStorage | undefined | null,
  storageKey: string,
): void {
  if (!storage) return;
  try {
    storage.removeItem(storageKey);
  } catch {
    // Same degradation as write.
  }
}

/** Shared validator piece: a finite epoch-milliseconds timestamp. */
export function isFiniteTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/* ─── Session-scoped flags (sessionStorage; tab-scoped by design) ──────────
 * The dashboard orchestrator uses a session flag so dismissing one setup
 * nudge does not immediately promote the next one in the same visit —
 * a dismissal silences setup nudges until the next visit.
 */

export function readSessionFlag(
  storage: Pick<Storage, "getItem"> | undefined | null,
  key: string,
): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function writeSessionFlag(
  storage: Pick<Storage, "setItem"> | undefined | null,
  key: string,
): void {
  if (!storage) return;
  try {
    storage.setItem(key, "1");
  } catch {
    // Storage unavailable — the session rule degrades to per-navigation;
    // persistent dismissals in localStorage still apply.
  }
}
