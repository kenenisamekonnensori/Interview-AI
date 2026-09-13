import {
  entitlementErrorDetailsSchema,
  usageLimitErrorDetailsSchema,
  type BillingPlanId,
  type BillingPlanOption,
  type SubscriptionStatusValue,
  type UsageLimitErrorDetails,
  type UsageStatus,
} from "@interviewer-ai/types";

import { ApiError, isApiError } from "@/lib/api-client";

const planLabels: Record<BillingPlanId, string> = {
  FREE: "Free",
  PRO: "Pro",
};

export function planLabel(plan: BillingPlanId): string {
  return planLabels[plan] ?? plan;
}

const statusLabels: Record<SubscriptionStatusValue, string> = {
  TRIALING: "Free trial",
  ACTIVE: "Active",
  PAST_DUE: "Payment past due",
  PAUSED: "Paused",
  CANCELED: "Canceled",
};

export function subscriptionStatusLabel(status: SubscriptionStatusValue): string {
  return statusLabels[status] ?? status;
}

const resourceLabels = {
  MOCK_INTERVIEW: "practice interviews",
  AI_ANALYSIS: "AI analyses",
} as const;

export function usageResourceLabel(resource: UsageStatus["resource"]): string {
  return resourceLabels[resource] ?? resource;
}

const currencyFormatters = new Map<string, Intl.NumberFormat>();

/** Formats a minor-unit amount (Paddle/src amounts are in cents). */
export function formatAmount(amount: number | null, currency: string): string {
  if (amount === null) return "Custom";
  let formatter = currencyFormatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    });
    currencyFormatters.set(currency, formatter);
  }
  return formatter.format(amount / 100);
}

/**
 * The exact wording for a usage allowance. Unlimited is shown as "Unlimited",
 * never as a large fraction of a made-up maximum.
 */
export function usageSummary(usage: UsageStatus): string {
  if (usage.unlimited) return "Unlimited";
  const limit = usage.limit ?? 0;
  return `${usage.used} / ${limit} ${usageResourceLabel(usage.resource)} used`;
}

export function remainingSummary(usage: UsageStatus): string {
  if (usage.unlimited || usage.remaining === null) return "Unlimited";
  if (usage.remaining === 0) return "No uses left this period";
  return `${usage.remaining} ${usage.remaining === 1 ? "use" : "uses"} left`;
}

export function usagePercent(usage: UsageStatus): number {
  if (usage.unlimited || !usage.limit) return 0;
  return Math.min(100, Math.round((usage.used / usage.limit) * 100));
}

export function isAtLimit(usage: UsageStatus): boolean {
  return !usage.unlimited && usage.remaining === 0;
}

export function formatResetDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function formatPeriod(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Reads the structured upgrade payload from a plan-limit response. */
export function parseUsageLimitError(error: unknown): UsageLimitErrorDetails | null {
  if (!isApiError(error) || !isRecord(error.details)) return null;
  const parsed = usageLimitErrorDetailsSchema.safeParse(error.details);
  return parsed.success ? parsed.data : null;
}

export function parseEntitlementError(error: unknown): { feature: string } | null {
  if (!isApiError(error) || !isRecord(error.details)) return null;
  const parsed = entitlementErrorDetailsSchema.safeParse(error.details);
  return parsed.success ? { feature: parsed.data.feature } : null;
}

/** True when the failure is a plan boundary rather than a real error. */
export function isPlanBoundaryError(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.code === "ENTITLEMENT_REQUIRED" ||
      error.code === "USAGE_LIMIT_REACHED" ||
      error.code === "CAREER_TARGET_LIMIT_REACHED")
  );
}

export function isBillingUnavailable(error: unknown): boolean {
  return error instanceof ApiError && error.code === "BILLING_NOT_CONFIGURED";
}

/** True when the deployment can actually sell this option. */
export function isPurchasable(option: BillingPlanOption): boolean {
  return option.plan !== "FREE" && option.purchasable;
}

export function intervalLabel(interval: BillingPlanOption["interval"]): string {
  if (interval === "YEAR") return "/year";
  if (interval === "MONTH") return "/month";
  return "";
}
