import type {
  BillingPlanId,
  EntitlementKey,
  PlanEntitlements,
  SubscriptionStatusValue,
} from "@interviewer-ai/types";

import { planEntitlements } from "./plans.js";

export type SubscriptionAccessState = {
  plan: BillingPlanId;
  status: SubscriptionStatusValue;
  currentPeriodEnd: Date | null;
};

export type ResolvedAccess = {
  /** The plan whose entitlements are effective right now. */
  plan: BillingPlanId;
  entitlements: PlanEntitlements;
  /** When the currently effective paid access ends, when it is time-boxed. */
  accessUntil: Date | null;
};

/**
 * The single, documented access policy. Every feature and limit decision in the
 * application resolves through here — there is no scattered
 * `subscription.plan === "PRO"` logic anywhere else.
 *
 * Paddle statuses map to effective access as follows:
 *
 * | Status                    | Effective access                                  |
 * | ------------------------- | ------------------------------------------------- |
 * | `active`, `trialing`      | Full plan entitlements                            |
 * | `past_due`                | Plan entitlements until the paid period ends      |
 * | `canceled`                | Plan entitlements until the paid period ends       |
 * | `paused`                  | Free plan entitlements                            |
 * | no subscription row       | Free plan entitlements                            |
 *
 * The `past_due` and `canceled` rules are deliberate product policy: a failed
 * renewal or a scheduled cancellation must not yank access away from a customer
 * who has already paid through a period. Once the period genuinely ends the
 * account falls back to the free plan. Historical data is never deleted by any
 * of these transitions.
 */
export function resolveAccess(
  subscription: SubscriptionAccessState | null,
  now: Date = new Date(),
): ResolvedAccess {
  if (!subscription) {
    return { plan: "FREE", entitlements: planEntitlements.FREE, accessUntil: null };
  }

  const periodEnd = subscription.currentPeriodEnd;
  const paidPeriodActive = periodEnd !== null && periodEnd.getTime() > now.getTime();
  const paid: ResolvedAccess = {
    plan: subscription.plan,
    entitlements: planEntitlements[subscription.plan],
    accessUntil: periodEnd,
  };
  const free: ResolvedAccess = {
    plan: "FREE",
    entitlements: planEntitlements.FREE,
    accessUntil: periodEnd,
  };

  switch (subscription.status) {
    case "ACTIVE":
    case "TRIALING":
      return paid;
    case "PAST_DUE":
    case "CANCELED":
      return paidPeriodActive ? paid : free;
    case "PAUSED":
      return free;
    default: {
      const exhaustive: never = subscription.status;
      return exhaustive;
    }
  }
}

export function hasEntitlement(entitlements: PlanEntitlements, key: EntitlementKey): boolean {
  return entitlements.features[key] === true;
}

/** Per-period allowance for a metered resource; `null` is unlimited. */
export function allowanceFor(
  entitlements: PlanEntitlements,
  resource: keyof PlanEntitlements["limits"],
): number | null {
  return entitlements.limits[resource];
}
