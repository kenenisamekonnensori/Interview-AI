import type {
  BillingPlanId,
  EntitlementKey,
  UsageLimitErrorDetails,
  UsageResourceId,
} from "@interviewer-ai/types";

export type BillingErrorCode =
  | "BILLING_NOT_CONFIGURED"
  | "PLAN_NOT_PURCHASABLE"
  | "BILLING_CUSTOMER_REQUIRED"
  | "SUBSCRIPTION_NOT_FOUND"
  | "USAGE_LIMIT_REACHED"
  | "ENTITLEMENT_REQUIRED"
  | "CAREER_TARGET_LIMIT_REACHED"
  | "SUBSCRIPTION_ASSOCIATION_CONFLICT"
  | "WEBHOOK_NOT_CONFIGURED"
  | "WEBHOOK_SIGNATURE_INVALID"
  | "WEBHOOK_PAYLOAD_INVALID"
  | "BILLING_PROVIDER_UNAVAILABLE";

/**
 * Billing failures carry a stable machine code plus structured, non-sensitive
 * details so clients can explain exactly what happened and what to do next.
 * Internal provider messages, ids, and secrets never travel in these payloads.
 */
export class BillingError extends Error {
  constructor(
    readonly code: BillingErrorCode,
    message: string,
    readonly httpStatus: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "BillingError";
  }
}

export function usageLimitError(
  resource: UsageResourceId,
  currentUsage: number,
  limit: number,
  plan: BillingPlanId,
  periodEndsAt: Date,
): BillingError {
  const details: UsageLimitErrorDetails = {
    resource,
    currentUsage,
    limit,
    plan,
    periodEndsAt: periodEndsAt.toISOString(),
    upgradeAvailable: true,
  };
  return new BillingError(
    "USAGE_LIMIT_REACHED",
    limit === 0
      ? "Your current plan does not include this feature."
      : "You have reached your plan limit for this period.",
    // 402 communicates a plan-limit boundary distinct from authorization (403)
    // and rate limiting (429), so the client can render the right upgrade path.
    402,
    details,
  );
}

export function entitlementError(feature: EntitlementKey, plan: BillingPlanId): BillingError {
  return new BillingError(
    "ENTITLEMENT_REQUIRED",
    "This feature is available on the Pro plan.",
    403,
    { feature, plan, upgradeAvailable: true },
  );
}

export function careerTargetLimitError(
  active: number,
  limit: number,
  plan: BillingPlanId,
): BillingError {
  return new BillingError(
    "CAREER_TARGET_LIMIT_REACHED",
    `Your plan allows ${limit} active target job${limit === 1 ? "" : "s"}.`,
    402,
    { active, limit, plan, upgradeAvailable: true },
  );
}

export function billingNotConfiguredError(): BillingError {
  return new BillingError(
    "BILLING_NOT_CONFIGURED",
    "Billing is not available on this deployment yet.",
    503,
    { upgradeAvailable: false },
  );
}

export function planNotPurchasableError(plan: BillingPlanId): BillingError {
  return new BillingError(
    "PLAN_NOT_PURCHASABLE",
    "That plan is not available. Please choose a plan from the pricing page.",
    400,
    { plan, upgradeAvailable: false },
  );
}
