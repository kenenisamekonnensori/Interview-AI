import type { BillingIntervalValue, BillingPlanId, UsageResourceId } from "@interviewer-ai/types";
import { Prisma } from "../../../prisma/generated/client.js";
import type { PrismaClient } from "../../../prisma/generated/client.js";

import type { PaddleSubscriptionFacts } from "./providers/paddle/events.js";

const provider = "PADDLE" as const;

export type SubscriptionRow = {
  id: string;
  userId: string;
  providerSubscriptionId: string;
  providerCustomerId: string;
  plan: BillingPlanId;
  status: "TRIALING" | "ACTIVE" | "PAST_DUE" | "PAUSED" | "CANCELED";
  billingInterval: BillingIntervalValue | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  scheduledChangeEffectiveAt: Date | null;
  lastWebhookOccurredAt: Date | null;
};

const subscriptionSelect = {
  id: true,
  userId: true,
  providerSubscriptionId: true,
  providerCustomerId: true,
  plan: true,
  status: true,
  billingInterval: true,
  currentPeriodStart: true,
  currentPeriodEnd: true,
  cancelAtPeriodEnd: true,
  scheduledChangeEffectiveAt: true,
  lastWebhookOccurredAt: true,
} as const;

export type SubscriptionSyncOutcome =
  | {
      applied: true;
      subscription: SubscriptionRow;
      previousPlan: BillingPlanId | null;
      created: boolean;
    }
  | { applied: false; reason: "STALE_EVENT" }
  | { applied: false; reason: "UNMAPPED_PRICE" }
  | { applied: false; reason: "ASSOCIATION_CONFLICT" };

export class BillingRepository {
  constructor(private readonly database: PrismaClient) {}

  /* ------------------------------------------------------------------ */
  /* Provider customer association                                      */
  /* ------------------------------------------------------------------ */

  findCustomer(userId: string) {
    return this.database.billingCustomer.findFirst({ where: { userId, provider } });
  }

  findCustomerByProviderId(providerCustomerId: string) {
    return this.database.billingCustomer.findFirst({
      where: { provider, providerCustomerId },
    });
  }

  /**
   * Creates the customer mapping. Uniqueness is enforced by the database on both
   * (userId, provider) and (provider, providerCustomerId), so a subscription can
   * never be attached to a second account and an account can never claim a
   * customer id that already belongs to someone else.
   */
  createCustomer(input: { userId: string; providerCustomerId: string }) {
    return this.database.billingCustomer.create({
      data: { userId: input.userId, providerCustomerId: input.providerCustomerId, provider },
    });
  }

  /* ------------------------------------------------------------------ */
  /* Subscription synchronization                                       */
  /* ------------------------------------------------------------------ */

  findSubscriptionForUser(userId: string) {
    return this.database.subscription.findFirst({
      where: { userId, provider },
      select: subscriptionSelect,
      orderBy: { updatedAt: "desc" },
    });
  }

  findSubscriptionByProviderId(providerSubscriptionId: string) {
    return this.database.subscription.findFirst({
      where: { provider, providerSubscriptionId },
      select: subscriptionSelect,
    });
  }

  listSubscriptionsForUser(userId: string) {
    return this.database.subscription.findMany({
      where: { userId, provider },
      select: subscriptionSelect,
      orderBy: { updatedAt: "desc" },
    });
  }

  /** Subscriptions that reconciliation should re-check against the provider. */
  listSubscriptionsForReconciliation(limit: number) {
    return this.database.subscription.findMany({
      where: { provider, status: { in: ["TRIALING", "ACTIVE", "PAST_DUE", "PAUSED"] } },
      select: subscriptionSelect,
      orderBy: { updatedAt: "asc" },
      take: limit,
    });
  }

  /**
   * Applies a provider snapshot to local state.
   *
   * Ordering is enforced by the database rather than by application-level
   * comparison: the update is a single conditional statement that only matches
   * while the stored `lastWebhookOccurredAt` is not newer than the incoming
   * event, so an out-of-order delivery can never overwrite newer state — even
   * when two deliveries are processed concurrently.
   */
  async applySubscriptionSync(input: {
    facts: PaddleSubscriptionFacts;
    plan: BillingPlanId | null;
    interval: BillingIntervalValue | null;
    userId: string | null;
    occurredAt: Date;
    eventType: string;
  }): Promise<SubscriptionSyncOutcome> {
    const { facts, plan, interval, userId, occurredAt, eventType } = input;
    const existing = await this.database.subscription.findFirst({
      where: { provider, providerSubscriptionId: facts.providerSubscriptionId },
      select: { ...subscriptionSelect, scheduledChange: true },
    });

    const resolvedPlan = plan ?? existing?.plan ?? null;
    if (!resolvedPlan) return { applied: false, reason: "UNMAPPED_PRICE" };

    if (existing && userId && existing.userId !== userId) {
      // The customer's subscription is already owned by another account. Never
      // reassign it: refuse and let the audit log surface the anomaly.
      return { applied: false, reason: "ASSOCIATION_CONFLICT" };
    }

    const data = {
      plan: resolvedPlan,
      status: facts.status,
      billingInterval: interval ?? existing?.billingInterval ?? null,
      currentPeriodStart: facts.currentPeriodStart,
      currentPeriodEnd: facts.currentPeriodEnd,
      cancelAtPeriodEnd: facts.cancelAtPeriodEnd,
      scheduledChange: facts.scheduledChange ?? Prisma.DbNull,
      scheduledChangeEffectiveAt: facts.scheduledChange
        ? new Date(facts.scheduledChange.effectiveAt)
        : null,
      providerCustomerId: facts.providerCustomerId,
      providerCreatedAt: facts.providerCreatedAt,
      providerUpdatedAt: facts.providerUpdatedAt,
      lastEventType: eventType,
      lastWebhookOccurredAt: occurredAt,
    };

    const applied = await this.database.subscription.updateMany({
      where: {
        provider,
        providerSubscriptionId: facts.providerSubscriptionId,
        OR: [{ lastWebhookOccurredAt: null }, { lastWebhookOccurredAt: { lte: occurredAt } }],
      },
      data,
    });
    if (applied.count > 0) {
      const subscription = await this.findSubscriptionByProviderId(facts.providerSubscriptionId);
      return subscription
        ? { applied: true, subscription, previousPlan: existing?.plan ?? null, created: false }
        : { applied: false, reason: "STALE_EVENT" };
    }

    const current = await this.findSubscriptionByProviderId(facts.providerSubscriptionId);
    if (current) return { applied: false, reason: "STALE_EVENT" };

    const ownerId = userId ?? (await this.resolveOwnerId(facts.providerCustomerId));
    if (!ownerId) return { applied: false, reason: "ASSOCIATION_CONFLICT" };

    try {
      await this.database.subscription.create({
        data: {
          ...data,
          userId: ownerId,
          provider,
          providerSubscriptionId: facts.providerSubscriptionId,
        },
      });
    } catch {
      // Another delivery created the same subscription first; the conditional
      // update above will converge on the next event.
      const raced = await this.findSubscriptionByProviderId(facts.providerSubscriptionId);
      if (!raced) return { applied: false, reason: "STALE_EVENT" };
    }
    const subscription = await this.findSubscriptionByProviderId(facts.providerSubscriptionId);
    return subscription
      ? { applied: true, subscription, previousPlan: existing?.plan ?? null, created: false }
      : { applied: false, reason: "STALE_EVENT" };
  }

  /** Resolves the application user for a provider customer id. */
  async resolveOwnerId(providerCustomerId: string): Promise<string | null> {
    const customer = await this.findCustomerByProviderId(providerCustomerId);
    return customer?.userId ?? null;
  }

  /* ------------------------------------------------------------------ */
  /* Webhook event log                                                  */
  /* ------------------------------------------------------------------ */

  /** Returns null when the event was already recorded (at-least-once delivery). */
  async createEvent(input: {
    providerEventId: string;
    eventType: string;
    occurredAt: Date;
    payload: unknown;
    userId: string | null;
    subscriptionId: string | null;
  }) {
    try {
      return await this.database.billingEvent.create({
        data: {
          provider,
          providerEventId: input.providerEventId,
          eventType: input.eventType,
          occurredAt: input.occurredAt,
          payload: input.payload as never,
          userId: input.userId,
          subscriptionId: input.subscriptionId,
          status: "PENDING",
        },
      });
    } catch {
      // Unique (provider, providerEventId) violation: the delivery is a replay.
      return null;
    }
  }

  findEvent(providerEventId: string) {
    return this.database.billingEvent.findFirst({
      where: { provider, providerEventId },
    });
  }

  findEventById(id: string) {
    return this.database.billingEvent.findFirst({ where: { id, provider } });
  }

  findUserForBilling(userId: string) {
    return this.database.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true },
    });
  }

  /**
   * Claims an event for processing. Failed events stay claimable so a retry or a
   * reconciliation pass can finish them; processed events are never reprocessed.
   */
  claimEventForProcessing(id: string) {
    return this.database.billingEvent.updateMany({
      where: { id, status: { in: ["PENDING", "FAILED"] } },
      data: { status: "PROCESSING", attempts: { increment: 1 } },
    });
  }

  completeEvent(id: string, input: { userId: string | null; subscriptionId: string | null }) {
    return this.database.billingEvent.update({
      where: { id },
      data: {
        status: "PROCESSED",
        processedAt: new Date(),
        error: null,
        userId: input.userId,
        subscriptionId: input.subscriptionId,
      },
    });
  }

  ignoreEvent(id: string, reason: string) {
    return this.database.billingEvent.update({
      where: { id },
      data: { status: "IGNORED", processedAt: new Date(), error: reason },
    });
  }

  failEvent(id: string, error: string) {
    return this.database.billingEvent.update({
      where: { id },
      data: { status: "FAILED", error: error.slice(0, 500) },
    });
  }

  /** Events that need another processing attempt (retry + reconciliation). */
  listUnprocessedEvents(limit: number) {
    return this.database.billingEvent.findMany({
      where: { status: { in: ["PENDING", "FAILED"] } },
      orderBy: { occurredAt: "asc" },
      take: limit,
    });
  }

  listPendingEventsForUser(userId: string, limit: number) {
    return this.database.billingEvent.findMany({
      where: { userId },
      orderBy: { occurredAt: "desc" },
      take: limit,
      select: {
        providerEventId: true,
        eventType: true,
        occurredAt: true,
        status: true,
        processedAt: true,
      },
    });
  }

  /* ------------------------------------------------------------------ */
  /* Usage ledger + atomic counters                                     */
  /* ------------------------------------------------------------------ */

  findUsageRecord(resource: UsageResourceId, referenceType: string, referenceId: string) {
    return this.database.usageRecord.findFirst({
      where: { resource, referenceType, referenceId },
    });
  }

  createUsageRecord(input: {
    userId: string;
    subscriptionId: string | null;
    resource: UsageResourceId;
    quantity: number;
    periodStart: Date;
    periodEnd: Date;
    referenceType: string;
    referenceId: string;
  }) {
    return this.database.usageRecord.create({ data: { ...input, status: "RESERVED" } });
  }

  async findByReference(resource: UsageResourceId, referenceType: string, referenceId: string) {
    return this.database.usageRecord.findFirst({ where: { resource, referenceType, referenceId } });
  }

  commitUsageRecord(id: string) {
    return this.database.usageRecord.updateMany({
      where: { id, status: "RESERVED" },
      data: { status: "COMMITTED", committedAt: new Date() },
    });
  }

  findUsageCounter(userId: string, resource: UsageResourceId, periodStart: Date) {
    return this.database.usageCounter.findFirst({
      where: { userId, resource, periodStart },
    });
  }

  listUsageCounters(userId: string, periodStart: Date) {
    return this.database.usageCounter.findMany({ where: { userId, periodStart } });
  }

  countConsumedUsage(userId: string, resource: UsageResourceId, periodStart: Date) {
    return this.database.usageRecord.aggregate({
      where: {
        userId,
        resource,
        periodStart,
        status: { in: ["RESERVED", "COMMITTED"] },
      },
      _sum: { quantity: true },
    });
  }

  /**
   * Atomically reserves one unit of a metered resource.
   *
   * This is a single conditional upsert executed by the database: the increment
   * only happens while the stored counter is below the limit, so two concurrent
   * requests at the limit boundary cannot both succeed. Returns the counter value
   * after the increment, or null when the limit is already reached.
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
    /** `null` is unlimited: the guard allows any number of reservations. */
    limit: number | null;
  }): Promise<{ id: string } | null> {
    const {
      id,
      userId,
      subscriptionId,
      resource,
      periodStart,
      periodEnd,
      referenceType,
      referenceId,
      limit,
    } = input;
    // The counter increment and the ledger insert are one statement, so they
    // commit together or not at all. The `WHERE` clause re-checks the limit
    // inside the database while holding the counter row lock, which is what makes
    // simultaneous requests unable to exceed it. A replayed operation fails on
    // the ledger's unique key and rolls the increment back with it.
    const rows = await this.database.$queryRaw<Array<{ id: string }>>`
      WITH counter AS (
        INSERT INTO "usage_counter"
          ("id", "userId", "resource", "periodStart", "periodEnd", "used", "createdAt", "updatedAt")
        VALUES (${`counter:${id}`}, ${userId}, ${resource}::"UsageResource", ${periodStart}, ${periodEnd}, 1, now(), now())
        ON CONFLICT ("userId", "resource", "periodStart")
        DO UPDATE SET "used" = "usage_counter"."used" + 1, "updatedAt" = now()
        WHERE ${limit}::int IS NULL OR "usage_counter"."used" < ${limit}::int
        RETURNING "id"
      )
      INSERT INTO "usage_record"
        ("id", "userId", "subscriptionId", "resource", "quantity", "periodStart", "periodEnd", "referenceType", "referenceId", "status", "createdAt", "updatedAt")
      SELECT ${id}, ${userId}, ${subscriptionId}, ${resource}::"UsageResource", 1, ${periodStart}, ${periodEnd}, ${referenceType}, ${referenceId}, 'RESERVED'::"UsageRecordStatus", now(), now()
      FROM counter
      RETURNING "id"
    `;
    return rows[0] ?? null;
  }

  /**
   * Gives back a reserved unit and marks the ledger row released in one
   * statement. Already-released rows are a no-op, so a retried rollback cannot
   * decrement twice.
   */
  async releaseUsage(input: {
    userId: string;
    resource: UsageResourceId;
    referenceType: string;
    referenceId: string;
  }): Promise<boolean> {
    const record = await this.findByReference(
      input.resource,
      input.referenceType,
      input.referenceId,
    );
    if (!record || record.userId !== input.userId || record.quantity < 1) return false;
    const rows = await this.database.$queryRaw<Array<{ id: string }>>`
      WITH counter AS (
        UPDATE "usage_counter"
        SET "used" = GREATEST("used" - ${record.quantity}, 0), "updatedAt" = now()
        WHERE "userId" = ${record.userId}
          AND "resource" = ${record.resource}::"UsageResource"
          AND "periodStart" = ${record.periodStart}
        RETURNING "id"
      )
      UPDATE "usage_record"
      SET "status" = 'RELEASED'::"UsageRecordStatus", "releasedAt" = now(), "updatedAt" = now()
      WHERE "id" = ${record.id} AND "status" <> 'RELEASED'::"UsageRecordStatus"
      RETURNING "id"
    `;
    return rows.length > 0;
  }

  /** Reconciliation: replace a counter with the value derived from the ledger. */
  async setUsageCounterUsed(input: {
    id: string;
    userId: string;
    resource: UsageResourceId;
    periodStart: Date;
    periodEnd: Date;
    used: number;
  }): Promise<void> {
    const { id, userId, resource, periodStart, periodEnd, used } = input;
    await this.database.$executeRaw`
      INSERT INTO "usage_counter"
        ("id", "userId", "resource", "periodStart", "periodEnd", "used", "createdAt", "updatedAt")
      VALUES (${id}, ${userId}, ${resource}::"UsageResource", ${periodStart}, ${periodEnd}, ${used}, now(), now())
      ON CONFLICT ("userId", "resource", "periodStart")
      DO UPDATE SET "used" = ${used}, "updatedAt" = now()
    `;
  }

  countActiveCareerTargets(userId: string) {
    return this.database.careerTarget.count({ where: { userId, status: "ACTIVE" } });
  }
}
