"use client";

import type { ReadinessAssessment } from "@interviewer-ai/types";
import {
  CircleAlert,
  Gauge,
  LoaderCircle,
  Mic2,
  Minus,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import { changeLabel } from "@/features/readiness/lib/readiness-helpers";

export default function ReadinessPage() {
  const readiness = useQuery({
    queryKey: ["analytics", "readiness"],
    queryFn: () => apiClient<{ readiness: ReadinessAssessment }>("/api/v1/analytics/readiness"),
  });

  if (readiness.isPending) return <Loading />;
  if (readiness.error) return <ErrorState onRetry={() => void readiness.refetch()} />;

  const data = readiness.data.readiness;
  const trend = changeLabel(data.change);

  return (
    <main className="noise min-h-[calc(100vh-5rem)] px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-5xl space-y-5">
        <div>
          <p className="eyebrow">Readiness</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-.045em]">Interview readiness</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
            A deterministic, evidence-based assessment for your target job — computed from your
            completed, scored interviews. No AI decides the score.
          </p>
        </div>

        <section aria-label="Overall readiness" className="surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="flex items-center gap-2 text-sm font-medium">
                <Target className="size-4 text-primary" aria-hidden="true" />
                {data.careerTarget
                  ? `Readiness for ${data.careerTarget.title}${data.careerTarget.company ? ` at ${data.careerTarget.company}` : ""}`
                  : "No target job selected"}
              </p>
              <p className="mt-3 text-5xl font-semibold tabular-nums">
                {data.overall === null ? "—" : `${data.overall}%`}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Formula v{data.formulaVersion} · {data.evidence.validReportCount} scored interview
                {data.evidence.validReportCount === 1 ? "" : "s"}
                {data.dataAsOf
                  ? ` · data as of ${new Date(data.dataAsOf).toLocaleDateString()}`
                  : ""}
              </p>
            </div>
            <div className="text-right">
              {trend ? (
                <>
                  <p className="text-xs text-muted-foreground">Since last snapshot</p>
                  <p className="mt-1 inline-flex items-center gap-1 text-lg font-semibold">
                    {data.change !== null && data.change !== 0 ? (
                      data.change > 0 ? (
                        <TrendingUp className="size-4 text-emerald-300" aria-hidden="true" />
                      ) : (
                        <TrendingDown className="size-4 text-amber-300" aria-hidden="true" />
                      )
                    ) : (
                      <Minus className="size-4" aria-hidden="true" />
                    )}
                    {trend}
                  </p>
                  {data.previousOverall !== null ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {data.previousOverall}% → {data.overall}%
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="max-w-48 text-xs text-muted-foreground">
                  Snapshots appear as new reports complete — finish interviews to track your trend.
                </p>
              )}
            </div>
          </div>
          {data.overall === null ? (
            <div className="mt-5 rounded-xl border border-border bg-card/60 p-4">
              <p className="text-sm font-medium">Not enough evidence yet</p>
              <p className="mt-1 text-sm text-muted-foreground">{data.explanation}</p>
              <Link
                href="/interviews/new"
                className="button-primary mt-3 inline-flex h-9 items-center px-3 text-xs"
              >
                <Mic2 className="size-3.5" /> Start an interview
              </Link>
            </div>
          ) : (
            <p className="mt-5 max-w-3xl text-sm leading-6 text-muted-foreground">
              {data.explanation}
            </p>
          )}
        </section>

        <section aria-label="Readiness breakdown" className="grid gap-4 sm:grid-cols-2">
          {data.components.map((component) => (
            <article key={component.category} className="surface p-5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">{component.label}</p>
                {component.score === null ? (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                    No evidence
                  </span>
                ) : null}
              </div>
              <p className="mt-3 text-2xl font-semibold tabular-nums">
                {component.score === null ? "—" : `${component.score}%`}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {component.evidenceCount
                  ? `${component.evidenceCount} scored observation${component.evidenceCount === 1 ? "" : "s"} · weight ${Math.round(component.weight * 100)}%`
                  : "Complete interviews covering this area to add evidence."}
              </p>
            </article>
          ))}
        </section>

        {data.strengths.length || data.gaps.length ? (
          <section aria-label="Strengths and gaps" className="grid gap-4 sm:grid-cols-2">
            {data.strengths.length ? (
              <article className="surface p-5">
                <p className="text-sm font-medium">Working in your favor</p>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                  {data.strengths.map((strength) => (
                    <li key={strength} className="flex gap-2">
                      <TrendingUp
                        className="mt-0.5 size-4 shrink-0 text-emerald-300"
                        aria-hidden="true"
                      />
                      {strength}
                    </li>
                  ))}
                </ul>
              </article>
            ) : null}
            {data.gaps.length ? (
              <article className="surface p-5">
                <p className="text-sm font-medium">Limiting your readiness</p>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                  {data.gaps.map((gap) => (
                    <li key={`${gap.kind}-${gap.label}`} className="flex gap-2">
                      <Gauge className="mt-0.5 size-4 shrink-0 text-amber-300" aria-hidden="true" />
                      <span>
                        <span className="font-medium text-foreground">{gap.label}</span> —{" "}
                        {gap.detail}
                      </span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/practice-plan"
                  className="mt-3 inline-block text-sm font-medium text-primary"
                >
                  Follow your practice plan
                </Link>
              </article>
            ) : null}
          </section>
        ) : null}

        {!data.careerTarget ? (
          <section className="surface p-5">
            <p className="text-sm font-medium">Make this readiness score job-specific</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Set a target job with a job description so the assessment can weigh the exact skills
              the role requires.
            </p>
            <Link href="/resumes" className="mt-3 inline-block text-sm font-medium text-primary">
              Set a target job
            </Link>
          </section>
        ) : null}
      </div>
    </main>
  );
}

function Loading() {
  return (
    <main className="noise min-h-[calc(100vh-5rem)] px-5 py-8 sm:px-8 lg:px-10">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> Loading your readiness…
      </div>
    </main>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="noise min-h-[calc(100vh-5rem)] px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-5xl rounded-2xl border border-border bg-card/60 p-5 text-sm text-muted-foreground">
        <CircleAlert className="size-4 text-amber-300" aria-hidden="true" />
        <p className="mt-2">Your readiness assessment is unavailable right now.</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
