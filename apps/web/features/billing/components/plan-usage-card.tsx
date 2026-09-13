"use client";

import type { BillingOverview } from "@interviewer-ai/types";
import { useQuery } from "@tanstack/react-query";
import { CreditCard, Sparkles } from "lucide-react";
import Link from "next/link";

import {
  formatResetDate,
  isAtLimit,
  planLabel,
  remainingSummary,
  subscriptionStatusLabel,
  usagePercent,
  usageResourceLabel,
  usageSummary,
} from "@/features/billing/lib/billing-helpers";
import { apiClient } from "@/lib/api-client";

/**
 * Compact plan and usage summary for the overview page.
 *
 * Billing failures are isolated by design: if the billing surface is
 * unavailable the card renders nothing rather than degrading the rest of the
 * dashboard. It shows the server-resolved plan and the metered usage as the
 * server reports them — never a client-side count.
 */
export function PlanUsageCard() {
  const overview = useQuery({
    queryKey: ["billing", "overview"],
    retry: false,
    // Billing must never break the dashboard, so a failure just hides the card.
    queryFn: () => apiClient<{ billing: BillingOverview }>("/api/v1/billing/overview"),
  });

  if (!overview.data) return null;

  const billing = overview.data.billing;
  const subscription = billing.subscription;
  const interviewUsage = billing.usage.find((usage) => usage.resource === "MOCK_INTERVIEW");
  const atLimit = interviewUsage ? isAtLimit(interviewUsage) : false;

  return (
    <section aria-label="Plan and usage" className="surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <CreditCard className="size-4 text-primary" aria-hidden="true" /> Plan
          </p>
          <p className="mt-2 text-lg font-semibold">
            {planLabel(billing.plan)}
            {subscription ? ` · ${subscriptionStatusLabel(subscription.status)}` : ""}
          </p>
          {interviewUsage ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {usageSummary(interviewUsage)}
              {interviewUsage.unlimited
                ? ""
                : ` · ${remainingSummary(interviewUsage)} · Resets ${formatResetDate(interviewUsage.periodEnd)}`}
            </p>
          ) : null}
        </div>
        <Link href="/subscription" className="text-sm font-medium text-primary">
          {billing.plan === "FREE" ? "See plans" : "Manage billing"}
        </Link>
      </div>

      {interviewUsage && !interviewUsage.unlimited ? (
        <div
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={usagePercent(interviewUsage)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${usageResourceLabel(interviewUsage.resource)} used`}
        >
          <div
            className={`h-full rounded-full ${atLimit ? "bg-amber-300" : "bg-primary"}`}
            style={{ width: `${usagePercent(interviewUsage)}%` }}
          />
        </div>
      ) : null}

      {atLimit ? (
        <div className="mt-4 rounded-2xl border border-amber-300/25 bg-amber-300/[.07] p-4">
          <p className="text-sm font-medium">You&rsquo;ve used this period&rsquo;s interviews</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Upgrade to Pro to keep practicing and unlock performance analytics, skills, and a
            personalized plan. Everything you have already completed stays on your account.
          </p>
          <Link
            href="/subscription"
            className="button-primary mt-3 inline-flex h-9 items-center gap-1.5 px-3 text-sm"
          >
            <Sparkles className="size-3.5" aria-hidden="true" /> Upgrade to Pro
          </Link>
        </div>
      ) : null}
    </section>
  );
}
