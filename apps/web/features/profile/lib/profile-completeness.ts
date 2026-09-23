/**
 * Profile-completeness model for the dashboard setup nudge.
 *
 * Deliberately pure: no React, no storage access at module scope. The component
 * supplies `now` and a storage implementation, so the policy is trivially
 * unit-testable and safe to import from server components.
 *
 * Storage mechanics (guarded localStorage access, cooldown math) live in the
 * shared `features/nudges` helper; this module keeps the profile-specific
 * model and re-show *policy*.
 *
 * Only fields the product actually consumes are tracked. Evidence:
 * - `targetRole` calibrates the live AI interviewer prompt.
 * - `profession`, `seniority`, `yearsOfExperience` ground question depth and
 *   the candidate profile used by evaluation.
 * - `preferredName` personalizes the dashboard and session address.
 */

import {
  isFiniteTimestamp,
  isNudgeDismissalExpired,
  clearStoredNudge,
  readStoredNudge,
  writeStoredNudge,
  type PersistentStorage,
} from "@/features/nudges/lib/nudge-dismissal";

export type ProfileCompletenessKey =
  "preferredName" | "profession" | "targetRole" | "seniority" | "yearsOfExperience";

export type ProfileCompletenessField = {
  key: ProfileCompletenessKey;
  /** Human-readable fragment, e.g. "target role". */
  label: string;
  /** One-line value proposition shown as checklist micro-copy. */
  hint: string;
};

export const PROFILE_COMPLETENESS_FIELDS: readonly ProfileCompletenessField[] = [
  {
    key: "targetRole",
    label: "target role",
    hint: "Calibrates the AI interviewer to the job you're practicing for.",
  },
  {
    key: "profession",
    label: "profession",
    hint: "Grounds questions in your day-to-day work.",
  },
  {
    key: "seniority",
    label: "seniority",
    hint: "Sets how deep the interviewer probes.",
  },
  {
    key: "yearsOfExperience",
    label: "years of experience",
    hint: "Anchors difficulty from the very first question.",
  },
  {
    key: "preferredName",
    label: "preferred name",
    hint: "So the interview opens the way a real one would.",
  },
];

/** The subset of the user profile this model evaluates. */
export type ProfileSnapshot = {
  preferredName: string | null;
  profession: string | null;
  targetRole: string | null;
  seniority: string | null;
  yearsOfExperience: number | null;
};

function hasValue(value: string | number | null | undefined): boolean {
  if (value === null || value === undefined) return false;
  return String(value).trim() !== "";
}

/** Fields with no usable value, ordered by product impact (see fields list). */
export function missingProfileFields(profile: ProfileSnapshot): ProfileCompletenessField[] {
  return PROFILE_COMPLETENESS_FIELDS.filter((field) => !hasValue(profile[field.key]));
}

export type ProfileCompletenessScore = {
  filled: number;
  total: number;
  percent: number;
};

export function profileCompletenessScore(profile: ProfileSnapshot): ProfileCompletenessScore {
  const total = PROFILE_COMPLETENESS_FIELDS.length;
  const filled = total - missingProfileFields(profile).length;
  return { filled, total, percent: Math.round((filled / total) * 100) };
}

/* ─── Dismissal persistence and re-show policy ──────────────────────────────
 * A dismissal is remembered against the exact set of missing fields. Once the
 * user completes a field (or adds a new one), the key changes and the reminder
 * may surface again — at most once per PROFILE_NUDGE_RESHOW_DAYS for an
 * unchanged key, so it can never nag daily.
 */

export const PROFILE_NUDGE_STORAGE_KEY = "interviewer-ai:profile-nudge:v1";
export const PROFILE_NUDGE_RESHOW_DAYS = 14;

export type ProfileNudgeDismissal = {
  /** Sorted missing-field keys this dismissal applies to. */
  key: string;
  /** Epoch milliseconds of the dismissal. */
  dismissedAt: number;
};

/** Stable key for a set of missing fields; order-independent. */
export function profileNudgeKey(missing: ProfileCompletenessField[]): string {
  return missing
    .map((field) => field.key)
    .sort()
    .join("+");
}

export function isDismissalExpired(
  dismissal: ProfileNudgeDismissal,
  now: number,
  reshowDays: number = PROFILE_NUDGE_RESHOW_DAYS,
): boolean {
  return isNudgeDismissalExpired(dismissal.dismissedAt, now, reshowDays);
}

export type ProfileNudgeVisibilityInput = {
  missing: ProfileCompletenessField[];
  dismissal: ProfileNudgeDismissal | null;
  now: number;
  reshowDays?: number;
};

/** The single source of truth for whether the reminder may render. */
export function shouldShowProfileNudge({
  missing,
  dismissal,
  now,
  reshowDays,
}: ProfileNudgeVisibilityInput): boolean {
  if (missing.length === 0) return false;
  if (!dismissal) return true;
  if (dismissal.key !== profileNudgeKey(missing)) return true;
  return isDismissalExpired(dismissal, now, reshowDays);
}

/**
 * Storage is injected so tests can pass a stub; production passes
 * `window.localStorage`. Validation and guarding live in the shared helper.
 */
export type { PersistentStorage } from "@/features/nudges/lib/nudge-dismissal";

export function readProfileNudgeDismissal(
  storage: PersistentStorage | undefined | null,
): ProfileNudgeDismissal | null {
  return readStoredNudge(storage, PROFILE_NUDGE_STORAGE_KEY, isProfileNudgeDismissal);
}

export function writeProfileNudgeDismissal(
  storage: PersistentStorage | undefined | null,
  dismissal: ProfileNudgeDismissal,
): void {
  writeStoredNudge(storage, PROFILE_NUDGE_STORAGE_KEY, dismissal);
}

/** Clear the stored dismissal once the profile is complete (tidy state). */
export function clearProfileNudgeDismissal(storage: PersistentStorage | undefined | null): void {
  clearStoredNudge(storage, PROFILE_NUDGE_STORAGE_KEY);
}

function isProfileNudgeDismissal(value: unknown): value is ProfileNudgeDismissal {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ProfileNudgeDismissal).key === "string" &&
    isFiniteTimestamp((value as ProfileNudgeDismissal).dismissedAt)
  );
}
