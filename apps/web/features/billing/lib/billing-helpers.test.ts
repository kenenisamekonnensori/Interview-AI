import assert from "node:assert/strict";
import { test } from "vitest";

import type { BillingPlanOption, UsageStatus } from "@interviewer-ai/types";

import { ApiError } from "@/lib/api-client";

import {
  formatAmount,
  intervalLabel,
  isAtLimit,
  isBillingUnavailable,
  isPlanBoundaryError,
  isPurchasable,
  parseEntitlementError,
  parseUsageLimitError,
  planLabel,
  remainingSummary,
  subscriptionStatusLabel,
  usagePercent,
  usageResourceLabel,
  usageSummary,
} from "./billing-helpers.js";

const usage = (overrides: Partial<UsageStatus> = {}): UsageStatus => ({
  resource: "MOCK_INTERVIEW",
  used: 4,
  limit: 5,
  unlimited: false,
  remaining: 1,
  periodStart: "2026-09-01T00:00:00.000Z",
  periodEnd: "2026-10-01T00:00:00.000Z",
  ...overrides,
});

const limitError = () =>
  new ApiError({
    code: "USAGE_LIMIT_REACHED",
    message: "You have reached your plan limit for this period.",
    status: 402,
    details: {
      resource: "MOCK_INTERVIEW",
      currentUsage: 5,
      limit: 5,
      plan: "FREE",
      periodEndsAt: "2026-10-01T00:00:00.000Z",
      upgradeAvailable: true,
    },
  });

test("labels are human-readable for plans, statuses, and resources", () => {
  assert.equal(planLabel("FREE"), "Free");
  assert.equal(planLabel("PRO"), "Pro");
  assert.equal(subscriptionStatusLabel("PAST_DUE"), "Payment past due");
  assert.equal(subscriptionStatusLabel("ACTIVE"), "Active");
  assert.equal(usageResourceLabel("MOCK_INTERVIEW"), "practice interviews");
});

test("usage summary never shows a fraction for an unlimited plan", () => {
  assert.equal(usageSummary(usage()), "4 / 5 practice interviews used");
  assert.equal(
    usageSummary(usage({ used: 900, limit: null, unlimited: true, remaining: null })),
    "Unlimited",
  );
});

test("remaining summary speaks in uses left and handles the exhausted case", () => {
  assert.equal(remainingSummary(usage()), "1 use left");
  assert.equal(remainingSummary(usage({ used: 3, remaining: 2 })), "2 uses left");
  assert.equal(remainingSummary(usage({ used: 5, remaining: 0 })), "No uses left this period");
  assert.equal(
    remainingSummary(usage({ limit: null, unlimited: true, remaining: null })),
    "Unlimited",
  );
});

test("usage percent is bounded and treats unlimited as no progress bar", () => {
  assert.equal(usagePercent(usage({ used: 4, limit: 5 })), 80);
  assert.equal(usagePercent(usage({ used: 9, limit: 5 })), 100);
  assert.equal(usagePercent(usage({ limit: 0, used: 0 })), 0);
  assert.equal(usagePercent(usage({ limit: null, unlimited: true })), 0);
});

test("at-limit detection ignores unlimited allowances", () => {
  assert.equal(isAtLimit(usage({ remaining: 0 })), true);
  assert.equal(isAtLimit(usage({ remaining: 1 })), false);
  assert.equal(isAtLimit(usage({ limit: null, unlimited: true, remaining: null })), false);
});

test("amounts render in whole currency units and custom pricing is explicit", () => {
  assert.equal(formatAmount(1900, "USD"), "$19");
  assert.equal(formatAmount(null, "USD"), "Custom");
  assert.equal(intervalLabel("YEAR"), "/year");
  assert.equal(intervalLabel(null), "");
});

test("a plan limit response is parsed into structured upgrade details", () => {
  const parsed = parseUsageLimitError(limitError());
  assert.equal(parsed?.resource, "MOCK_INTERVIEW");
  assert.equal(parsed?.limit, 5);
  assert.equal(parsed?.upgradeAvailable, true);
  assert.equal(parseUsageLimitError(new Error("boom")), null);
  assert.equal(parseUsageLimitError(new ApiError({ code: "X", message: "x", status: 500 })), null);
});

test("an entitlement response is parsed into the gated feature", () => {
  const error = new ApiError({
    code: "ENTITLEMENT_REQUIRED",
    message: "This feature is available on the Pro plan.",
    status: 403,
    details: { feature: "PERFORMANCE_ANALYTICS", plan: "FREE", upgradeAvailable: true },
  });
  assert.deepEqual(parseEntitlementError(error), { feature: "PERFORMANCE_ANALYTICS" });
  assert.equal(parseEntitlementError(limitError()), null);
});

test("plan boundaries are distinguished from real errors", () => {
  assert.equal(isPlanBoundaryError(limitError()), true);
  assert.equal(
    isPlanBoundaryError(
      new ApiError({
        code: "ENTITLEMENT_REQUIRED",
        message: "x",
        status: 403,
        details: { feature: "SKILL_PROFILE", plan: "FREE", upgradeAvailable: true },
      }),
    ),
    true,
  );
  assert.equal(
    isPlanBoundaryError(
      new ApiError({ code: "CAREER_TARGET_LIMIT_REACHED", message: "x", status: 402 }),
    ),
    true,
  );
  assert.equal(
    isPlanBoundaryError(new ApiError({ code: "INTERNAL", message: "x", status: 500 })),
    false,
  );
  assert.equal(isPlanBoundaryError(new Error("network")), false);
});

test("a billing outage is recognised so the UI can degrade cleanly", () => {
  assert.equal(
    isBillingUnavailable(
      new ApiError({ code: "BILLING_NOT_CONFIGURED", message: "x", status: 503 }),
    ),
    true,
  );
  assert.equal(isBillingUnavailable(limitError()), false);
});

test("only paid options with a configured provider price are purchasable", () => {
  const option = (overrides: Partial<BillingPlanOption>): BillingPlanOption => ({
    plan: "PRO",
    interval: "MONTH",
    amount: 1900,
    currency: "USD",
    purchasable: true,
    entitlements: {
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
    ...overrides,
  });
  assert.equal(isPurchasable(option({})), true);
  assert.equal(isPurchasable(option({ purchasable: false })), false);
  assert.equal(isPurchasable(option({ plan: "FREE", interval: null, amount: 0 })), false);
});
