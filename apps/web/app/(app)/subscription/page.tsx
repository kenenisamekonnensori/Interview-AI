"use client";

import type {
  BillingIntervalValue,
  BillingOverview,
  BillingPlanOption,
  UsageStatus,
} from "@interviewer-ai/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, CreditCard, ExternalLink, LoaderCircle, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { apiClient } from "@/lib/api-client";
import {
  formatAmount,
  formatPeriod,
  formatResetDate,
  intervalLabel,
  isAtLimit,
  isBillingUnavailable,
  planLabel,
  remainingSummary,
  subscriptionStatusLabel,
  usagePercent,
  usageResourceLabel,
  usageSummary,
} from "@/features/billing/lib/billing-helpers";

const featureLabels: Record<string, string> = {
  PERFORMANCE_ANALYTICS: "Performance analytics & trends",
  SKILL_PROFILE: "Skills & weaknesses profile",
  PRACTICE_PLAN: "Personalized practice plan",
  ADVANCED_FEEDBACK: "Advanced AI feedback",
  READINESS_ASSESSMENT: "Job readiness score",
};

export default function SubscriptionPage() {
  const queryClient = useQueryClient();
  const params = useSearchParams();
  const [checkoutPlan, setCheckoutPlan] = useState<string | null>(null);
  const justReturned = params.get("checkout") === "complete";

  const overview = useQuery({
    queryKey: ["billing", "overview"],
    queryFn: () => apiClient<{ billing: BillingOverview }>("/api/v1/billing/overview"),
  });
  // Paddle redirects here after payment; the plan only changes once its webhook
  // is verified, so re-read the authoritative state instead of trusting the URL.
  useEffect(() => {
    if (justReturned) void queryClient.invalidateQueries({ queryKey: ["billing", "overview"] });
  }, [justReturned, queryClient]);

  const checkout = useMutation({
    mutationFn: (option: { plan: string; interval: BillingIntervalValue }) =>
      apiClient<{ checkout: { checkoutUrl: string } }>("/api/v1/billing/checkout", {
        method: "POST",
        body: option,
      }),
    onMutate: (option) => setCheckoutPlan(`${option.plan}-${option.interval}`),
    onSuccess: (result) => window.location.assign(result.checkout.checkoutUrl),
    onSettled: () => setCheckoutPlan(null),
  });
  const portal = useMutation({
    mutationFn: () =>
      apiClient<{ portal: { url: string } }>("/api/v1/billing/portal", { method: "POST" }),
    onSuccess: (result) => window.location.assign(result.portal.url),
  });

  if (overview.isPending) return <Loading />;
  if (overview.error)
    return <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />;

  const billing = overview.data.billing;
  const subscription = billing.subscription;
  const actionError = checkout.error ?? portal.error;

  return (
    <main className="noise min-h-[calc(100vh-5rem)] px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-5xl space-y-5">
        <div>
          <p className="eyebrow">Subscription</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-.045em]">Plan &amp; billing</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
            Your plan, what it includes, and how much of it you have used. Payments, invoices, and
            card details are handled entirely by Paddle — we never store payment details.
          </p>
        </div>

        {justReturned ? (
          <section className="rounded-2xl border border-emerald-300/25 bg-emerald-300/[.07] p-4 text-sm text-muted-foreground">
            Payment received. Your plan updates here as soon as Paddle confirms it — this usually
            takes a few seconds.
          </section>
        ) : null}

        <section aria-label="Current plan" className="surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <CreditCard className="size-4 text-primary" aria-hidden="true" /> Current plan
              </p>
              <p className="mt-2 text-2xl font-semibold tracking-[-.03em]">
                {planLabel(billing.plan)}
                {subscription ? ` · ${subscriptionStatusLabel(subscription.status)}` : ""}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {subscription
                  ? [
                      subscription.billingInterval
                        ? subscription.billingInterval === "YEAR"
                          ? "Billed yearly"
                          : "Billed monthly"
                        : null,
                      subscription.currentPeriodEnd
                        ? `Current period ends ${formatPeriod(subscription.currentPeriodEnd)}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  : "Free plan — no payment method on file."}
              </p>
              {subscription?.cancelAtPeriodEnd && subscription.accessUntil ? (
                <p className="mt-2 rounded-xl border border-amber-300/25 bg-amber-300/[.07] p-3 text-sm text-muted-foreground">
                  Your subscription is set to cancel. You keep your paid features until{" "}
                  {formatPeriod(subscription.accessUntil)}, then your account moves to the Free
                  plan. Nothing you have completed is deleted.
                </p>
              ) : null}
              {subscription?.status === "PAST_DUE" ? (
                <p className="mt-2 rounded-xl border border-amber-300/25 bg-amber-300/[.07] p-3 text-sm text-muted-foreground">
                  We could not take your latest payment. You keep access until{" "}
                  {formatPeriod(subscription.accessUntil)} — updating your payment method in the
                  billing portal resolves it.
                </p>
              ) : null}
            </div>
            {billing.canManageBilling ? (
              <button
                type="button"
                onClick={() => portal.mutate()}
                disabled={portal.isPending}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
              >
                {portal.isPending ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <ExternalLink className="size-4" />
                )}
                Manage billing
              </button>
            ) : null}
          </div>
        </section>

        <section aria-label="Usage" className="grid gap-4 sm:grid-cols-2">
          {billing.usage.map((usage) => (
            <div key={usage.resource} className="surface p-5">
              <p className="text-sm font-medium capitalize">{usageResourceLabel(usage.resource)}</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums">{usageSummary(usage)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {remainingSummary(usage)}
                {usage.unlimited ? "" : ` · Resets ${formatResetDate(usage.periodEnd)}`}
              </p>
              {usage.unlimited ? null : (
                <div
                  className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-valuenow={usagePercent(usage)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${usageResourceLabel(usage.resource)} used`}
                >
                  <div
                    className={`h-full rounded-full ${isAtLimit(usage) ? "bg-amber-300" : "bg-primary"}`}
                    style={{ width: `${usagePercent(usage)}%` }}
                  />
                </div>
              )}
            </div>
          ))}
          <div className="surface p-5">
            <p className="text-sm font-medium">Target jobs</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {billing.careerTargets.limit === null
                ? "Unlimited"
                : `${billing.careerTargets.active} / ${billing.careerTargets.limit} active`}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {billing.careerTargets.limit === null
                ? "Prepare for as many roles as you like."
                : "Archive a target to prepare for a different role."}
            </p>
          </div>
        </section>

        {actionError ? (
          <p className="rounded-2xl border border-amber-300/25 bg-amber-300/[.07] p-4 text-sm text-muted-foreground">
            {isBillingUnavailable(actionError)
              ? "Billing is not enabled on this deployment yet."
              : "We could not start that billing action. Please try again in a moment."}
          </p>
        ) : null}

        <section aria-label="Available plans" className="space-y-4">
          <h2 className="text-lg font-semibold">Available plans</h2>
          <div className="grid gap-4 lg:grid-cols-3">
            {billing.plans.map((option) => (
              <PlanCard
                key={`${option.plan}-${option.interval ?? "free"}`}
                option={option}
                currentPlan={billing.plan}
                checkoutPending={checkoutPlan === `${option.plan}-${option.interval}`}
                onChoose={() =>
                  option.interval
                    ? checkout.mutate({ plan: option.plan, interval: option.interval })
                    : undefined
                }
              />
            ))}
          </div>
        </section>

        <p className="text-sm text-muted-foreground">
          Questions about billing?{" "}
          <Link href="/contact" className="font-medium text-primary underline underline-offset-4">
            Contact support
          </Link>
          .
        </p>
      </div>
    </main>
  );
}

function PlanCard({
  option,
  currentPlan,
  checkoutPending,
  onChoose,
}: {
  option: BillingPlanOption;
  currentPlan: BillingOverview["plan"];
  checkoutPending: boolean;
  onChoose: () => void;
}) {
  const current = option.plan === currentPlan && (option.plan === "FREE" || option.purchasable);
  const features = Object.entries(option.entitlements.features)
    .filter(([, included]) => included)
    .map(([key]) => featureLabels[key] ?? key);
  const limits = (
    Object.entries(option.entitlements.limits) as Array<[UsageStatus["resource"], number | null]>
  ).map(([resource, limit]) =>
    limit === null
      ? `Unlimited ${usageResourceLabel(resource)}`
      : `${limit} ${usageResourceLabel(resource)} per period`,
  );
  return (
    <div className={`surface flex flex-col p-5 ${current ? "border-primary/40" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-lg font-semibold">{planLabel(option.plan)}</p>
        {current ? (
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">
            Current plan
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">
        {option.plan === "FREE" ? "Free" : formatAmount(option.amount, option.currency)}
        <span className="text-sm font-normal text-muted-foreground">
          {option.plan === "FREE" ? "" : intervalLabel(option.interval)}
        </span>
      </p>
      <ul className="mt-4 flex-1 space-y-1.5 text-sm text-muted-foreground">
        {[...limits, ...features].map((line) => (
          <li key={line}>· {line}</li>
        ))}
      </ul>
      {option.plan === "FREE" ? (
        <p className="mt-4 text-xs text-muted-foreground">
          {current
            ? "You are on the Free plan."
            : "Downgrades take effect at the end of your period."}
        </p>
      ) : option.purchasable ? (
        <button
          type="button"
          onClick={onChoose}
          disabled={checkoutPending}
          className="button-primary mt-4 inline-flex h-10 items-center justify-center gap-1.5 px-3 text-sm disabled:opacity-60"
        >
          {checkoutPending ? <LoaderCircle className="size-4 animate-spin" /> : null}
          {current ? "Change billing period" : "Upgrade to Pro"}
        </button>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">
          This plan is not available for purchase on this deployment yet.
        </p>
      )}
    </div>
  );
}

function Loading() {
  return (
    <main className="noise min-h-[calc(100vh-5rem)] px-5 py-8 sm:px-8 lg:px-10">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> Loading your billing
        details…
      </div>
    </main>
  );
}

function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <main className="noise min-h-[calc(100vh-5rem)] px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-5xl rounded-2xl border border-border bg-card/60 p-5 text-sm text-muted-foreground">
        <CircleAlert className="size-4 text-amber-300" aria-hidden="true" />
        <p className="mt-2">
          {isBillingUnavailable(error)
            ? "Billing is not enabled on this deployment yet. Every feature you can see is available in early access."
            : "Your billing details are unavailable right now."}
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          <RefreshCw className="size-3.5" /> Try again
        </button>
      </div>
    </main>
  );
}
