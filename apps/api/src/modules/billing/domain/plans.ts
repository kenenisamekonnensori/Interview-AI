import type {
  BillingIntervalValue,
  BillingPlanId,
  BillingPlanOption,
  PlanEntitlements,
} from "@interviewer-ai/types";
import type { ServerEnvironment } from "@interviewer-ai/config";

/**
 * The server-owned plan catalog.
 *
 * Paddle owns products and prices; the application owns plans, entitlements, and
 * allowances. Every Paddle price id lives in environment configuration and is
 * mapped to an internal plan here, so no price id is ever hardcoded in business
 * logic and a client can never ask for a plan the server does not know.
 *
 * Allowances are per billing period. `null` means unlimited (an explicit value,
 * never a magic maximum). Free is a real plan with real entitlements rather than
 * a special case sprinkled through the codebase.
 */
export const planEntitlements: Record<BillingPlanId, PlanEntitlements> = {
  FREE: {
    plan: "FREE",
    features: {
      // The free plan must let someone understand the product's value: one real
      // interview with a real report, plus readiness. Cross-interview AI
      // interpretation and longitudinal analytics are Pro.
      PERFORMANCE_ANALYTICS: false,
      SKILL_PROFILE: false,
      PRACTICE_PLAN: false,
      ADVANCED_FEEDBACK: false,
      READINESS_ASSESSMENT: true,
    },
    limits: { MOCK_INTERVIEW: 1, AI_ANALYSIS: 0 },
    caps: { activeCareerTargets: 1 },
  },
  PRO: {
    plan: "PRO",
    features: {
      PERFORMANCE_ANALYTICS: true,
      SKILL_PROFILE: true,
      PRACTICE_PLAN: true,
      ADVANCED_FEEDBACK: true,
      READINESS_ASSESSMENT: true,
    },
    limits: { MOCK_INTERVIEW: 30, AI_ANALYSIS: 100 },
    caps: { activeCareerTargets: null },
  },
};

/** Display pricing, in minor units of the given currency. Paddle charges the real price. */
const planPricing: Record<string, number> = {
  "PRO:MONTH": 1900,
  "PRO:YEAR": 18000,
};

export const billingCurrency = "USD";

/** Purchasable (paid) options. Free is not purchased. */
export const purchasablePlanIntervals: Array<{
  plan: BillingPlanId;
  interval: BillingIntervalValue;
}> = [
  { plan: "PRO", interval: "MONTH" },
  { plan: "PRO", interval: "YEAR" },
];

type PaddlePriceEnvironment = Pick<
  ServerEnvironment,
  "PADDLE_PRO_MONTHLY_PRICE_ID" | "PADDLE_PRO_YEARLY_PRICE_ID"
>;

function configuredPriceId(
  environment: PaddlePriceEnvironment,
  plan: BillingPlanId,
  interval: BillingIntervalValue,
): string | null {
  if (plan === "PRO" && interval === "MONTH") {
    return environment.PADDLE_PRO_MONTHLY_PRICE_ID ?? null;
  }
  if (plan === "PRO" && interval === "YEAR") {
    return environment.PADDLE_PRO_YEARLY_PRICE_ID ?? null;
  }
  return null;
}

/** Resolves the trusted provider price for a plan and interval, or null when unconfigured. */
export function priceIdForPlan(
  environment: PaddlePriceEnvironment,
  plan: BillingPlanId,
  interval: BillingIntervalValue,
): string | null {
  return configuredPriceId(environment, plan, interval);
}

/** Reverse map used to derive the internal plan from a webhook's subscription item. */
export function planForPriceId(
  environment: PaddlePriceEnvironment,
  priceId: string,
): { plan: BillingPlanId; interval: BillingIntervalValue } | null {
  for (const option of purchasablePlanIntervals) {
    if (configuredPriceId(environment, option.plan, option.interval) === priceId) {
      return { plan: option.plan, interval: option.interval };
    }
  }
  return null;
}

export function isBillingConfigured(environment: {
  PADDLE_API_KEY?: string;
  PADDLE_WEBHOOK_SECRET?: string;
}): boolean {
  return Boolean(environment.PADDLE_API_KEY && environment.PADDLE_WEBHOOK_SECRET);
}

/** The catalog the API exposes to clients: no provider ids, only internal plans. */
export function planOptions(environment: PaddlePriceEnvironment): BillingPlanOption[] {
  const free: BillingPlanOption = {
    plan: "FREE",
    interval: null,
    amount: 0,
    currency: billingCurrency,
    purchasable: false,
    entitlements: planEntitlements.FREE,
  };
  const paid = purchasablePlanIntervals.map(({ plan, interval }) => ({
    plan,
    interval,
    amount: planPricing[`${plan}:${interval}`] ?? null,
    currency: billingCurrency,
    purchasable: configuredPriceId(environment, plan, interval) !== null,
    entitlements: planEntitlements[plan],
  }));
  return [free, ...paid];
}

/** Paddle products/prices the deployment knows about, for reconciliation. */
export function configuredPriceIds(environment: PaddlePriceEnvironment): string[] {
  return purchasablePlanIntervals
    .map(({ plan, interval }) => configuredPriceId(environment, plan, interval))
    .filter((priceId): priceId is string => priceId !== null);
}
