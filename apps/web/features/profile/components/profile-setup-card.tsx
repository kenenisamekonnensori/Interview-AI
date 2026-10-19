"use client";

import type { ProfileCompletenessField } from "@/features/profile/lib/profile-completeness";
import { Check, Sparkles, UserRound } from "lucide-react";

import { NudgeCard } from "@/features/nudges/components/nudge-card";

type ProfileCompletenessScore = {
  filled: number;
  total: number;
  percent: number;
};

/**
 * Presentational profile-setup card. All state (query cache, dismissal,
 * re-show policy) lives in `useProfileNudgeState`, so the dashboard
 * orchestrator can decide visibility without rendering this card.
 */
export function ProfileSetupCard({
  missing,
  score,
  fields,
  onDismiss,
}: {
  missing: ProfileCompletenessField[];
  score: ProfileCompletenessScore;
  fields: readonly ProfileCompletenessField[];
  onDismiss: () => void;
}) {
  const missingKeys = new Set(missing.map((field) => field.key));

  return (
    <NudgeCard
      testId="profile-setup-nudge"
      eyebrow="Account setup"
      title="Finish setting up your profile"
      description="The AI interviewer calibrates question difficulty, probing depth, and tone to what it knows about you. A complete profile makes every practice session more realistic."
      ctaHref="/profile"
      ctaLabel="Complete your profile"
      ctaIcon={<Sparkles className="size-4" aria-hidden="true" />}
      icon={<UserRound className="size-5" aria-hidden="true" />}
      onDismiss={onDismiss}
      dismissLabel="Dismiss profile setup reminder"
    >
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
        {fields.map((field) => {
          const done = !missingKeys.has(field.key);
          return (
            <li key={field.key} className="flex items-start gap-2.5 text-sm">
              {done ? (
                <Check className="mt-0.5 size-4 shrink-0 text-emerald-300" aria-hidden="true" />
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
    </NudgeCard>
  );
}
