import type { ServerEnvironment } from "@interviewer-ai/config";
import type { UsageResourceId } from "@interviewer-ai/types";

import { observability } from "../../services/observability.js";
import type { BillingEventProcessor } from "./billing-event-processor.js";
import { resolveSubscriptionPlan } from "./billing-event-processor.js";
import { createPaddleClient } from "./providers/paddle/client.js";
import { toSubscriptionFacts } from "./providers/paddle/events.js";
import type { BillingRepository } from "./repository.js";
import type { UsageService } from "./usage-service.js";

export type SubscriptionDrift = {
  providerSubscriptionId: string;
  fields: string[];
  repaired: boolean;
  reason?: string;
};

export type ReconciliationReport = {
  startedAt: string;
  completedAt: string;
  eventsRetried: number;
  eventsRecovered: number;
  subscriptionsChecked: number;
  subscriptionsRepaired: number;
  drift: SubscriptionDrift[];
  usageDrifts: Array<{ resource: UsageResourceId; before: number; after: number }>;
  skipped?: string;
};

export type ReconciliationOptions = {
  /** Maximum subscriptions and events to examine in one pass. */
  limit?: number;
  /** Re-derive this user's usage counters from the ledger. */
  userId?: string;
  /** Skip retrying unprocessed webhook events for a read-only audit. */
  retryEvents?: boolean;
};

/**
 * Recovery path for missed or failed synchronization.
 *
 * Webhooks are the normal mechanism; this exists so production can heal itself
 * after an outage. It retries events that never finished processing, compares
 * locally stored subscriptions against the provider, repairs drift through the
 * same order-safe sync used by webhooks, and can rebuild usage counters from the
 * ledger (the ledger is always the source of truth). It never polls the provider
 * more than once per stored subscription per run.
 */
export class BillingReconciliationService {
  constructor(
    private readonly environment: ServerEnvironment,
    private readonly repository: BillingRepository,
    private readonly processor: BillingEventProcessor,
    private readonly usage: UsageService,
  ) {}

  async reconcile(options: ReconciliationOptions = {}): Promise<ReconciliationReport> {
    const limit = Math.min(Math.max(options.limit ?? 25, 1), 200);
    const startedAt = new Date().toISOString();
    const report: ReconciliationReport = {
      startedAt,
      completedAt: startedAt,
      eventsRetried: 0,
      eventsRecovered: 0,
      subscriptionsChecked: 0,
      subscriptionsRepaired: 0,
      drift: [],
      usageDrifts: [],
    };

    if (options.retryEvents !== false) {
      const pending = await this.repository.listUnprocessedEvents(limit);
      report.eventsRetried = pending.length;
      for (const event of pending) {
        const result = await this.processor.process(event.id);
        if (result.status === "PROCESSED") report.eventsRecovered += 1;
      }
    }

    const paddle = createPaddleClient(this.environment);
    if (!paddle) {
      report.skipped = "billing_not_configured";
    } else {
      const subscriptions = await this.repository.listSubscriptionsForReconciliation(limit);
      for (const stored of subscriptions) {
        report.subscriptionsChecked += 1;
        try {
          const remote = await paddle.subscriptions.get(stored.providerSubscriptionId);
          const facts = toSubscriptionFacts(remote);
          if (!facts) {
            report.drift.push({
              providerSubscriptionId: stored.providerSubscriptionId,
              fields: [],
              repaired: false,
              reason: "unreadable_provider_state",
            });
            continue;
          }
          const resolved = resolveSubscriptionPlan(this.environment, facts);
          const fields = differingFields(
            stored,
            facts,
            resolved?.plan ?? null,
            resolved?.interval ?? null,
          );
          if (fields.length === 0) continue;

          const outcome = await this.repository.applySubscriptionSync({
            facts,
            plan: resolved?.plan ?? null,
            interval: resolved?.interval ?? null,
            userId: stored.userId,
            occurredAt: facts.providerUpdatedAt ?? new Date(),
            eventType: "reconciliation",
          });
          if (outcome.applied) report.subscriptionsRepaired += 1;
          report.drift.push({
            providerSubscriptionId: stored.providerSubscriptionId,
            fields,
            repaired: outcome.applied,
            ...(outcome.applied ? {} : { reason: outcome.reason }),
          });
          observability().event("billing.reconciliation.repaired", {
            userId: stored.userId,
            subscriptionId: stored.providerSubscriptionId,
            fields: fields.join(","),
            repaired: outcome.applied,
          });
        } catch (error) {
          report.drift.push({
            providerSubscriptionId: stored.providerSubscriptionId,
            fields: [],
            repaired: false,
            reason: "provider_unavailable",
          });
          observability().error(
            "billing.reconciliation.failed",
            { subscriptionId: stored.providerSubscriptionId },
            error instanceof Error ? error : new Error(String(error)),
          );
        }
      }
    }

    if (options.userId) {
      report.usageDrifts = await this.usage.reconcileUser(options.userId);
    }

    report.completedAt = new Date().toISOString();
    observability().event("billing.reconciliation.completed", {
      eventsRetried: report.eventsRetried,
      eventsRecovered: report.eventsRecovered,
      subscriptionsChecked: report.subscriptionsChecked,
      subscriptionsRepaired: report.subscriptionsRepaired,
      usageDrifts: report.usageDrifts.length,
      skipped: report.skipped,
    });
    return report;
  }
}

function differingFields(
  stored: {
    plan: string;
    status: string;
    billingInterval: string | null;
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd: Date | null;
  },
  facts: {
    status: string;
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd: Date | null;
  },
  plan: string | null,
  interval: string | null,
): string[] {
  const fields: string[] = [];
  if (plan && plan !== stored.plan) fields.push("plan");
  if (facts.status !== stored.status) fields.push("status");
  if (interval && interval !== stored.billingInterval) fields.push("billingInterval");
  if (facts.cancelAtPeriodEnd !== stored.cancelAtPeriodEnd) fields.push("cancelAtPeriodEnd");
  const storedPeriodEnd = stored.currentPeriodEnd?.getTime() ?? null;
  const providerPeriodEnd = facts.currentPeriodEnd?.getTime() ?? null;
  if (storedPeriodEnd !== providerPeriodEnd) fields.push("currentPeriodEnd");
  return fields;
}
