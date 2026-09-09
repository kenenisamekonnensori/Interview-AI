"use client";

import type { DashboardOverview } from "@interviewer-ai/types";
import { CircleAlert, LoaderCircle, Mic2, Play } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { PreparationState } from "@/features/dashboard/components/preparation-state";
import { apiClient } from "@/lib/api-client";
import { greetingForHour } from "@/lib/greeting";

const statusLabels: Record<string, string> = {
  DRAFT: "Draft",
  PREPARING: "Preparing",
  READY: "Ready to start",
  IN_PROGRESS: "In progress",
  COMPLETING: "Wrapping up",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  FAILED: "Failed",
};

function statusLabel(status: string) {
  return statusLabels[status] ?? status.replaceAll("_", " ").toLowerCase();
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function DashboardPage() {
  const overview = useQuery({
    queryKey: ["analytics", "overview"],
    queryFn: () => apiClient<{ overview: DashboardOverview }>("/api/v1/analytics/overview"),
  });
  // Shares the AppShell query cache, so no extra request is made.
  const profile = useQuery({
    queryKey: ["profile"],
    queryFn: () => apiClient<{ profile: { preferredName: string | null } }>("/api/v1/profile"),
  });
  // The greeting depends on the local clock; render it only after mount to
  // avoid a server/client hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const greeting = mounted ? greetingForHour(new Date().getHours()) : "Welcome back";
  const name = profile.data?.profile.preferredName?.trim();

  if (overview.isPending) return <Loading />;
  if (overview.error) return <ErrorState onRetry={() => void overview.refetch()} />;

  const data = overview.data.overview;
  const hasAnyInterview = data.recentInterviews.length > 0;

  return (
    <main className="noise min-h-[calc(100vh-5rem)] px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="eyebrow">Overview</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-.045em] sm:text-[2.55rem]">
              {greeting}
              {name ? `, ${name}` : ""}
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
              How you are doing, what to practice next, and how ready you are — built from your real
              interview history.
            </p>
          </div>
          <Link href="/interviews/new" className="button-primary h-11 px-4 text-sm">
            <Mic2 className="size-4" /> Start Interview
          </Link>
        </div>

        {data.activeInterview ? (
          <section className="rounded-3xl border border-emerald-300/25 bg-emerald-300/[.07] p-6">
            <p className="text-sm font-medium text-emerald-200">Continue where you left off</p>
            <h2 className="mt-2 text-xl font-semibold">
              {data.activeInterview.targetRole ?? "Practice interview"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              This session is {statusLabel(data.activeInterview.status).toLowerCase()}.
            </p>
            <Link
              href={`/interviews/${data.activeInterview.id}`}
              className="button-primary mt-4 inline-flex h-10 px-3 text-sm"
            >
              <Play className="size-4" />
              {data.activeInterview.status === "IN_PROGRESS"
                ? "Continue interview"
                : "Start interview"}
            </Link>
          </section>
        ) : null}

        <PreparationState
          preparation={data.preparation}
          recommendation={data.recommendation}
          stats={data.stats}
        />

        <section aria-label="Quick statistics" className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Interviews completed"
            value={String(data.stats.completedInterviews)}
            note={
              data.stats.completedInterviews
                ? "Across all interview types."
                : "Complete your first interview to start this count."
            }
          />
          <StatCard
            label="Completed this week"
            value={String(data.stats.interviewsThisWeek)}
            note="Counted from Monday."
          />
          <StatCard
            label="Average score"
            value={
              data.stats.averageOverallScore === null
                ? "—"
                : `${data.stats.averageOverallScore} / 100`
            }
            note={
              data.stats.scoredReportCount
                ? `Across your ${data.stats.scoredReportCount} most recent scored interview${data.stats.scoredReportCount === 1 ? "" : "s"}.`
                : "Scores appear once a completed report is ready."
            }
          />
        </section>

        <section aria-label="Recent interviews" className="surface p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">Recent interviews</h2>
            <Link href="/history" className="text-sm font-medium text-primary">
              View all
            </Link>
          </div>
          {hasAnyInterview ? (
            <ul className="mt-4 divide-y divide-white/[.06]">
              {data.recentInterviews.map((interview) => (
                <li key={interview.id}>
                  <Link
                    href={
                      interview.status === "COMPLETED"
                        ? `/interviews/${interview.id}/report`
                        : `/interviews/${interview.id}`
                    }
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 transition-colors hover:text-primary"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {interview.targetRole ?? "Practice interview"}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {interview.interviewType.replaceAll("_", " ").toLowerCase()} ·{" "}
                        {formatDate(interview.createdAt)}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {statusLabel(interview.status)}
                    </span>
                    <span className="w-14 text-right text-sm font-semibold tabular-nums">
                      {interview.overallScore === null ? "—" : `${interview.overallScore}`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-4 rounded-2xl border border-border bg-card/60 p-5 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">No interviews yet</p>
              <p className="mt-1">
                You haven&rsquo;t completed an interview yet. Start your first simulation to begin
                building your interview performance profile.
              </p>
              <Link
                href="/interviews/new"
                className="button-primary mt-4 inline-flex h-10 px-3 text-sm"
              >
                <Mic2 className="size-4" /> Start your first interview
              </Link>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function StatCard({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="surface p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

function Loading() {
  return (
    <main className="noise min-h-[calc(100vh-5rem)] px-5 py-8 sm:px-8 lg:px-10">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> Loading your overview…
      </div>
    </main>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="noise min-h-[calc(100vh-5rem)] px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-5xl rounded-2xl border border-border bg-card/60 p-5 text-sm text-muted-foreground">
        <CircleAlert className="size-4 text-amber-300" aria-hidden="true" />
        <p className="mt-2">
          Your overview is unavailable right now. You can still start a practice session.
        </p>
        <div className="mt-3 flex gap-4">
          <button
            type="button"
            onClick={onRetry}
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Try again
          </button>
          <Link href="/interviews/new" className="text-sm font-medium text-primary">
            Start a practice
          </Link>
        </div>
      </div>
    </main>
  );
}
