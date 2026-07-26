"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, BarChart3, LoaderCircle } from "lucide-react";
import Link from "next/link";

import { apiClient } from "@/lib/api-client";

type HistoryItem = {
  id: string;
  status: string;
  interviewType: string;
  difficulty: string;
  targetRole: string | null;
  completedAt: string | null;
  reportStatus: string | null;
  overallScore: number | null;
};
type Summary = {
  validReportCount: number;
  comparisonNote: string;
  byInterviewType: Array<{
    interviewType: string;
    latestOverallScore: number;
    overallChange: number | null;
    improvingAreas: Array<{ name: string; change: number | null }>;
    recurringWeaknesses: Array<{ text: string; count: number }>;
  }>;
};

export function AnalyticsOverview({ limit = 8 }: { limit?: number }) {
  const history = useQuery({
    queryKey: ["analytics", "history", limit],
    queryFn: () =>
      apiClient<{ items: HistoryItem[] }>(`/api/v1/analytics/history?pageSize=${limit}`),
  });
  const summary = useQuery({
    queryKey: ["analytics", "summary"],
    queryFn: () => apiClient<Summary>("/api/v1/analytics/summary"),
  });
  if (history.isPending || summary.isPending)
    return (
      <div className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" /> Loading practice history…
      </div>
    );
  if (history.error || summary.error)
    return (
      <p className="p-5 text-sm text-muted-foreground">
        Your history is unavailable right now. Please try again.
      </p>
    );
  const latest = summary.data?.byInterviewType ?? [];
  const primary = latest[0];
  return (
    <div className="space-y-7">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Metric
          label="Valid reports"
          value={String(summary.data?.validReportCount ?? 0)}
          detail="Completed interviews with ready reports"
        />
        <Metric
          label="Latest scores"
          value={primary ? `${Math.round(primary.latestOverallScore)}/100` : "—"}
          detail={
            primary
              ? `${primary.interviewType.replaceAll("_", " ")} only`
              : "Complete an interview to begin"
          }
        />
        <Metric
          label="Trend policy"
          value="Scoped"
          detail="Never combines incompatible interview types"
        />
      </section>
      <p className="text-xs leading-5 text-muted-foreground">{summary.data?.comparisonNote}</p>
      <section className="grid gap-4 lg:grid-cols-2">
        {latest.map((item) => (
          <div className="rounded-2xl border border-border bg-card/50 p-5" key={item.interviewType}>
            <p className="text-sm font-semibold">{item.interviewType.replaceAll("_", " ")}</p>
            <p className="mt-2 text-2xl font-semibold">{Math.round(item.latestOverallScore)}/100</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {item.overallChange === null
                ? "Need another matching interview for a change"
                : `${item.overallChange >= 0 ? "+" : ""}${Math.round(item.overallChange)} points since prior session`}
            </p>
            {item.improvingAreas.length ? (
              <p className="mt-4 text-sm text-emerald-300">
                Improving:{" "}
                {item.improvingAreas.map((area) => area.name.replace(/([A-Z])/g, " $1")).join(", ")}
              </p>
            ) : null}
            {item.recurringWeaknesses.length ? (
              <p className="mt-2 text-sm text-amber-200">
                Recurring: {item.recurringWeaknesses.map((area) => area.text).join(", ")}
              </p>
            ) : null}
          </div>
        ))}
      </section>
      <section className="surface p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Interview history</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Planned, active, failed, and completed sessions.
            </p>
          </div>
          <BarChart3 className="size-5 text-primary" />
        </div>
        <div className="mt-4 divide-y divide-border">
          {history.data?.items.map((item) => (
            <Link
              className="flex items-center gap-3 py-4 first:pt-0"
              href={
                item.status === "COMPLETED"
                  ? `/interviews/${item.id}/report`
                  : `/interviews/${item.id}`
              }
              key={item.id}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {item.targetRole ?? "Practice interview"}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {item.interviewType.replaceAll("_", " ")} · {item.difficulty}
                </span>
              </span>
              {item.overallScore !== null ? (
                <span className="text-sm font-semibold">{Math.round(item.overallScore)}/100</span>
              ) : null}
              <span className="rounded-full bg-white/[.05] px-2 py-1 text-[10px] font-medium uppercase text-muted-foreground">
                {item.status.replaceAll("_", " ")}
              </span>
              <ArrowUpRight className="size-4 text-muted-foreground" />
            </Link>
          )) ?? <p className="py-6 text-sm text-muted-foreground">No interviews yet.</p>}
        </div>
      </section>
    </div>
  );
}
function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="surface p-5">
      <p className="text-2xl font-semibold tracking-[-.04em]">{value}</p>
      <p className="mt-1 text-sm font-medium">{label}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}
