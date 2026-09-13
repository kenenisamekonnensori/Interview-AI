import { randomUUID } from "node:crypto";

import { usageResources, type UsageResourceId, type UsageStatus } from "@interviewer-ai/types";

import { BillingError, usageLimitError } from "./domain/errors.js";
import { usagePeriodFor, type UsagePeriod } from "./domain/usage-period.js";
import type { EntitlementService } from "./entitlement-service.js";
import type { BillingRepository } from "./repository.js";
import { observability } from "../../services/observability.js";

export type UsageReservation = {
  resource: UsageResourceId;
  referenceType: string;
  referenceId: string;
  periodStart: Date;
  periodEnd: Date;
  /** True when this operation had already been counted, so nothing was consumed again. */
  duplicate: boolean;
  limit: number | null;
  used: number;
};

export type UsageIdentifier = {
  userId: string;
  resource: UsageResourceId;
  /**
   * Stable pointer to the application operation that caused the usage, e.g.
   * `INTERVIEW:<interviewId>`. Together with `referenceId` it is the idempotency
   * key that stops retries from double-consuming.
   */
  referenceType: string;
  referenceId: string;
};

/**
 * Usage is server-authoritative and only ever changed by server operations that
 * carry a stable reference. Clients can neither report usage nor reset it; the
 * browser's view of usage is always a read of this table.
 *
 * Lifecycle for a metered interview:
 *   reserve   → when the interview is created (the user asked for one)
 *   commit    → when the session actually starts
 *   release   → when the interview is cancelled or fails before it starts
 * A retried or duplicated operation hits the ledger's unique key and consumes
 * nothing further.
 */
export class UsageService {
  constructor(
    private readonly repository: BillingRepository,
    private readonly entitlements: EntitlementService,
  ) {}

  async periodFor(userId: string, now: Date = new Date()): Promise<UsagePeriod> {
    const { subscription } = await this.entitlements.accessFor(userId, now);
    return usagePeriodFor(subscription, now);
  }

  async statusFor(
    userId: string,
    resource: UsageResourceId,
    now: Date = new Date(),
  ): Promise<UsageStatus> {
    const { access, subscription } = await this.entitlements.accessFor(userId, now);
    const period = usagePeriodFor(subscription, now);
    const limit = access.entitlements.limits[resource];
    const counter = await this.repository.findUsageCounter(userId, resource, period.start);
    return toStatus(resource, counter?.used ?? 0, limit, period);
  }

  async status(userId: string, now: Date = new Date()): Promise<UsageStatus[]> {
    const { access, subscription } = await this.entitlements.accessFor(userId, now);
    const period = usagePeriodFor(subscription, now);
    const counters = await this.repository.listUsageCounters(userId, period.start);
    return usageResources.map((resource) => {
      const limit = access.entitlements.limits[resource];
      const used = counters.find((counter) => counter.resource === resource)?.used ?? 0;
      return toStatus(resource, used, limit, period);
    });
  }

  /**
   * Atomically reserves one unit and records it against the operation reference.
   * Throws a structured `USAGE_LIMIT_REACHED` error (with current usage, limit,
   * plan, and period end) when the plan allowance is exhausted.
   */
  async reserve(input: UsageIdentifier, now: Date = new Date()): Promise<UsageReservation> {
    const { access, subscription } = await this.entitlements.accessFor(input.userId, now);
    const limit = access.entitlements.limits[input.resource];
    const period = usagePeriodFor(subscription, now);

    const existing = await this.repository.findByReference(
      input.resource,
      input.referenceType,
      input.referenceId,
    );
    if (existing && existing.userId === input.userId) {
      return {
        ...input,
        periodStart: existing.periodStart,
        periodEnd: existing.periodEnd,
        duplicate: true,
        limit,
        used: await this.currentUsage(input.userId, input.resource, existing.periodStart),
      };
    }

    let recordId: string | null = null;
    try {
      const record = await this.repository.reserveUsage({
        id: randomUUID(),
        userId: input.userId,
        subscriptionId: subscription?.id ?? null,
        resource: input.resource,
        periodStart: period.start,
        periodEnd: period.end,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        limit,
      });
      recordId = record?.id ?? null;
    } catch (error) {
      // A concurrent identical request won the ledger's unique key. That is a
      // replay, not a failure: report it as an existing reservation.
      const raced = await this.repository.findByReference(
        input.resource,
        input.referenceType,
        input.referenceId,
      );
      if (raced) {
        return {
          ...input,
          periodStart: raced.periodStart,
          periodEnd: raced.periodEnd,
          duplicate: true,
          limit,
          used: await this.currentUsage(input.userId, input.resource, raced.periodStart),
        };
      }
      throw error;
    }

    if (!recordId) {
      if (limit === null) {
        // Unreachable: an unlimited allowance has no failing guard. Surfaced as a
        // billing error rather than silently granting unbounded usage.
        throw new BillingError(
          "BILLING_PROVIDER_UNAVAILABLE",
          "Usage could not be recorded. Please try again.",
          503,
        );
      }
      const used = await this.currentUsage(input.userId, input.resource, period.start);
      observability().event("billing.usage.limit_reached", {
        userId: input.userId,
        resource: input.resource,
        used,
        limit,
        plan: access.plan,
      });
      throw usageLimitError(input.resource, used, limit, access.plan, period.end);
    }

    return {
      ...input,
      periodStart: period.start,
      periodEnd: period.end,
      duplicate: false,
      limit,
      used: await this.currentUsage(input.userId, input.resource, period.start),
    };
  }

  /** Marks the reserved usage as actually consumed. Idempotent. */
  async commit(input: UsageIdentifier): Promise<boolean> {
    const record = await this.repository.findByReference(
      input.resource,
      input.referenceType,
      input.referenceId,
    );
    if (!record || record.userId !== input.userId) return false;
    const updated = await this.repository.commitUsageRecord(record.id);
    return updated.count > 0 || record.status === "COMMITTED";
  }

  /** Gives the unit back when the operation ends without being used. Idempotent. */
  async release(input: UsageIdentifier): Promise<boolean> {
    return this.repository.releaseUsage(input);
  }

  private async currentUsage(
    userId: string,
    resource: UsageResourceId,
    periodStart: Date,
  ): Promise<number> {
    const counter = await this.repository.findUsageCounter(userId, resource, periodStart);
    return counter?.used ?? 0;
  }

  /**
   * Repair pass: rebuilds the counters for the current window from the ledger,
   * which is the source of truth. Used by reconciliation and after incidents.
   */
  async reconcileUser(
    userId: string,
    now: Date = new Date(),
  ): Promise<Array<{ resource: UsageResourceId; before: number; after: number }>> {
    const period = await this.periodFor(userId, now);
    const drifts: Array<{ resource: UsageResourceId; before: number; after: number }> = [];
    for (const resource of usageResources) {
      const counter = await this.repository.findUsageCounter(userId, resource, period.start);
      const consumed = await this.repository.countConsumedUsage(userId, resource, period.start);
      const after = consumed._sum.quantity ?? 0;
      const before = counter?.used ?? 0;
      if (before !== after) {
        await this.repository.setUsageCounterUsed({
          id: counter?.id ?? randomUUID(),
          userId,
          resource,
          periodStart: period.start,
          periodEnd: period.end,
          used: after,
        });
        drifts.push({ resource, before, after });
      }
    }
    return drifts;
  }
}

function toStatus(
  resource: UsageResourceId,
  used: number,
  limit: number | null,
  period: UsagePeriod,
): UsageStatus {
  return {
    resource,
    used,
    limit,
    unlimited: limit === null,
    remaining: limit === null ? null : Math.max(limit - used, 0),
    periodStart: period.start.toISOString(),
    periodEnd: period.end.toISOString(),
  };
}
