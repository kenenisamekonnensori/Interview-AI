"use client";

import type {
  ProfileNudgeDismissal,
  ProfileSnapshot,
} from "@/features/profile/lib/profile-completeness";
import { Check, Sparkles, UserRound, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  PROFILE_COMPLETENESS_FIELDS,
  clearProfileNudgeDismissal,
  missingProfileFields,
  profileCompletenessScore,
  profileNudgeKey,
  readProfileNudgeDismissal,
  shouldShowProfileNudge,
  writeProfileNudgeDismissal,
} from "@/features/profile/lib/profile-completeness";
import { apiClient } from "@/lib/api-client";

type ProfileResponse = { profile: ProfileSnapshot };

/**
 * A quiet, dismissible reminder for users whose profile is incomplete.
 *
 * UX contract:
 * - Appears only on the dashboard, below an active-interview card (never
 *   interrupting a session resumption).
 * - Makes only honest claims: the AI interviewer genuinely calibrates on
 *   targetRole, profession, seniority, and yearsOfExperience.
 * - Dismissing is always one click or one Escape away, is remembered against
 *   the exact set of missing fields, and re-surfaces at most once every
 *   PROFILE_NUDGE_RESHOW_DAYS — it can never nag daily.
 * - Non-modal: no focus stealing, no overlay, no scroll lock. Screen readers
 *   get one polite announcement via role="status".
 */
export function ProfileSetupNudge() {
  // Shares the AppShell ["profile"] query cache — no extra network request.
  const profile = useQuery({
    queryKey: ["profile"],
    queryFn: () => apiClient<ProfileResponse>("/api/v1/profile"),
  });

  // Storage is read after mount: SSR and the first client render agree on
  // "hidden", so a dismissed card never flashes on hydration.
  const [dismissal, setDismissal] = useState<ProfileNudgeDismissal | null>(null);
  const [ready, setReady] = useState(false);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    setDismissal(readProfileNudgeDismissal(window.localStorage));
    setReady(true);
  }, []);

  const value = profile.data?.profile;
  const missing = value ? missingProfileFields(value) : [];

  const visible =
    ready && value !== undefined && shouldShowProfileNudge({ missing, dismissal, now: Date.now() });

  // Gentle entrance; the transition is disabled under prefers-reduced-motion.
  useEffect(() => {
    if (!visible) return;
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, [visible]);

  const dismiss = useCallback(() => {
    if (missing.length === 0) return;
    const next: ProfileNudgeDismissal = {
      key: profileNudgeKey(missing),
      dismissedAt: Date.now(),
    };
    writeProfileNudgeDismissal(window.localStorage, next);
    setDismissal(next);
  }, [missing]);

  // Escape dismisses — the least effortful way to make the card go away
  // without ever trapping focus the way a modal would.
  useEffect(() => {
    if (!visible) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [visible, dismiss]);

  // Tidy stored state once there is nothing left to remind about.
  useEffect(() => {
    if (value && missing.length === 0) clearProfileNudgeDismissal(window.localStorage);
  }, [value, missing.length]);

  if (!visible || !value) return null;

  const score = profileCompletenessScore(value);
  const missingKeys = new Set(missing.map((field) => field.key));

  return (
    <section
      role="status"
      aria-labelledby="profile-nudge-title"
      className={`transition-[opacity,translate] duration-500 ease-out motion-reduce:transition-none ${
        entered ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
      }`}
    >
      <div className="relative overflow-hidden rounded-3xl border border-primary/25 bg-card/60 bg-[radial-gradient(circle_at_0%_0%,oklch(0.72_0.15_230_/_12%),transparent_22rem)] p-6">
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss profile setup reminder"
          className="absolute right-4 top-4 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-white/[.06] hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <X className="size-4" aria-hidden="true" />
        </button>

        <div className="flex items-start gap-4">
          <div className="grid size-10 shrink-0 place-items-center rounded-2xl border border-primary/30 bg-primary/10 text-primary">
            <UserRound className="size-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="eyebrow">Account setup</p>
            <h2 className="mt-2 text-xl font-semibold tracking-[-.02em]" id="profile-nudge-title">
              Finish setting up your profile
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              The AI interviewer calibrates question difficulty, probing depth, and tone to what it
              knows about you. A complete profile makes every practice session more realistic.
            </p>

            <div
              className="mt-4 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-border"
              role="progressbar"
              aria-valuenow={score.percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Profile completeness"
            >
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-500 motion-reduce:transition-none"
                style={{ width: `${score.percent}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {score.filled} of {score.total} details added
              {missing.length > 0 ? ` · ${missing.length} left` : ""}
            </p>

            <ul className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {PROFILE_COMPLETENESS_FIELDS.map((field) => {
                const done = !missingKeys.has(field.key);
                return (
                  <li key={field.key} className="flex items-start gap-2.5 text-sm">
                    {done ? (
                      <Check
                        className="mt-0.5 size-4 shrink-0 text-emerald-300"
                        aria-hidden="true"
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="mt-[.45rem] size-1.5 shrink-0 rounded-full bg-primary/70"
                      />
                    )}
                    <span className="min-w-0">
                      <span className={done ? "text-muted-foreground" : "font-medium"}>
                        {field.label}
                        <span className="sr-only">{done ? " — added" : " — missing"}</span>
                      </span>
                      {!done && (
                        <span className="block text-xs leading-5 text-muted-foreground">
                          {field.hint}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Link
                href="/profile"
                className="button-primary inline-flex h-10 items-center gap-1.5 px-3 text-sm"
              >
                <Sparkles className="size-4" aria-hidden="true" /> Complete your profile
              </Link>
              <button
                type="button"
                onClick={dismiss}
                className="text-sm font-medium text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
              >
                Maybe later
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
