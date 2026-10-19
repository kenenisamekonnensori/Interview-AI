"use client";

import { FileText, Sparkles } from "lucide-react";

import { NudgeCard } from "@/features/nudges/components/nudge-card";
import { RESUME_SETUP_COPY, type ResumeSetupState } from "@/features/resumes/lib/resume-setup";

/**
 * Presentational resume-setup card with state-aware copy. All state (query
 * cache, dismissal, re-show policy) lives in `useResumeNudgeState`, so the
 * dashboard orchestrator can decide visibility without rendering this card.
 */
export function ResumeSetupCard({
  state,
  onDismiss,
}: {
  state: Exclude<ResumeSetupState, "ready">;
  onDismiss: () => void;
}) {
  const copy = RESUME_SETUP_COPY[state];

  return (
    <NudgeCard
      testId="resume-setup-nudge"
      eyebrow="Interview context"
      title={copy.title}
      description={copy.description}
      ctaHref="/resumes"
      ctaLabel={copy.ctaLabel}
      ctaIcon={<Sparkles className="size-4" aria-hidden="true" />}
      icon={<FileText className="size-5" aria-hidden="true" />}
      onDismiss={onDismiss}
      dismissLabel="Dismiss resume setup reminder"
    />
  );
}
