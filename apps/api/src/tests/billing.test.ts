import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "vitest";

import type { ServerEnvironment } from "@interviewer-ai/config";
import {
  billingCheckoutRequestSchema,
  usageLimitErrorDetailsSchema,
  type UsageResourceId,
} from "@interviewer-ai/types";

import type { PrismaClient } from "../../prisma/generated/client.js";
import {
  BillingEventProcessor,
  resolveSubscriptionPlan,
} from "../modules/billing/billing-event-processor.js";
import {
  entitlementError,
  careerTargetLimitError,
  planNotPurchasableError,
  BillingError,
} from "../modules/billing/domain/errors.js";
import { resolveAccess, hasEntitlement } from "../modules/billing/domain/entitlements.js";
import {
  isBillingConfigured,
  planEntitlements,
  planForPriceId,
  planOptions,
  priceIdForPlan,
} from "../modules/billing/domain/plans.js";
import { startOfUtcMonth, usagePeriodFor } from "../modules/billing/domain/usage-period.js";
import { EntitlementService } from "../modules/billing/entitlement-service.js";
import {
  intervalFromBillingCycle,
  isSubscriptionSyncEvent,
  toBillingIntent,
  toSubscriptionFacts,
} from "../modules/billing/providers/paddle/events.js";
import { BillingRepository, type SubscriptionRow } from "../modules/billing/repository.js";
import { BillingService } from "../modules/billing/service.js";
import { UsageService } from "../modules/billing/usage-service.js";
import { BillingWebhookService, verifyPaddleWebhook } from "../modules/billing/webhook-service.js";

/* ------------------------------------------------------------------------- */
/* Shared fixtures                                                            */
/* ------------------------------------------------------------------------- */

const NOW = new Date("2026-09-15T12:00:00.000Z");
const USER = "11111111-1111-4111-8111-111111111111";
const OTHER_USER = "22222222-2222-4222-8222-222222222222";
const WEBHOOK_SECRET = "test_webhook_secret_value";
const MONTHLY_PRICE = "pri_monthly_test";
const YEARLY_PRICE = "pri_yearly_test";
const PRO_PRODUCT = "pro_product_test";

const priceEnvironment = {
  PADDLE_PRO_MONTHLY_PRICE_ID: MONTHLY_PRICE,
  PADDLE_PRO_YEARLY_PRICE_ID: YEARLY_PRICE,
};

const billingEnvironment = {
  PADDLE_ENVIRONMENT: "sandbox",
  PADDLE_API_KEY: "test_api_key",
  PADDLE_WEBHOOK_SECRET: WEBHOOK_SECRET,
  PADDLE_PRO_PRODUCT_ID: PRO_PRODUCT,
  ...priceEnvironment,
} as unknown as ServerEnvironment;

const subscriptionRow = (overrides: Partial<SubscriptionRow> = {}): SubscriptionRow => ({
  id: "sub_row_1",
  userId: USER,
  providerSubscriptionId: "sub_1",
  providerCustomerId: "ctm_1",
  plan: "PRO",
  status: "ACTIVE",
  billingInterval: "MONTH",
  currentPeriodStart: new Date("2026-09-10T00:00:00.000Z"),
  currentPeriodEnd: new Date("2026-10-10T00:00:00.000Z"),
  cancelAtPeriodEnd: false,
  scheduledChangeEffectiveAt: null,
  lastWebhookOccurredAt: null,
  ...overrides,
});

/* ------------------------------------------------------------------------- */
/* A. Entitlement resolution (the single access policy)                       */
/* ------------------------------------------------------------------------- */

test("entitlements: no subscription resolves to the free plan", () => {
  const access = resolveAccess(null, NOW);
  assert.equal(access.plan, "FREE");
  assert.equal(hasEntitlement(access.entitlements, "READINESS_ASSESSMENT"), true);
  assert.equal(hasEntitlement(access.entitlements, "PERFORMANCE_ANALYTICS"), false);
  assert.equal(hasEntitlement(access.entitlements, "PRACTICE_PLAN"), false);
  assert.equal(access.accessUntil, null);
});

test("entitlements: active and trialing subscriptions grant the full paid plan", () => {
  for (const status of ["ACTIVE", "TRIALING"] as const) {
    const access = resolveAccess(
      subscriptionRow({ status, currentPeriodEnd: new Date("2026-10-10T00:00:00.000Z") }),
      NOW,
    );
    assert.equal(access.plan, "PRO");
    assert.equal(hasEntitlement(access.entitlements, "PERFORMANCE_ANALYTICS"), true);
    assert.equal(access.accessUntil?.toISOString(), "2026-10-10T00:00:00.000Z");
  }
});

test("entitlements: past_due keeps paid access until the paid period ends", () => {
  const inPeriod = resolveAccess(
    subscriptionRow({ status: "PAST_DUE", currentPeriodEnd: new Date("2026-10-10T00:00:00.000Z") }),
    NOW,
  );
  assert.equal(inPeriod.plan, "PRO");
  const afterPeriod = resolveAccess(
    subscriptionRow({ status: "PAST_DUE", currentPeriodEnd: new Date("2026-09-10T00:00:00.000Z") }),
    NOW,
  );
  assert.equal(afterPeriod.plan, "FREE");
});

test("entitlements: canceled keeps paid access through the period, then drops to free", () => {
  const stillPaid = resolveAccess(
    subscriptionRow({ status: "CANCELED", currentPeriodEnd: new Date("2026-10-10T00:00:00.000Z") }),
    NOW,
  );
  assert.equal(stillPaid.plan, "PRO");
  const ended = resolveAccess(
    subscriptionRow({ status: "CANCELED", currentPeriodEnd: new Date("2026-09-10T00:00:00.000Z") }),
    NOW,
  );
  assert.equal(ended.plan, "FREE");
  // Access end is still reported so the UI can explain when features lapse.
  assert.equal(ended.accessUntil?.toISOString(), "2026-09-10T00:00:00.000Z");
});

test("entitlements: paused drops to free immediately", () => {
  const access = resolveAccess(
    subscriptionRow({ status: "PAUSED", currentPeriodEnd: new Date("2026-10-10T00:00:00.000Z") }),
    NOW,
  );
  assert.equal(access.plan, "FREE");
});

test("entitlements: free plan is a real plan, not an exception", () => {
  assert.equal(planEntitlements.FREE.plan, "FREE");
  assert.deepEqual(planEntitlements.FREE.limits, { MOCK_INTERVIEW: 1, AI_ANALYSIS: 0 });
  assert.equal(planEntitlements.FREE.caps.activeCareerTargets, 1);
});

/* ------------------------------------------------------------------------- */
/* B. Plan catalog and provider price mapping                                 */
/* ------------------------------------------------------------------------- */

test("plan catalog: prices only come from configuration, never hardcoded", () => {
  const unconfigured = planOptions({
    PADDLE_PRO_MONTHLY_PRICE_ID: undefined,
    PADDLE_PRO_YEARLY_PRICE_ID: undefined,
  });
  assert.equal(unconfigured.filter((option) => option.purchasable).length, 0);
  assert.equal(unconfigured[0]?.plan, "FREE");
  assert.equal(unconfigured[0]?.purchasable, false);

  const configured = planOptions(priceEnvironment);
  const purchasable = configured.filter((option) => option.purchasable);
  assert.equal(purchasable.length, 2);
  assert.deepEqual(
    purchasable.map((option) => `${option.plan}:${option.interval}`),
    ["PRO:MONTH", "PRO:YEAR"],
  );
});

test("plan catalog: exposed options never leak provider identifiers", () => {
  for (const option of planOptions(priceEnvironment)) {
    assert.deepEqual(Object.keys(option).sort(), [
      "amount",
      "currency",
      "entitlements",
      "interval",
      "plan",
      "purchasable",
    ]);
  }
});

test("plan catalog: price ids resolve to internal plans both ways", () => {
  assert.equal(priceIdForPlan(priceEnvironment, "PRO", "MONTH"), MONTHLY_PRICE);
  assert.equal(priceIdForPlan(priceEnvironment, "PRO", "YEAR"), YEARLY_PRICE);
  assert.equal(priceIdForPlan(priceEnvironment, "FREE", "MONTH"), null);
  assert.deepEqual(planForPriceId(priceEnvironment, YEARLY_PRICE), {
    plan: "PRO",
    interval: "YEAR",
  });
  assert.equal(planForPriceId(priceEnvironment, "pri_unknown"), null);
});

test("plan catalog: billing is only considered configured with real credentials", () => {
  assert.equal(isBillingConfigured({ PADDLE_API_KEY: "", PADDLE_WEBHOOK_SECRET: "" }), false);
  assert.equal(isBillingConfigured({ PADDLE_API_KEY: "k", PADDLE_WEBHOOK_SECRET: "" }), false);
  assert.equal(isBillingConfigured({ PADDLE_API_KEY: "k", PADDLE_WEBHOOK_SECRET: "s" }), true);
});

/* ------------------------------------------------------------------------- */
/* C. Usage periods                                                           */
/* ------------------------------------------------------------------------- */

test("usage period: inside a paid period the window is the billing period", () => {
  const period = usagePeriodFor(
    {
      currentPeriodStart: new Date("2026-09-10T00:00:00.000Z"),
      currentPeriodEnd: new Date("2026-10-10T00:00:00.000Z"),
    },
    NOW,
  );
  assert.equal(period.start.toISOString(), "2026-09-10T00:00:00.000Z");
  assert.equal(period.end.toISOString(), "2026-10-10T00:00:00.000Z");
});

test("usage period: outside a paid period the window is the UTC calendar month", () => {
  const expired = usagePeriodFor(
    {
      currentPeriodStart: new Date("2026-08-10T00:00:00.000Z"),
      currentPeriodEnd: new Date("2026-09-10T00:00:00.000Z"),
    },
    NOW,
  );
  assert.equal(expired.start.toISOString(), "2026-09-01T00:00:00.000Z");
  assert.equal(expired.end.toISOString(), "2026-10-01T00:00:00.000Z");
  assert.equal(usagePeriodFor(null, NOW).start.toISOString(), startOfUtcMonth(NOW).toISOString());
});

/* ------------------------------------------------------------------------- */
/* D. Fake repository: models the database's constraints and atomicity        */
/* ------------------------------------------------------------------------- */

type FakeCounter = {
  id: string;
  userId: string;
  resource: UsageResourceId;
  periodStart: Date;
  periodEnd: Date;
  used: number;
};

type FakeRecord = {
  id: string;
  userId: string;
  subscriptionId: string | null;
  resource: UsageResourceId;
  quantity: number;
  periodStart: Date;
  periodEnd: Date;
  referenceType: string;
  referenceId: string;
  status: "RESERVED" | "COMMITTED" | "RELEASED";
};

type FakeEvent = {
  id: string;
  providerEventId: string;
  eventType: string;
  occurredAt: Date;
  payload: unknown;
  userId: string | null;
  subscriptionId: string | null;
  status: "PENDING" | "PROCESSING" | "PROCESSED" | "IGNORED" | "FAILED";
  error: string | null;
};

function createFakeRepository() {
  const counters: FakeCounter[] = [];
  const records: FakeRecord[] = [];
  const events: FakeEvent[] = [];
  const customers: Array<{ userId: string; providerCustomerId: string }> = [];
  const subscriptions: SubscriptionRow[] = [];
  const calls = { completeEvent: 0, ignoreEvent: 0, failEvent: 0 };

  const sameKey = (a: Date, b: Date) => a.getTime() === b.getTime();

  const repository = {
    counters,
    records,
    events,
    customers,
    subscriptions,
    calls,

    async findSubscriptionForUser(userId: string) {
      return subscriptions.find((row) => row.userId === userId) ?? null;
    },
    async findSubscriptionByProviderId(providerSubscriptionId: string) {
      return (
        subscriptions.find((row) => row.providerSubscriptionId === providerSubscriptionId) ?? null
      );
    },
    async findCustomer(userId: string) {
      return customers.find((row) => row.userId === userId) ?? null;
    },
    async findCustomerByProviderId(providerCustomerId: string) {
      return customers.find((row) => row.providerCustomerId === providerCustomerId) ?? null;
    },
    async createCustomer(input: { userId: string; providerCustomerId: string }) {
      if (
        customers.some(
          (row) =>
            row.userId === input.userId || row.providerCustomerId === input.providerCustomerId,
        )
      ) {
        throw new Error("unique constraint");
      }
      customers.push({ ...input });
      return { id: `customer:${input.userId}`, ...input };
    },
    async listSubscriptionsForUser(userId: string) {
      return subscriptions.filter((row) => row.userId === userId);
    },
    async findUserForBilling(userId: string) {
      return { id: userId, email: "user@example.com", name: "User" };
    },
    async resolveOwnerId(providerCustomerId: string) {
      return customers.find((row) => row.providerCustomerId === providerCustomerId)?.userId ?? null;
    },
    async countActiveCareerTargets() {
      return state.activeTargets;
    },

    /* Usage ledger */
    async findUsageCounter(userId: string, resource: UsageResourceId, periodStart: Date) {
      return (
        counters.find(
          (row) =>
            row.userId === userId &&
            row.resource === resource &&
            sameKey(row.periodStart, periodStart),
        ) ?? null
      );
    },
    async listUsageCounters(userId: string, periodStart: Date) {
      return counters.filter(
        (row) => row.userId === userId && sameKey(row.periodStart, periodStart),
      );
    },
    async findByReference(resource: UsageResourceId, referenceType: string, referenceId: string) {
      return (
        records.find(
          (row) =>
            row.resource === resource &&
            row.referenceType === referenceType &&
            row.referenceId === referenceId,
        ) ?? null
      );
    },
    /**
     * Mirrors the real single-statement conditional upsert: the check and the
     * increment happen together, with no await between them, exactly like the
     * database's row lock. This is what makes concurrent reserves racy in the
     * right direction.
     */
    async reserveUsage(input: {
      id: string;
      userId: string;
      subscriptionId: string | null;
      resource: UsageResourceId;
      periodStart: Date;
      periodEnd: Date;
      referenceType: string;
      referenceId: string;
      limit: number | null;
    }) {
      const duplicate = records.find(
        (row) =>
          row.resource === input.resource &&
          row.referenceType === input.referenceType &&
          row.referenceId === input.referenceId,
      );
      if (duplicate) throw new Error("unique constraint on usage_record");

      let counter = counters.find(
        (row) =>
          row.userId === input.userId &&
          row.resource === input.resource &&
          sameKey(row.periodStart, input.periodStart),
      );
      const used = counter?.used ?? 0;
      if (input.limit !== null && used >= input.limit) return null;
      if (!counter) {
        counter = {
          id: `counter:${input.id}`,
          userId: input.userId,
          resource: input.resource,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          used: 0,
        };
        counters.push(counter);
      }
      counter.used += 1;
      records.push({
        id: input.id,
        userId: input.userId,
        subscriptionId: input.subscriptionId,
        resource: input.resource,
        quantity: 1,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        status: "RESERVED",
      });
      return { id: input.id };
    },
    async commitUsageRecord(id: string) {
      const record = records.find((row) => row.id === id && row.status === "RESERVED");
      if (!record) return { count: 0 };
      record.status = "COMMITTED";
      return { count: 1 };
    },
    async releaseUsage(input: {
      userId: string;
      resource: UsageResourceId;
      referenceType: string;
      referenceId: string;
    }) {
      const record = records.find(
        (row) =>
          row.resource === input.resource &&
          row.referenceType === input.referenceType &&
          row.referenceId === input.referenceId,
      );
      if (!record || record.userId !== input.userId || record.quantity < 1) return false;
      if (record.status === "RELEASED") return false;
      const counter = counters.find(
        (row) =>
          row.userId === record.userId &&
          row.resource === record.resource &&
          sameKey(row.periodStart, record.periodStart),
      );
      if (counter) counter.used = Math.max(counter.used - record.quantity, 0);
      record.status = "RELEASED";
      return true;
    },
    async countConsumedUsage(userId: string, resource: UsageResourceId, periodStart: Date) {
      const total = records
        .filter(
          (row) =>
            row.userId === userId &&
            row.resource === resource &&
            sameKey(row.periodStart, periodStart) &&
            row.status !== "RELEASED",
        )
        .reduce((sum, row) => sum + row.quantity, 0);
      return { _sum: { quantity: total } };
    },
    async setUsageCounterUsed(input: {
      id: string;
      userId: string;
      resource: UsageResourceId;
      periodStart: Date;
      periodEnd: Date;
      used: number;
    }) {
      const existing = counters.find(
        (row) =>
          row.userId === input.userId &&
          row.resource === input.resource &&
          sameKey(row.periodStart, input.periodStart),
      );
      if (existing) existing.used = input.used;
      else
        counters.push({
          id: input.id,
          userId: input.userId,
          resource: input.resource,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          used: input.used,
        });
    },

    /* Webhook event log */
    async createEvent(input: {
      providerEventId: string;
      eventType: string;
      occurredAt: Date;
      payload: unknown;
      userId: string | null;
      subscriptionId: string | null;
    }) {
      if (events.some((row) => row.providerEventId === input.providerEventId)) return null;
      const row: FakeEvent = {
        id: `evt_row_${events.length + 1}`,
        ...input,
        status: "PENDING",
        error: null,
      };
      events.push(row);
      return row;
    },
    async findEventById(id: string) {
      return events.find((row) => row.id === id) ?? null;
    },
    async claimEventForProcessing(id: string) {
      const row = events.find((event) => event.id === id);
      if (!row || !["PENDING", "FAILED"].includes(row.status)) return { count: 0 };
      row.status = "PROCESSING";
      return { count: 1 };
    },
    async completeEvent(
      id: string,
      input: { userId: string | null; subscriptionId: string | null },
    ) {
      calls.completeEvent += 1;
      const row = events.find((event) => event.id === id);
      if (row) {
        row.status = "PROCESSED";
        row.userId = input.userId;
        row.subscriptionId = input.subscriptionId;
      }
      return row;
    },
    async ignoreEvent(id: string, reason: string) {
      calls.ignoreEvent += 1;
      const row = events.find((event) => event.id === id);
      if (row) {
        row.status = "IGNORED";
        row.error = reason;
      }
      return row;
    },
    async failEvent(id: string, error: string) {
      calls.failEvent += 1;
      const row = events.find((event) => event.id === id);
      if (row) {
        row.status = "FAILED";
        row.error = error;
      }
      return row;
    },
    async listUnprocessedEvents() {
      return events.filter((row) => row.status === "PENDING" || row.status === "FAILED");
    },

    /**
     * Mirrors the repository's order-safe, association-safe sync so processor
     * behavior can be tested without a database.
     */
    async applySubscriptionSync(input: {
      facts: {
        providerSubscriptionId: string;
        providerCustomerId: string;
        status: SubscriptionRow["status"];
        currentPeriodStart: Date | null;
        currentPeriodEnd: Date | null;
        cancelAtPeriodEnd: boolean;
      };
      plan: SubscriptionRow["plan"] | null;
      interval: SubscriptionRow["billingInterval"];
      userId: string | null;
      occurredAt: Date;
      eventType: string;
    }) {
      const existing = subscriptions.find(
        (row) => row.providerSubscriptionId === input.facts.providerSubscriptionId,
      );
      const resolvedPlan = input.plan ?? existing?.plan ?? null;
      if (!resolvedPlan) return { applied: false, reason: "UNMAPPED_PRICE" as const };
      if (existing && input.userId && existing.userId !== input.userId) {
        return { applied: false, reason: "ASSOCIATION_CONFLICT" as const };
      }
      if (existing) {
        if (
          existing.lastWebhookOccurredAt &&
          existing.lastWebhookOccurredAt.getTime() > input.occurredAt.getTime()
        ) {
          return { applied: false, reason: "STALE_EVENT" as const };
        }
        const previousPlan = existing.plan;
        existing.plan = resolvedPlan;
        existing.status = input.facts.status;
        existing.billingInterval = input.interval ?? existing.billingInterval;
        existing.currentPeriodStart = input.facts.currentPeriodStart;
        existing.currentPeriodEnd = input.facts.currentPeriodEnd;
        existing.cancelAtPeriodEnd = input.facts.cancelAtPeriodEnd;
        existing.lastWebhookOccurredAt = input.occurredAt;
        return { applied: true as const, subscription: existing, previousPlan, created: false };
      }
      const ownerId =
        input.userId ??
        customers.find((row) => row.providerCustomerId === input.facts.providerCustomerId)
          ?.userId ??
        null;
      if (!ownerId) return { applied: false, reason: "ASSOCIATION_CONFLICT" as const };
      const created: SubscriptionRow = {
        id: `sub_row_${subscriptions.length + 1}`,
        userId: ownerId,
        providerSubscriptionId: input.facts.providerSubscriptionId,
        providerCustomerId: input.facts.providerCustomerId,
        plan: resolvedPlan,
        status: input.facts.status,
        billingInterval: input.interval,
        currentPeriodStart: input.facts.currentPeriodStart,
        currentPeriodEnd: input.facts.currentPeriodEnd,
        cancelAtPeriodEnd: input.facts.cancelAtPeriodEnd,
        scheduledChangeEffectiveAt: null,
        lastWebhookOccurredAt: input.occurredAt,
      };
      subscriptions.push(created);
      return { applied: true as const, subscription: created, previousPlan: null, created: true };
    },
  };

  const state = { activeTargets: 0 };

  return {
    repository: repository as unknown as BillingRepository,
    raw: repository,
    state,
  };
}

/* ------------------------------------------------------------------------- */
/* E. Usage service: limits, idempotency, races                               */
/* ------------------------------------------------------------------------- */

function freeUsageService() {
  const fake = createFakeRepository();
  const entitlements = new EntitlementService(fake.repository);
  return { ...fake, usage: new UsageService(fake.repository, entitlements), entitlements };
}

const interviewRef = (id: string) => ({
  userId: USER,
  resource: "MOCK_INTERVIEW" as const,
  referenceType: "INTERVIEW",
  referenceId: id,
});

test("usage: reserve below the limit consumes exactly one unit", async () => {
  const { usage, raw } = freeUsageService();
  const reservation = await usage.reserve(interviewRef("interview_a"), NOW);
  assert.equal(reservation.duplicate, false);
  assert.equal(reservation.limit, 1);
  assert.equal(reservation.used, 1);
  assert.equal(raw.counters[0]?.used, 1);
});

test("usage: at the limit the server refuses with structured limit details", async () => {
  const { usage } = freeUsageService();
  await usage.reserve(interviewRef("interview_a"), NOW);
  const error = await usage.reserve(interviewRef("interview_b"), NOW).then(
    () => null,
    (thrown: unknown) => thrown,
  );
  assert.ok(error instanceof BillingError);
  assert.equal(error.code, "USAGE_LIMIT_REACHED");
  assert.equal(error.httpStatus, 402);
  const details = usageLimitErrorDetailsSchema.safeParse(error.details);
  assert.equal(details.success, true);
  if (details.success) {
    assert.equal(details.data.resource, "MOCK_INTERVIEW");
    assert.equal(details.data.currentUsage, 1);
    assert.equal(details.data.limit, 1);
    assert.equal(details.data.plan, "FREE");
    assert.equal(details.data.upgradeAvailable, true);
    assert.match(details.data.periodEndsAt, /^2026-10-01T00:00:00\.000Z$/);
  }
});

test("usage: a plan allowance of zero is refused immediately", async () => {
  const fake = createFakeRepository();
  const entitlements = new EntitlementService(fake.repository);
  const usage = new UsageService(fake.repository, entitlements);
  const error = await usage
    .reserve(
      { userId: USER, resource: "AI_ANALYSIS", referenceType: "SKILL_ANALYSIS", referenceId: "x" },
      NOW,
    )
    .then(
      () => null,
      (thrown: unknown) => thrown,
    );
  assert.ok(error instanceof BillingError);
  assert.equal(error.code, "USAGE_LIMIT_REACHED");
});

test("usage: a retried operation must not consume twice", async () => {
  const { usage, raw } = freeUsageService();
  const first = await usage.reserve(interviewRef("interview_a"), NOW);
  const retry = await usage.reserve(interviewRef("interview_a"), NOW);
  assert.equal(first.duplicate, false);
  assert.equal(retry.duplicate, true);
  assert.equal(retry.used, 1);
  assert.equal(raw.records.length, 1);
  assert.equal(raw.counters[0]?.used, 1);
});

test("usage: a failed operation gives the unit back and stays refundable once", async () => {
  const { usage, raw } = freeUsageService();
  await usage.reserve(interviewRef("interview_a"), NOW);
  const released = await usage.release(interviewRef("interview_a"));
  assert.equal(released, true);
  assert.equal(raw.counters[0]?.used, 0);
  assert.equal(raw.records[0]?.status, "RELEASED");
  // A retried rollback is a no-op, so it can never decrement twice.
  assert.equal(await usage.release(interviewRef("interview_a")), false);
  assert.equal(raw.counters[0]?.used, 0);
});

test("usage: commit is idempotent", async () => {
  const { usage } = freeUsageService();
  await usage.reserve(interviewRef("interview_a"), NOW);
  assert.equal(await usage.commit(interviewRef("interview_a")), true);
  assert.equal(await usage.commit(interviewRef("interview_a")), true);
});

test("usage: concurrent requests cannot exceed a limit of one", async () => {
  const { usage, raw } = freeUsageService();
  const results = await Promise.allSettled([
    usage.reserve(interviewRef("interview_a"), NOW),
    usage.reserve(interviewRef("interview_b"), NOW),
  ]);
  const fulfilled = results.filter((result) => result.status === "fulfilled");
  const rejected = results.filter((result) => result.status === "rejected");
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.equal(raw.counters[0]?.used, 1);
  assert.equal(raw.records.length, 1);
});

test("usage: an unlimited allowance reports unlimited, never a magic maximum", async () => {
  const fake = createFakeRepository();
  const unlimited = {
    entitlements: {
      plan: "PRO",
      features: planEntitlements.PRO.features,
      limits: { MOCK_INTERVIEW: null, AI_ANALYSIS: null },
      caps: { activeCareerTargets: null },
    },
    accessUntil: null,
  };
  const usage = new UsageService(fake.repository, {
    accessFor: async () => ({ access: unlimited, subscription: null }),
  } as unknown as EntitlementService);
  await usage.reserve(interviewRef("interview_a"), NOW);
  const status = await usage.statusFor(USER, "MOCK_INTERVIEW", NOW);
  assert.equal(status.unlimited, true);
  assert.equal(status.limit, null);
  assert.equal(status.remaining, null);
});

test("usage reconciliation rebuilds counters from the ledger", async () => {
  const { usage, raw } = freeUsageService();
  await usage.reserve(interviewRef("interview_a"), NOW);
  await usage.commit(interviewRef("interview_a"));
  raw.counters[0]!.used = 7; // simulate drift
  const drifts = await usage.reconcileUser(USER, NOW);
  assert.equal(drifts.length, 1);
  assert.equal(drifts[0]?.after, 1);
  assert.equal(raw.counters[0]?.used, 1);
});

/* ------------------------------------------------------------------------- */
/* F. Webhook signature verification (raw body, real SDK)                     */
/* ------------------------------------------------------------------------- */

const paddleSignature = (body: string, secret: string, ts = Math.floor(Date.now() / 1000)) =>
  `ts=${ts};h1=${createHmac("sha256", secret).update(`${ts}:${body}`).digest("hex")}`;

const subscriptionEventBody = (overrides: { eventId?: string; occurredAt?: string } = {}) =>
  JSON.stringify({
    event_id: overrides.eventId ?? "evt_1",
    notification_id: "ntf_1",
    event_type: "subscription.updated",
    occurred_at: overrides.occurredAt ?? "2026-09-15T10:05:00.000Z",
    data: {
      id: "sub_1",
      status: "active",
      customer_id: "ctm_1",
      created_at: "2026-09-01T00:00:00.000Z",
      updated_at: "2026-09-15T10:05:00.000Z",
      current_billing_period: {
        starts_at: "2026-09-10T00:00:00.000Z",
        ends_at: "2026-10-10T00:00:00.000Z",
      },
      billing_cycle: { interval: "month", frequency: 1 },
      scheduled_change: null,
      items: [{ price: { id: MONTHLY_PRICE }, product: { id: PRO_PRODUCT } }],
      custom_data: { user_id: USER },
    },
  });

const webhookEnvironment = billingEnvironment as unknown as Parameters<
  typeof verifyPaddleWebhook
>[0];

test("webhook: a valid signature over the raw body is accepted", async () => {
  const body = subscriptionEventBody();
  const verified = await verifyPaddleWebhook(
    webhookEnvironment,
    body,
    paddleSignature(body, WEBHOOK_SECRET),
  );
  assert.equal(verified.eventId, "evt_1");
  assert.equal(verified.eventType, "subscription.updated");
  assert.equal(verified.occurredAt.toISOString(), "2026-09-15T10:05:00.000Z");
});

test("webhook: a forged signature is rejected", async () => {
  const body = subscriptionEventBody();
  const error = await verifyPaddleWebhook(
    webhookEnvironment,
    body,
    paddleSignature(body, "the_wrong_secret"),
  ).then(
    () => null,
    (thrown: unknown) => thrown,
  );
  assert.ok(error instanceof BillingError);
  assert.equal(error.code, "WEBHOOK_SIGNATURE_INVALID");
  assert.equal(error.httpStatus, 401);
});

test("webhook: a body modified after signing is rejected", async () => {
  const body = subscriptionEventBody();
  const signature = paddleSignature(body, WEBHOOK_SECRET);
  const tampered = body.replace('"active"', '"past_due"');
  const error = await verifyPaddleWebhook(webhookEnvironment, tampered, signature).then(
    () => null,
    (thrown: unknown) => thrown,
  );
  assert.ok(error instanceof BillingError);
  assert.equal(error.code, "WEBHOOK_SIGNATURE_INVALID");
});

test("webhook: a missing signature and unconfigured secret are both refused", async () => {
  const body = subscriptionEventBody();
  const missing = await verifyPaddleWebhook(webhookEnvironment, body, undefined).then(
    () => null,
    (thrown: unknown) => thrown,
  );
  assert.ok(missing instanceof BillingError);
  assert.equal(missing.code, "WEBHOOK_SIGNATURE_INVALID");

  const unconfigured = await verifyPaddleWebhook(
    {
      PADDLE_API_KEY: "k",
      PADDLE_ENVIRONMENT: "sandbox",
      PADDLE_WEBHOOK_SECRET: undefined,
    } as unknown as Parameters<typeof verifyPaddleWebhook>[0],
    body,
    paddleSignature(body, WEBHOOK_SECRET),
  ).then(
    () => null,
    (thrown: unknown) => thrown,
  );
  assert.ok(unconfigured instanceof BillingError);
  assert.equal(unconfigured.code, "WEBHOOK_NOT_CONFIGURED");
});

/* ------------------------------------------------------------------------- */
/* G. Webhook idempotency and subscription synchronization                    */
/* ------------------------------------------------------------------------- */

test("webhook: a replayed event id is acknowledged without a second side effect", async () => {
  const fake = createFakeRepository();
  const processor = new BillingEventProcessor(
    billingEnvironment as unknown as ConstructorParameters<typeof BillingEventProcessor>[0],
    fake.repository,
  );
  const service = new BillingWebhookService(billingEnvironment, fake.repository, processor, {});
  const body = subscriptionEventBody();
  const signature = paddleSignature(body, WEBHOOK_SECRET);

  const first = await service.handle(body, signature);
  assert.equal(first.duplicate, false);
  assert.equal(first.processing?.status, "PROCESSED");
  assert.equal(fake.raw.subscriptions.length, 1);
  assert.equal(fake.raw.subscriptions[0]?.userId, USER);
  assert.equal(fake.raw.subscriptions[0]?.plan, "PRO");
  assert.equal(fake.raw.events[0]?.status, "PROCESSED");

  const replay = await service.handle(body, signature);
  assert.equal(replay.duplicate, true);
  assert.equal(replay.processing, null);
  assert.equal(fake.raw.subscriptions.length, 1);
  assert.equal(fake.raw.events.length, 1);
  assert.equal(fake.raw.calls.completeEvent, 1);
});

test("webhook: an unknown event type is persisted but ignored", async () => {
  const fake = createFakeRepository();
  const processor = new BillingEventProcessor(
    billingEnvironment as unknown as ConstructorParameters<typeof BillingEventProcessor>[0],
    fake.repository,
  );
  const body = JSON.stringify({
    event_id: "evt_unknown",
    event_type: "report.created",
    occurred_at: "2026-09-15T10:06:00.000Z",
    data: { id: "rep_1" },
  });
  const service = new BillingWebhookService(billingEnvironment, fake.repository, processor, {});
  const result = await service.handle(body, paddleSignature(body, WEBHOOK_SECRET));
  assert.equal(result.processing?.status, "IGNORED");
  assert.equal(fake.raw.events[0]?.status, "IGNORED");
  assert.equal(fake.raw.subscriptions.length, 0);
});

test("webhook: an older delivery cannot overwrite newer subscription state", async () => {
  const fake = createFakeRepository();
  const processor = new BillingEventProcessor(
    billingEnvironment as unknown as ConstructorParameters<typeof BillingEventProcessor>[0],
    fake.repository,
  );
  const service = new BillingWebhookService(billingEnvironment, fake.repository, processor, {});

  const newer = subscriptionEventBody({
    eventId: "evt_newer",
    occurredAt: "2026-09-15T10:05:00.000Z",
  });
  await service.handle(newer, paddleSignature(newer, WEBHOOK_SECRET));
  assert.equal(
    fake.raw.subscriptions[0]?.currentPeriodEnd?.toISOString(),
    "2026-10-10T00:00:00.000Z",
  );

  // A stale event claiming a different status must not be applied.
  const olderBody = JSON.stringify({
    event_id: "evt_older",
    event_type: "subscription.updated",
    occurred_at: "2026-09-15T10:03:00.000Z",
    data: {
      id: "sub_1",
      status: "past_due",
      customer_id: "ctm_1",
      current_billing_period: {
        starts_at: "2026-01-01T00:00:00.000Z",
        ends_at: "2026-01-31T00:00:00.000Z",
      },
      billing_cycle: { interval: "month", frequency: 1 },
      scheduled_change: null,
      items: [{ price: { id: MONTHLY_PRICE }, product: { id: PRO_PRODUCT } }],
      custom_data: { user_id: USER },
    },
  });
  const result = await service.handle(olderBody, paddleSignature(olderBody, WEBHOOK_SECRET));
  assert.equal(result.processing?.status, "IGNORED");
  assert.equal(fake.raw.subscriptions[0]?.status, "ACTIVE");
  assert.equal(
    fake.raw.subscriptions[0]?.currentPeriodEnd?.toISOString(),
    "2026-10-10T00:00:00.000Z",
  );
});

test("webhook: a subscription can never be attached to a second account", async () => {
  const fake = createFakeRepository();
  const processor = new BillingEventProcessor(
    billingEnvironment as unknown as ConstructorParameters<typeof BillingEventProcessor>[0],
    fake.repository,
  );
  const service = new BillingWebhookService(billingEnvironment, fake.repository, processor, {});

  const first = subscriptionEventBody({ eventId: "evt_owner" });
  await service.handle(first, paddleSignature(first, WEBHOOK_SECRET));
  assert.equal(fake.raw.subscriptions[0]?.userId, USER);

  const hostile = subscriptionEventBody({
    eventId: "evt_hostile",
    occurredAt: "2026-09-15T10:09:00.000Z",
  });
  const hostileBody = JSON.parse(hostile) as { data: { custom_data: { user_id: string } } };
  hostileBody.data.custom_data.user_id = OTHER_USER;
  const payload = JSON.stringify(hostileBody);
  const result = await service.handle(payload, paddleSignature(payload, WEBHOOK_SECRET));
  assert.equal(result.processing?.status, "IGNORED");
  assert.equal(fake.raw.subscriptions.length, 1);
  assert.equal(fake.raw.subscriptions[0]?.userId, USER);
});

test("webhook: a customer already associated with another account is not reassigned", async () => {
  const fake = createFakeRepository();
  fake.raw.customers.push({ userId: USER, providerCustomerId: "ctm_1" });
  const processor = new BillingEventProcessor(
    billingEnvironment as unknown as ConstructorParameters<typeof BillingEventProcessor>[0],
    fake.repository,
  );
  const body = JSON.stringify({
    event_id: "evt_customer",
    event_type: "customer.updated",
    occurred_at: "2026-09-15T10:07:00.000Z",
    data: { id: "ctm_1", custom_data: { user_id: OTHER_USER } },
  });
  const service = new BillingWebhookService(billingEnvironment, fake.repository, processor, {});
  const result = await service.handle(body, paddleSignature(body, WEBHOOK_SECRET));
  assert.equal(result.processing?.status, "IGNORED");
  assert.equal(fake.raw.customers[0]?.userId, USER);
});

test("webhook: a failing processor marks the event failed instead of dropping it", async () => {
  const fake = createFakeRepository();
  fake.raw.applySubscriptionSync = async () => {
    throw new Error("downstream unavailable");
  };
  const processor = new BillingEventProcessor(
    billingEnvironment as unknown as ConstructorParameters<typeof BillingEventProcessor>[0],
    fake.repository,
  );
  const body = subscriptionEventBody({ eventId: "evt_fail" });
  const result = await processor.process(
    (await fake.repository.createEvent({
      providerEventId: "evt_fail",
      eventType: "subscription.updated",
      occurredAt: new Date("2026-09-15T10:05:00.000Z"),
      payload: (
        await verifyPaddleWebhook(webhookEnvironment, body, paddleSignature(body, WEBHOOK_SECRET))
      ).payload,
      userId: null,
      subscriptionId: null,
    }))!.id,
  );
  assert.equal(result.status, "FAILED");
  assert.equal(fake.raw.events[0]?.status, "FAILED");
  assert.equal(fake.raw.calls.failEvent, 1);
});

/* ------------------------------------------------------------------------- */
/* H. Provider event mapping                                                  */
/* ------------------------------------------------------------------------- */

test("provider events: subscription lifecycle events map to one sync intent", () => {
  for (const eventType of [
    "subscription.created",
    "subscription.updated",
    "subscription.activated",
    "subscription.trialing",
    "subscription.past_due",
    "subscription.paused",
    "subscription.resumed",
    "subscription.canceled",
  ]) {
    assert.equal(isSubscriptionSyncEvent(eventType), true);
  }
  assert.equal(isSubscriptionSyncEvent("transaction.completed"), false);
});

test("provider events: an unrecognized subscription status is refused, never guessed", () => {
  // Facts are the SDK's camelCase entities, not raw webhook bytes.
  const facts = toSubscriptionFacts({
    id: "sub_1",
    status: "some_future_status",
    customerId: "ctm_1",
    items: [],
  });
  assert.equal(facts, null);
  const intent = toBillingIntent({
    eventType: "subscription.updated",
    occurredAt: "2026-09-15T10:05:00.000Z",
    data: { id: "sub_1", status: "some_future_status", customerId: "ctm_1", items: [] },
  });
  assert.equal(intent.kind, "IGNORED");
});

test("provider events: scheduled cancellation is separate from status", () => {
  const facts = toSubscriptionFacts({
    id: "sub_1",
    status: "active",
    customerId: "ctm_1",
    currentBillingPeriod: {
      startsAt: "2026-09-10T00:00:00.000Z",
      endsAt: "2026-10-10T00:00:00.000Z",
    },
    billingCycle: { interval: "year", frequency: 1 },
    scheduledChange: { action: "cancel", effectiveAt: "2026-10-10T00:00:00.000Z" },
    items: [{ price: { id: MONTHLY_PRICE }, product: { id: PRO_PRODUCT } }],
    customData: { user_id: USER },
  });
  assert.equal(facts?.status, "ACTIVE");
  assert.equal(facts?.cancelAtPeriodEnd, true);
  assert.deepEqual(facts?.scheduledChange, {
    action: "cancel",
    effectiveAt: "2026-10-10T00:00:00.000Z",
  });
  assert.equal(facts?.customDataUserId, USER);
  assert.equal(intervalFromBillingCycle("year"), "YEAR");
  assert.equal(intervalFromBillingCycle("week"), null);
});

test("provider events: transaction and customer events carry the association", () => {
  const intent = toBillingIntent({
    eventType: "transaction.completed",
    occurredAt: "2026-09-15T10:05:00.000Z",
    data: {
      id: "txn_1",
      customerId: "ctm_9",
      subscriptionId: "sub_9",
      customData: { user_id: USER },
    },
  });
  assert.equal(intent.kind, "CUSTOMER_ASSOCIATION");
  if (intent.kind === "CUSTOMER_ASSOCIATION") {
    assert.equal(intent.providerCustomerId, "ctm_9");
    assert.equal(intent.userId, USER);
    assert.equal(intent.providerSubscriptionId, "sub_9");
  }
});

test("provider events: the configured product id is a fallback for an unmapped price", () => {
  const facts = toSubscriptionFacts({
    id: "sub_1",
    status: "active",
    customerId: "ctm_1",
    billingCycle: { interval: "year", frequency: 1 },
    scheduledChange: null,
    items: [{ price: { id: "pri_replaced" }, product: { id: PRO_PRODUCT } }],
    customData: null,
  });
  assert.ok(facts);
  assert.deepEqual(
    resolveSubscriptionPlan(
      {
        ...priceEnvironment,
        PADDLE_PRO_PRODUCT_ID: PRO_PRODUCT,
      } as unknown as ConstructorParameters<typeof BillingEventProcessor>[0],
      facts,
    ),
    { plan: "PRO", interval: "YEAR" },
  );
  const unknown = toSubscriptionFacts({
    id: "sub_1",
    status: "active",
    customerId: "ctm_1",
    scheduledChange: null,
    items: [{ price: { id: "pri_other" }, product: { id: "prod_other" } }],
    customData: null,
  });
  assert.ok(unknown);
  assert.equal(
    resolveSubscriptionPlan(
      {
        ...priceEnvironment,
        PADDLE_PRO_PRODUCT_ID: PRO_PRODUCT,
      } as unknown as ConstructorParameters<typeof BillingEventProcessor>[0],
      unknown,
    ),
    null,
  );
});

/* ------------------------------------------------------------------------- */
/* I. Repository ordering and association (fake Prisma with real semantics)   */
/* ------------------------------------------------------------------------- */

type StoredSubscription = SubscriptionRow & { scheduledChange?: unknown };

function fakePrisma(
  subscriptions: StoredSubscription[],
  customers: Array<{ userId: string; providerCustomerId: string }>,
) {
  return {
    subscription: {
      async findFirst({ where }: { where: { providerSubscriptionId?: string; userId?: string } }) {
        if (where.providerSubscriptionId) {
          return (
            subscriptions.find(
              (row) => row.providerSubscriptionId === where.providerSubscriptionId,
            ) ?? null
          );
        }
        if (where.userId) return subscriptions.find((row) => row.userId === where.userId) ?? null;
        return null;
      },
      async findMany() {
        return subscriptions;
      },
      async updateMany({
        where,
        data,
      }: {
        where: {
          providerSubscriptionId: string;
          OR: Array<{ lastWebhookOccurredAt: null | { lte: Date } }>;
        };
        data: Partial<StoredSubscription>;
      }) {
        const cutoff = where.OR[1]?.lastWebhookOccurredAt;
        const occurredAt = typeof cutoff === "object" && cutoff ? cutoff.lte : null;
        const eligible = subscriptions.filter(
          (row) =>
            row.providerSubscriptionId === where.providerSubscriptionId &&
            (row.lastWebhookOccurredAt === null ||
              (occurredAt !== null && row.lastWebhookOccurredAt.getTime() <= occurredAt.getTime())),
        );
        for (const row of eligible) Object.assign(row, data);
        return { count: eligible.length };
      },
      async create({ data }: { data: StoredSubscription }) {
        if (
          subscriptions.some((row) => row.providerSubscriptionId === data.providerSubscriptionId)
        ) {
          throw new Error("unique constraint");
        }
        subscriptions.push({ ...data });
        return data;
      },
    },
    billingCustomer: {
      async findFirst({ where }: { where: { userId?: string; providerCustomerId?: string } }) {
        return (
          customers.find(
            (row) =>
              (where.userId ? row.userId === where.userId : true) &&
              (where.providerCustomerId
                ? row.providerCustomerId === where.providerCustomerId
                : true),
          ) ?? null
        );
      },
      async create({ data }: { data: { userId: string; providerCustomerId: string } }) {
        customers.push(data);
        return data;
      },
    },
  };
}

const syncFacts = (overrides: Partial<Record<string, unknown>> = {}) => ({
  providerSubscriptionId: "sub_1",
  providerCustomerId: "ctm_1",
  status: "ACTIVE" as const,
  priceId: MONTHLY_PRICE,
  productId: PRO_PRODUCT,
  billingCycleInterval: "month",
  currentPeriodStart: new Date("2026-09-10T00:00:00.000Z"),
  currentPeriodEnd: new Date("2026-10-10T00:00:00.000Z"),
  cancelAtPeriodEnd: false,
  scheduledChange: null,
  providerCreatedAt: null,
  providerUpdatedAt: null,
  customDataUserId: USER,
  ...overrides,
});

test("repository: a newer event applies and a stale one is refused", async () => {
  const stored: StoredSubscription[] = [
    { ...subscriptionRow(), lastWebhookOccurredAt: new Date("2026-09-15T10:05:00.000Z") },
  ];
  const repository = new BillingRepository(fakePrisma(stored, []) as unknown as PrismaClient);

  const stale = await repository.applySubscriptionSync({
    facts: syncFacts({
      status: "PAST_DUE",
      currentPeriodEnd: new Date("2026-09-01T00:00:00.000Z"),
    }),
    plan: "PRO",
    interval: "MONTH",
    userId: USER,
    occurredAt: new Date("2026-09-15T10:03:00.000Z"),
    eventType: "subscription.updated",
  });
  assert.deepEqual(stale, { applied: false, reason: "STALE_EVENT" });
  assert.equal(stored[0]?.status, "ACTIVE");

  const newer = await repository.applySubscriptionSync({
    facts: syncFacts({ cancelAtPeriodEnd: true }),
    plan: "PRO",
    interval: "MONTH",
    userId: USER,
    occurredAt: new Date("2026-09-15T10:09:00.000Z"),
    eventType: "subscription.updated",
  });
  assert.equal(newer.applied, true);
  assert.equal(stored[0]?.cancelAtPeriodEnd, true);
});

test("repository: a subscription owned by another account is not reassigned", async () => {
  const stored: StoredSubscription[] = [{ ...subscriptionRow(), lastWebhookOccurredAt: null }];
  const repository = new BillingRepository(fakePrisma(stored, []) as unknown as PrismaClient);
  const outcome = await repository.applySubscriptionSync({
    facts: syncFacts(),
    plan: "PRO",
    interval: "MONTH",
    userId: OTHER_USER,
    occurredAt: new Date("2026-09-15T10:09:00.000Z"),
    eventType: "subscription.updated",
  });
  assert.deepEqual(outcome, { applied: false, reason: "ASSOCIATION_CONFLICT" });
  assert.equal(stored.length, 1);
  assert.equal(stored[0]?.userId, USER);
});

test("repository: an unmapped price never grants paid entitlements", async () => {
  const repository = new BillingRepository(fakePrisma([], []) as unknown as PrismaClient);
  const outcome = await repository.applySubscriptionSync({
    facts: syncFacts(),
    plan: null,
    interval: null,
    userId: USER,
    occurredAt: new Date("2026-09-15T10:09:00.000Z"),
    eventType: "subscription.updated",
  });
  assert.deepEqual(outcome, { applied: false, reason: "UNMAPPED_PRICE" });
});

test("repository: the event log rejects a duplicate provider event id", async () => {
  const fake = createFakeRepository();
  const input = {
    providerEventId: "evt_1",
    eventType: "subscription.updated",
    occurredAt: new Date("2026-09-15T10:05:00.000Z"),
    payload: {},
    userId: null,
    subscriptionId: null,
  };
  assert.ok(await fake.repository.createEvent(input));
  assert.equal(await fake.repository.createEvent(input), null);
  assert.equal(fake.raw.events.length, 1);
});

/* ------------------------------------------------------------------------- */
/* J. Checkout: the server decides what a plan means                          */
/* ------------------------------------------------------------------------- */

test("checkout: a plan without a configured price cannot be purchased", async () => {
  const fake = createFakeRepository();
  const entitlements = new EntitlementService(fake.repository);
  const usage = new UsageService(fake.repository, entitlements);
  const service = new BillingService(
    {
      ...billingEnvironment,
      PADDLE_PRO_MONTHLY_PRICE_ID: undefined,
      PADDLE_PRO_YEARLY_PRICE_ID: undefined,
    } as unknown as ServerEnvironment,
    fake.repository,
    entitlements,
    usage,
  );
  const error = await service.createCheckout(USER, { plan: "PRO", interval: "MONTH" }).then(
    () => null,
    (thrown: unknown) => thrown,
  );
  assert.ok(error instanceof BillingError);
  assert.equal(error.code, "PLAN_NOT_PURCHASABLE");
  assert.equal(error.httpStatus, 400);
});

test("checkout: with a price configured but no API key, billing reports itself unconfigured", async () => {
  const fake = createFakeRepository();
  const entitlements = new EntitlementService(fake.repository);
  const usage = new UsageService(fake.repository, entitlements);
  const service = new BillingService(
    { ...billingEnvironment, PADDLE_API_KEY: undefined } as unknown as ServerEnvironment,
    fake.repository,
    entitlements,
    usage,
  );
  const error = await service.createCheckout(USER, { plan: "PRO", interval: "MONTH" }).then(
    () => null,
    (thrown: unknown) => thrown,
  );
  assert.ok(error instanceof BillingError);
  assert.equal(error.code, "BILLING_NOT_CONFIGURED");
});

test("checkout: only server-known plans and intervals validate", () => {
  assert.equal(
    billingCheckoutRequestSchema.safeParse({ plan: "PRO", interval: "MONTH" }).success,
    true,
  );
  assert.equal(
    billingCheckoutRequestSchema.safeParse({ plan: "ENTERPRISE", interval: "MONTH" }).success,
    false,
  );
  assert.equal(
    billingCheckoutRequestSchema.safeParse({ plan: "PRO", interval: "WEEK" }).success,
    false,
  );
});

test("checkout: the portal requires an existing provider customer", async () => {
  const fake = createFakeRepository();
  const entitlements = new EntitlementService(fake.repository);
  const usage = new UsageService(fake.repository, entitlements);
  const service = new BillingService(billingEnvironment, fake.repository, entitlements, usage);
  const error = await service.createPortalSession(USER).then(
    () => null,
    (thrown: unknown) => thrown,
  );
  assert.ok(error instanceof BillingError);
  assert.equal(error.code, "BILLING_CUSTOMER_REQUIRED");
  assert.equal(error.httpStatus, 409);
});

/* ------------------------------------------------------------------------- */
/* K. Count-based caps and error shape                                        */
/* ------------------------------------------------------------------------- */

test("entitlements: the active target cap is enforced server-side", async () => {
  const fake = createFakeRepository();
  const entitlements = new EntitlementService(fake.repository);
  assert.deepEqual(await entitlements.requireCareerTargetCapacity(USER, NOW), {
    active: 0,
    limit: 1,
  });
  fake.state.activeTargets = 1;
  const error = await entitlements.requireCareerTargetCapacity(USER, NOW).then(
    () => null,
    (thrown: unknown) => thrown,
  );
  assert.ok(error instanceof BillingError);
  assert.equal(error.code, "CAREER_TARGET_LIMIT_REACHED");
  assert.equal(error.httpStatus, 402);
});

test("entitlements: requireFeature throws a structured feature error for free users", async () => {
  const fake = createFakeRepository();
  const entitlements = new EntitlementService(fake.repository);
  const error = await entitlements.requireFeature(USER, "PERFORMANCE_ANALYTICS", NOW).then(
    () => null,
    (thrown: unknown) => thrown,
  );
  assert.ok(error instanceof BillingError);
  assert.equal(error.code, "ENTITLEMENT_REQUIRED");
  assert.equal(error.httpStatus, 403);
  assert.deepEqual(error.details, {
    feature: "PERFORMANCE_ANALYTICS",
    plan: "FREE",
    upgradeAvailable: true,
  });
  // A free plan keeps readiness, so that check resolves instead of throwing.
  const access = await entitlements.requireFeature(USER, "READINESS_ASSESSMENT", NOW);
  assert.equal(access.plan, "FREE");
});

test("errors: internal provider detail never leaks into client payloads", () => {
  const errors = [
    planNotPurchasableError("PRO"),
    entitlementError("SKILL_PROFILE", "FREE"),
    careerTargetLimitError(1, 1, "FREE"),
  ];
  for (const error of errors) {
    const serialized = JSON.stringify({ message: error.message, details: error.details ?? {} });
    assert.equal(/pri_|ctm_|sk_|api_key|secret/i.test(serialized), false);
  }
});
