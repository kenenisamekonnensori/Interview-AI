/**
 * Resume-setup model for the dashboard nudge.
 *
 * Honest value claims, verified in the backend:
 * - The live AI interviewer is grounded in the active resume's extracted
 *   summary and skills (`resumeSummary` / `resumeSkills` in the conversation
 *   prompt), so questions reference real experience.
 * - The interview plan and evaluation use the same resume context.
 *
 * Only an *active* resume counts. Analysis status (`ANALYZING`/`ANALYZED`)
 * is intentionally not part of the nudge: a resume is usable for practice
 * the moment it exists, so the card must not nag someone whose analysis is
 * simply still running.
 */

import type { Resume } from "@interviewer-ai/types";

import {
  isFiniteTimestamp,
  isNudgeDismissalExpired,
  clearStoredNudge,
  readStoredNudge,
  writeStoredNudge,
  type PersistentStorage,
} from "@/features/nudges/lib/nudge-dismissal";

export const RESUME_NUDGE_STORAGE_KEY = "interviewer-ai:resume-nudge:v1";

/** Re-surface at most this often after a dismissal (days). */
export const RESUME_NUDGE_RESHOW_DAYS = 14;

/** The subset of the resume list this model evaluates. */
export type ResumeSignal = Pick<Resume, "isActive" | "status">[];

export type ResumeSetupState =
  /** No resume has ever been uploaded. */
  | "none"
  /** Resumes exist but none is active. */
  | "no-active"
  /** An active resume exists — nothing to remind about. */
  | "ready";

export function resumeSetupState(resumes: ResumeSignal | undefined): ResumeSetupState {
  if (!resumes || resumes.length === 0) return "none";
  return resumes.some((resume) => resume.isActive) ? "ready" : "no-active";
}

export type ResumeSetupCopy = {
  title: string;
  description: string;
  ctaLabel: string;
};

/** Copy per state; every claim maps to a real behavior described above. */
export const RESUME_SETUP_COPY: Record<Exclude<ResumeSetupState, "ready">, ResumeSetupCopy> = {
  none: {
    title: "Add your resume for sharper questions",
    description:
      "With an active resume, the AI interviewer asks about your real projects and experience instead of generic prompts — and your evaluations weigh what you have actually done.",
    ctaLabel: "Upload your resume",
  },
  "no-active": {
    title: "Set an active resume",
    description:
      "You have resumes on file, but none is active. The AI interviewer only grounds questions in your active resume — pick one so practice reflects your real experience.",
    ctaLabel: "Choose an active resume",
  },
};

/* ─── Dismissal persistence and re-show policy ──────────────────────────────
 * A dismissal is remembered against the state the user dismissed. If the
 * situation changes afterwards (e.g. resumes were uploaded but none set
 * active), the card may surface again immediately — it is a different
 * conversation. Otherwise it re-appears at most once per
 * RESUME_NUDGE_RESHOW_DAYS, so it can never nag daily.
 */

export type ResumeNudgeDismissal = {
  /** Which state the user dismissed; a change re-surfaces the card. */
  state: "none" | "no-active";
  /** Epoch milliseconds of the dismissal. */
  dismissedAt: number;
};

export function isResumeNudgeDismissal(value: unknown): value is ResumeNudgeDismissal {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<ResumeNudgeDismissal>;
  return (
    (candidate.state === "none" || candidate.state === "no-active") &&
    isFiniteTimestamp(candidate.dismissedAt)
  );
}

export function readResumeNudgeDismissal(
  storage: PersistentStorage | undefined | null,
): ResumeNudgeDismissal | null {
  return readStoredNudge(storage, RESUME_NUDGE_STORAGE_KEY, isResumeNudgeDismissal);
}

export function writeResumeNudgeDismissal(
  storage: PersistentStorage | undefined | null,
  dismissal: ResumeNudgeDismissal,
): void {
  writeStoredNudge(storage, RESUME_NUDGE_STORAGE_KEY, dismissal);
}

/** Clear the stored dismissal once an active resume exists (tidy state). */
export function clearResumeNudgeDismissal(storage: PersistentStorage | undefined | null): void {
  clearStoredNudge(storage, RESUME_NUDGE_STORAGE_KEY);
}

export type ResumeNudgeVisibilityInput = {
  resumes: ResumeSignal | undefined;
  dismissal: ResumeNudgeDismissal | null;
  now: number;
  reshowDays?: number;
};

/** The single source of truth for whether the reminder may render. */
export function shouldShowResumeNudge({
  resumes,
  dismissal,
  now,
  reshowDays = RESUME_NUDGE_RESHOW_DAYS,
}: ResumeNudgeVisibilityInput): boolean {
  const state = resumeSetupState(resumes);
  if (state === "ready") return false;
  if (!dismissal) return true;
  if (dismissal.state !== state) return true;
  return isNudgeDismissalExpired(dismissal.dismissedAt, now, reshowDays);
}
