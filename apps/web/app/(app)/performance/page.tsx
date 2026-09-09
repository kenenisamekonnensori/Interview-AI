"use client";

import type { PerformanceRangePreset, PerformanceSummary } from "@interviewer-ai/types";
import { CircleAlert, LoaderCircle, Mic2, TrendingDown, TrendingUp, Minus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { TrendChart } from "@/features/performance/components/trend-chart";
import { apiClient } from "@/lib/api-client";

const presets: Array<{ value: PerformanceRangePreset; label: string }> = [
  { value: "all", label: "All time" },
  { value: "90d", label: "Last 90 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "custom", label: "Custom" },
];

function dateInputToIso(value: string, endOfDay: boolean) {
  if (!value) return undefined;
  return endOfDay
    ? new Date(`${value}T23:59:59.999Z`).toISOString()
    : new Date(`${value}T00:00:00.000Z`).toISOString();
}

export default function PerformancePage() {
  const [preset, setPreset] = useState<PerformanceRangePreset>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const performance = useQuery({
    queryKey: ["analytics", "performance", preset, from, to],
    queryFn: () => {
      const params = new URLSearchParams({ range: preset });
      const fromIso = dateInputToIso(from, false);
      const toIso = dateInputToIso(to, true);
      if (fromIso) params.set("from", fromIso);
      if (toIso) params.set("to", toIso);
      return apiClient<{ performance: PerformanceSummary }>(
        `/api/v1/analytics/performance?${params.toString()}`,
      );
    },
  });

  if (performance.isPending) return <Loading />;
  if (performance.error) return <ErrorState onRetry={() => void performance.refetch()} />;

  const data = performance.data.performance;
  const hasScored = data.validReportCount > 0;

  return (
    <main className="noise min-h-[calc(100vh-5rem)] px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="eyebrow">Performance</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-.045em]">
              Performance intelligence
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
              How your interview scores change over time — calculated from your completed, scored
              interviews. No AI is used for these statistics.
            </p>
          </div>
          <RangePicker
            preset={preset}
            setPreset={setPreset}
            from={from}
            setFrom={setFrom}
            to={to}
            setTo={setTo}
          />
        </div>

        <section
          aria-label="Performance statistics"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          <StatCard
            label="Completed interviews"
            value={String(data.completedInterviewCount)}
            note={data.completedInterviewCount ? "In this range." : "No completions in this range."}
          />
          <StatCard
            label="Scored reports"
            value={String(data.validReportCount)}
            note="Completed with a valid report."
          />
          <StatCard
            label="Average score"
            value={data.averageOverallScore === null ? "—" : `${data.averageOverallScore} / 100`}
            note={
              data.validReportCount
                ? `Across ${data.validReportCount} scored interview${data.validReportCount === 1 ? "" : "s"}.`
                : "Scores appear once a report is ready."
            }
          />
          <StatCard
            label="Recent score"
            value={data.recentScore === null ? "—" : `${data.recentScore} / 100`}
            note={
              data.recentScore === null
                ? "No scored report yet."
                : "Your latest completed interview."
            }
          />
        </section>

        {!hasScored ? (
          <section className="surface p-6">
            <p className="font-semibold">Your performance trends will appear here</p>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              You need completed interviews before we can identify your performance trends. Finish a
              simulation and its scored report will power your averages, trend, and category
              breakdown.
            </p>
            <Link
              href="/interviews/new"
              className="button-primary mt-4 inline-flex h-10 px-3 text-sm"
            >
              <Mic2 className="size-4" /> Start an interview
            </Link>
          </section>
        ) : (
          <>
            <section aria-label="Latest interview comparison" className="surface p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Latest vs previous
                  </p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums">
                    {data.comparison.latestScore} / 100
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    How did your latest interview compare with previous interviews?
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Previous average</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">
                    {data.comparison.previousAverage === null
                      ? "—"
                      : `${data.comparison.previousAverage} / 100`}
                  </p>
                  <ChangeBadge change={data.comparison.change} />
                </div>
              </div>
            </section>

            <section aria-label="Score trend" className="surface p-5">
              <TrendChart series={data.series} />
            </section>

            <section aria-label="Performance by category" className="grid gap-4 sm:grid-cols-2">
              {data.categories.map((category) => (
                <CategoryCard key={category.key} category={category} categories={data.categories} />
              ))}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function RangePicker(props: {
  preset: PerformanceRangePreset;
  setPreset: (value: PerformanceRangePreset) => void;
  from: string;
  setFrom: (value: string) => void;
  to: string;
  setTo: (value: string) => void;
}) {
  return (
    <div className="flex flex-col items-end gap-2">
      <div
        className="flex rounded-xl border border-border bg-card/60 p-1"
        role="group"
        aria-label="Time range"
      >
        {presets.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => props.setPreset(value)}
            aria-pressed={props.preset === value}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              props.preset === value
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {props.preset === "custom" ? (
        <div className="flex items-center gap-2 text-sm">
          <label className="text-muted-foreground">From</label>
          <input
            type="date"
            value={props.from}
            onChange={(event) => props.setFrom(event.target.value)}
            className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
          />
          <label className="text-muted-foreground">To</label>
          <input
            type="date"
            value={props.to}
            onChange={(event) => props.setTo(event.target.value)}
            className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
          />
        </div>
      ) : null}
    </div>
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

function ChangeBadge({ change }: { change: number | null }) {
  if (change === null)
    return (
      <p className="mt-2 text-xs text-muted-foreground">Complete another interview to compare.</p>
    );
  if (change === 0)
    return (
      <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
        <Minus className="size-3" /> No change
      </p>
    );
  const up = change > 0;
  return (
    <p
      className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
        up ? "bg-emerald-300/15 text-emerald-300" : "bg-amber-300/15 text-amber-300"
      }`}
    >
      {up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
      {up ? "+" : ""}
      {change} pts
    </p>
  );
}

function CategoryCard({
  category,
  categories,
}: {
  category: PerformanceSummary["categories"][number];
  categories: PerformanceSummary["categories"];
}) {
  const scored = categories.filter((item) => item.average !== null);
  const strongest = scored.length
    ? scored.reduce((best, item) => (item.average! > best.average! ? item : best))
    : null;
  const weakest = scored.length
    ? scored.reduce((worst, item) => (item.average! < worst.average! ? item : worst))
    : null;
  const isStrongest = strongest?.key === category.key;
  const isWeakest = weakest?.key === category.key;
  return (
    <div className="surface p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{category.label}</p>
        {isStrongest ? (
          <span className="rounded-full bg-emerald-300/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
            Strongest
          </span>
        ) : null}
        {isWeakest ? (
          <span className="rounded-full bg-amber-300/15 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
            Needs work
          </span>
        ) : null}
      </div>
      <p className="mt-3 text-2xl font-semibold tabular-nums">
        {category.average === null ? "—" : `${category.average} / 100`}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {category.latest === null
          ? "No scored report yet."
          : `Latest: ${category.latest} / 100 · window average`}
      </p>
    </div>
  );
}

function Loading() {
  return (
    <main className="noise min-h-[calc(100vh-5rem)] px-5 py-8 sm:px-8 lg:px-10">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> Loading your
        performance…
      </div>
    </main>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="noise min-h-[calc(100vh-5rem)] px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-5xl rounded-2xl border border-border bg-card/60 p-5 text-sm text-muted-foreground">
        <CircleAlert className="size-4 text-amber-300" aria-hidden="true" />
        <p className="mt-2">Your performance data is unavailable right now.</p>
        <div className="mt-3 flex gap-4">
          <button
            type="button"
            onClick={onRetry}
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Try again
          </button>
          <Link href="/history" className="text-sm font-medium text-primary">
            View interview library
          </Link>
        </div>
      </div>
    </main>
  );
}
