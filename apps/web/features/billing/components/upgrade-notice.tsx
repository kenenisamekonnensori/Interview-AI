"use client";

import type { UsageLimitErrorDetails } from "@interviewer-ai/types";
import { Lock, Sparkles } from "lucide-react";
import Link from "next/link";

import { formatResetDate, usageResourceLabel } from "@/features/billing/lib/billing-helpers";

const featureCopy: Record<string, { title: string; description: string }> = {
  PERFORMANCE_ANALYTICS: {
    title: "Performance analytics is part of Pro",
    description:
      "See how your scores change across interviews, how a session compares with your history, and where each category is trending.",
  },
  SKILL_PROFILE: {
    title: "Skills & weaknesses is part of Pro",
    description:
      "Pro turns your completed interviews into a skill profile with strengths, recurring weaknesses, and the evidence behind each assessment.",
  },
  PRACTICE_PLAN: {
    title: "Personalized practice plans are part of Pro",
    description:
      "Pro builds a prioritized plan from your target job, interview history, and skill profile — and keeps your progress as the plan updates.",
  },
  ADVANCED_FEEDBACK: {
    title: "Advanced AI feedback is part of Pro",
    description:
      "Pro runs the deeper cross-interview AI analysis that explains what your performance means and what to work on next.",
  },
  READINESS_ASSESSMENT: {
    title: "Readiness scoring is part of Pro",
    description:
      "Pro scores how prepared you are for a specific target job, with the evidence behind it.",
  },
};

const fallbackCopy = {
  title: "This is a Pro feature",
  description: "Upgrade to Pro to unlock the full interview preparation platform.",
};

/**
 * Shown when the API answers a plan boundary rather than an error. The server is
 * the authority: this component only explains the response and offers a path
 * forward, it never grants access.
 */
export function UpgradeNotice({ feature }: { feature: string }) {
  const copy = featureCopy[feature] ?? fallbackCopy;
  return (
    <section
      aria-label="Upgrade required"
      className="rounded-3xl border border-primary/30 bg-[radial-gradient(circle_at_100%_0%,oklch(0.7_0.16_280_/_14%),transparent_24rem)] p-6"
    >
      <p className="flex items-center gap-2 text-sm font-medium text-primary">
        <Lock className="size-4" aria-hidden="true" /> Pro feature
      </p>
      <h2 className="mt-3 text-xl font-semibold tracking-[-.02em]">{copy.title}</h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{copy.description}</p>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Link
          href="/subscription"
          className="button-primary inline-flex h-10 items-center gap-1.5 px-3 text-sm"
        >
          <Sparkles className="size-4" aria-hidden="true" /> See plans
        </Link>
        <Link
          href="/interviews/new"
          className="text-sm font-medium text-muted-foreground underline underline-offset-4"
        >
          Practice a free interview
        </Link>
      </div>
    </section>
  );
}

/**
 * Shown at the natural boundary — when an operation was refused because the
 * period's allowance is used up — with the real numbers and the reset date.
 */
export function LimitReachedNotice({
  details,
  onDismiss,
}: {
  details: UsageLimitErrorDetails;
  onDismiss?: () => void;
}) {
  const resource = usageResourceLabel(details.resource);
  return (
    <section
      aria-label="Plan limit reached"
      className="rounded-3xl border border-amber-300/25 bg-amber-300/[.07] p-6"
    >
      <h2 className="text-xl font-semibold tracking-[-.02em]">
        You&apos;ve used all {details.limit} of your {resource}
      </h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
        Your {details.plan === "FREE" ? "Free" : "current"} plan includes {details.limit}{" "}
        {details.limit === 1 ? resource.replace(/s$/, "") : resource} each period. Your allowance
        resets on {formatResetDate(details.periodEndsAt)}. Upgrade to Pro to keep practicing and
        unlock performance analysis, skills, and a personalized plan.
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        {details.upgradeAvailable ? (
          <Link
            href="/subscription"
            className="button-primary inline-flex h-10 items-center gap-1.5 px-3 text-sm"
          >
            <Sparkles className="size-4" aria-hidden="true" /> Upgrade to Pro
          </Link>
        ) : null}
        <Link
          href="/history"
          className="text-sm font-medium text-muted-foreground underline underline-offset-4"
        >
          Review past interviews
        </Link>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            className="text-sm font-medium text-muted-foreground underline underline-offset-4"
          >
            Dismiss
          </button>
        ) : null}
      </div>
    </section>
  );
}
