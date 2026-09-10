"use client";

import type { DashboardOverview } from "@interviewer-ai/types";
import { BriefcaseBusiness, Gauge, Mic2, Sparkles, TrendingUp } from "lucide-react";
import Link from "next/link";

type PreparationStateProps = {
  preparation: DashboardOverview["preparation"];
  recommendation: DashboardOverview["recommendation"];
  stats: DashboardOverview["stats"];
};

export function PreparationState({ preparation, recommendation, stats }: PreparationStateProps) {
  return (
    <section aria-label="Current preparation state" className="grid gap-4 sm:grid-cols-2">
      <article className="surface p-5">
        <p className="flex items-center gap-2 text-sm font-medium">
          <BriefcaseBusiness className="size-4 text-primary" aria-hidden="true" /> Current target
          job
        </p>
        {preparation.activeTarget ? (
          <>
            <p className="mt-2 truncate text-lg font-semibold">{preparation.activeTarget.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {preparation.activeTarget.company ?? "No company listed"}
              {preparation.activeTarget.location ? ` · ${preparation.activeTarget.location}` : ""}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href="/interviews/new"
                className="button-primary inline-flex h-9 items-center px-3 text-xs"
              >
                <Mic2 className="size-3.5" /> Continue preparation
              </Link>
              <Link
                href="/resumes"
                className="inline-block self-center text-sm font-medium text-primary"
              >
                Manage targets
              </Link>
            </div>
          </>
        ) : preparation.targetRole ? (
          <>
            <p className="mt-2 truncate text-lg font-semibold">{preparation.targetRole}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Your profile target role. Add a target job to make it your current focus.
            </p>
            <Link href="/resumes" className="mt-4 inline-block text-sm font-medium text-primary">
              Set a target job
            </Link>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-muted-foreground">
              No target job yet. Define the role you are preparing for so practice and future
              readiness tracking can focus on it.
            </p>
            <Link href="/resumes" className="mt-4 inline-block text-sm font-medium text-primary">
              Set a target job
            </Link>
          </>
        )}
      </article>

      <article className="surface p-5">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Gauge className="size-4 text-primary" aria-hidden="true" /> Interview readiness
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Readiness scores are not available yet. Complete scored interviews to build the
          performance history readiness will be calculated from.
        </p>
        <Link href="/interviews/new" className="mt-4 inline-block text-sm font-medium text-primary">
          Practice toward readiness
        </Link>
      </article>

      <article className="surface p-5">
        <p className="flex items-center gap-2 text-sm font-medium">
          <TrendingUp className="size-4 text-primary" aria-hidden="true" /> Recent performance
        </p>
        {stats.latestOverallScore !== null ? (
          <>
            <p className="mt-2 text-lg font-semibold">{stats.latestOverallScore} / 100</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Latest completed interview
              {stats.scoredReportCount > 1 ? ` · ${stats.scoredReportCount} scored so far` : ""}.
            </p>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            No scored interviews yet. Finish a simulation and its report will appear here.
          </p>
        )}
        <Link href="/history" className="mt-4 inline-block text-sm font-medium text-primary">
          View interview library
        </Link>
      </article>

      <article className="surface p-5">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="size-4 text-primary" aria-hidden="true" /> Recommended practice
        </p>
        <p className="mt-2 truncate text-lg font-semibold">{recommendation.suggestedTargetRole}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {recommendation.interviewType.replaceAll("_", " ").toLowerCase()} ·{" "}
          {recommendation.difficulty.toLowerCase()} · {recommendation.suggestedDurationMinutes} min
        </p>
        <Link
          href="/interviews/new"
          className="button-primary mt-4 inline-flex h-9 items-center px-3 text-xs"
        >
          <Mic2 className="size-3.5" /> Start this practice
        </Link>
      </article>
    </section>
  );
}
