"use client";

import type { PracticeItemStatus, PracticePlanDto } from "@interviewer-ai/types";
import { CircleAlert, LoaderCircle, Mic2, RefreshCw, Target } from "lucide-react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { UpgradeNotice } from "@/features/billing/components/upgrade-notice";
import { parseEntitlementError } from "@/features/billing/lib/billing-helpers";
import { PlanItemCard } from "@/features/practice-plan/components/plan-item-card";
import { groupByPhase, interviewTypeForActivity } from "@/features/practice-plan/lib/plan-helpers";
import { apiClient } from "@/lib/api-client";

export default function PracticePlanPage() {
  const queryClient = useQueryClient();
  const plan = useQuery({
    queryKey: ["practice-plan"],
    // A plan boundary is a definitive answer, not something to retry.
    retry: (failureCount, error) => !parseEntitlementError(error) && failureCount < 2,
    queryFn: () => apiClient<{ plan: PracticePlanDto }>("/api/v1/practice-plan"),
  });
  const toggle = useMutation({
    mutationFn: ({ id, status }: { id: string; status: PracticeItemStatus }) =>
      apiClient<{ item: unknown }>(`/api/v1/practice-plan/items/${id}`, {
        method: "PATCH",
        body: { status },
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["practice-plan"] }),
  });
  const regenerate = useMutation({
    mutationFn: () =>
      apiClient<{ plan: PracticePlanDto }>("/api/v1/practice-plan/regenerate", {
        method: "POST",
      }),
    onSuccess: (result) =>
      queryClient.setQueryData(["practice-plan"], result, {
        updatedAt: Date.now(),
      }),
  });

  if (plan.isPending) return <Loading />;
  if (plan.error) {
    const entitlement = parseEntitlementError(plan.error);
    if (entitlement)
      return (
        <main className="noise min-h-[calc(100vh-5rem)] px-5 py-8 sm:px-8 lg:px-10">
          <div className="mx-auto max-w-5xl space-y-5">
            <div>
              <p className="eyebrow">Practice Plan</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-.045em]">Your practice plan</h1>
            </div>
            <UpgradeNotice feature={entitlement.feature} />
          </div>
        </main>
      );
    return <ErrorState onRetry={() => void plan.refetch()} />;
  }

  const data = plan.data.plan;
  const groups = groupByPhase(data.items);
  const actionError = toggle.error ?? regenerate.error;
  const percent =
    data.progress.total > 0 ? Math.round((data.progress.completed / data.progress.total) * 100) : 0;

  return (
    <main className="noise min-h-[calc(100vh-5rem)] px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Practice Plan</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-.045em]">Your practice plan</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
              A prioritized plan built from your target job, interview history, and skill profile.
              Recommendations come from your real data, and completed items are never lost when the
              plan updates.
            </p>
          </div>
          <button
            type="button"
            onClick={() => regenerate.mutate()}
            disabled={regenerate.isPending}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
          >
            <RefreshCw className={`size-4 ${regenerate.isPending ? "animate-spin" : ""}`} />
            Update plan
          </button>
        </div>

        {actionError ? (
          <p className="rounded-2xl border border-amber-300/25 bg-amber-300/[.07] p-4 text-sm text-muted-foreground">
            {parseEntitlementError(actionError)
              ? "Your plan needs an active Pro entitlement to update. Your existing plan and progress are unchanged."
              : "We could not update your plan just now. Your existing plan and progress are unchanged."}
          </p>
        ) : null}

        <section aria-label="Current goal" className="surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Target className="size-4 text-primary" aria-hidden="true" /> Current goal
              </p>
              <p className="mt-2 text-2xl font-semibold tracking-[-.03em]">{data.goal}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {data.targetRole ? `Target: ${data.targetRole}` : "No target job set yet."} ·
                Updated {formatDate(data.generatedAt)} · v{data.version}
              </p>
            </div>
            {regenerate.isPending ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin" /> Updating…
              </p>
            ) : null}
          </div>
        </section>

        <section aria-label="Plan progress" className="surface p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Progress</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {data.progress.completed} / {data.progress.total} activities completed · about{" "}
                {data.progress.estimatedMinutesTotal} minutes of practice in total
              </p>
            </div>
            <p className="text-2xl font-semibold tabular-nums">{percent}%</p>
          </div>
          <div
            className="mt-4 h-2 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Plan progress"
          >
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${percent}%` }}
            />
          </div>
        </section>

        {data.nextActivity ? (
          <section
            aria-label="Recommended next activity"
            className="rounded-3xl border border-primary/30 bg-[radial-gradient(circle_at_100%_0%,oklch(0.7_0.16_280_/_18%),transparent_26rem)] p-6 shadow-xl shadow-black/10"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-primary">
              Recommended next
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
              <div className="max-w-2xl">
                <p className="text-xl font-semibold tracking-[-.02em]">{data.nextActivity.title}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {data.nextActivity.rationale}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/interviews/new?type=${interviewTypeForActivity(data.nextActivity.activityType)}`}
                  className="button-primary inline-flex h-10 items-center gap-1.5 px-3 text-sm"
                >
                  <Mic2 className="size-4" /> Start activity
                </Link>
                <button
                  type="button"
                  onClick={() => toggle.mutate({ id: data.nextActivity!.id, status: "COMPLETED" })}
                  disabled={toggle.isPending}
                  className="inline-flex h-10 items-center rounded-xl border border-border px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
                >
                  Mark complete
                </button>
              </div>
            </div>
          </section>
        ) : (
          <section className="surface p-6">
            <p className="font-semibold">All caught up</p>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              You have completed every activity in this plan. Update the plan or start a new
              interview to keep building your preparation.
            </p>
          </section>
        )}

        {data.basedOnValidReportCount === 0 ? (
          <p className="text-sm leading-6 text-muted-foreground">
            This plan was built from your saved profile. Complete a few interviews and it will be
            sharpened from your actual performance.
          </p>
        ) : null}

        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.phase} aria-label={group.phase}>
              <h2 className="text-lg font-semibold">{group.phase}</h2>
              <div className="mt-3 space-y-3">
                {group.items.map((item) => (
                  <PlanItemCard
                    key={item.id}
                    item={item}
                    pending={toggle.isPending}
                    onToggle={() =>
                      toggle.mutate({
                        id: item.id,
                        status: item.status === "COMPLETED" ? "PENDING" : "COMPLETED",
                      })
                    }
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}

function formatDate(iso: string | null) {
  if (!iso) return "recently";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function Loading() {
  return (
    <main className="noise min-h-[calc(100vh-5rem)] px-5 py-8 sm:px-8 lg:px-10">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> Preparing your plan…
      </div>
    </main>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="noise min-h-[calc(100vh-5rem)] px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-5xl rounded-2xl border border-border bg-card/60 p-5 text-sm text-muted-foreground">
        <CircleAlert className="size-4 text-amber-300" aria-hidden="true" />
        <p className="mt-2">Your practice plan is unavailable right now.</p>
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
