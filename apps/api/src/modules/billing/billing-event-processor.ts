import type { ServerEnvironment } from "@interviewer-ai/config";
import type { BillingIntervalValue, BillingPlanId } from "@interviewer-ai/types";

import { observability } from "../../services/observability.js";
import { planForPriceId } from "./domain/plans.js";
import {
  intervalFromBillingCycle,
  toBillingIntent,
  type PaddleSubscriptionFacts,
} from "./providers/paddle/events.js";
import type { BillingRepository } from "./repository.js";

export type BillingEventProcessingResult =
  | { status: "PROCESSED"; userId: string | null; subscriptionId: string | null }
  | { status: "IGNORED"; reason: string }
  | { status: "ALREADY_HANDLED" }
  | { status: "MISSING" }
  | { status: "FAILED"; error: string };

type PlanEnvironment = Parameters<typeof planForPriceId>[0] &
  Pick<ServerEnvironment, "PADDLE_PRO_PRODUCT_ID">;

/**
 * Maps a provider subscription to an internal plan using only trusted server
 * configuration. A price is matched first; the configured product id is a
 * fallback so replacing a price with a new one for the same product does not
 * silently drop subscriptions. An unrecognized subscription never grants paid
 * entitlements — it is recorded and reported instead.
 */
export function resolveSubscriptionPlan(
  environment: PlanEnvironment,
  facts: PaddleSubscriptionFacts,
): { plan: BillingPlanId; interval: BillingIntervalValue | null } | null {
  if (facts.priceId) {
    const mapped = planForPriceId(environment, facts.priceId);
    if (mapped) return mapped;
  }
  if (
    facts.productId &&
    environment.PADDLE_PRO_PRODUCT_ID &&
    facts.productId === environment.PADDLE_PRO_PRODUCT_ID
  ) {
    return { plan: "PRO", interval: intervalFromBillingCycle(facts.billingCycleInterval) };
  }
  return null;
}

/**
 * Processes a persisted provider event exactly once.
 *
 * Idempotency comes from two layers: the unique (provider, providerEventId) key
 * stops a redelivered event from ever starting, and the process/claim transition
 * means a second worker cannot handle the same row concurrently. Ordering is
 * enforced deeper down, in the conditional subscription update.
 */
export class BillingEventProcessor {
  constructor(
    private readonly environment: PlanEnvironment,
    private readonly repository: BillingRepository,
  ) {}

  async process(eventId: string): Promise<BillingEventProcessingResult> {
    const event = await this.repository.findEventById(eventId);
    if (!event) return { status: "MISSING" };
    if (event.status === "PROCESSED" || event.status === "IGNORED") {
      return { status: "ALREADY_HANDLED" };
    }
    const claimed = await this.repository.claimEventForProcessing(eventId);
    if (claimed.count === 0) return { status: "ALREADY_HANDLED" };

    try {
      const intent = toBillingIntent({
        eventType: event.eventType,
        occurredAt: event.occurredAt.toISOString(),
        data: (event.payload as { data?: unknown } | null)?.data,
      });

      if (intent.kind === "IGNORED") {
        await this.repository.ignoreEvent(eventId, intent.reason);
        observability().event("billing.event.ignored", {
          providerEventId: event.providerEventId,
          eventType: event.eventType,
          reason: intent.reason,
        });
        return { status: "IGNORED", reason: intent.reason };
      }

      // Awaited deliberately: returning the promise directly from inside `try`
      // would let a rejection escape the catch block, leaving the event claimed
      // as PROCESSING instead of being marked FAILED for retry.
      if (intent.kind === "CUSTOMER_ASSOCIATION") {
        return await this.applyAssociation(eventId, event.providerEventId, event.eventType, intent);
      }

      return await this.applySubscriptionSync(
        eventId,
        event.providerEventId,
        event.eventType,
        intent,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown billing processing error";
      await this.repository.failEvent(eventId, message);
      observability().error(
        "billing.event.failed",
        {
          providerEventId: event.providerEventId,
          eventType: event.eventType,
        },
        error instanceof Error ? error : new Error(message),
      );
      return { status: "FAILED", error: message };
    }
  }

  private async applyAssociation(
    eventId: string,
    providerEventId: string,
    eventType: string,
    intent: Extract<ReturnType<typeof toBillingIntent>, { kind: "CUSTOMER_ASSOCIATION" }>,
  ): Promise<BillingEventProcessingResult> {
    const existing = await this.repository.findCustomerByProviderId(intent.providerCustomerId);
    if (existing) {
      // A customer id that already maps to another account must never be
      // reassigned, even if an event claims a different user id.
      if (intent.userId && existing.userId !== intent.userId) {
        await this.repository.ignoreEvent(eventId, "association_conflict");
        observability().error(
          "billing.association.conflict",
          {
            providerEventId,
            providerCustomerId: intent.providerCustomerId,
            ownerUserId: existing.userId,
            claimedUserId: intent.userId,
          },
          new Error("Provider customer is already associated with another account"),
        );
        return { status: "IGNORED", reason: "association_conflict" };
      }
      await this.repository.completeEvent(eventId, {
        userId: existing.userId,
        subscriptionId: null,
      });
      return { status: "PROCESSED", userId: existing.userId, subscriptionId: null };
    }

    if (!intent.userId) {
      await this.repository.ignoreEvent(eventId, "unassociated_customer");
      return { status: "IGNORED", reason: "unassociated_customer" };
    }

    const user = await this.repository.findUserForBilling(intent.userId);
    if (!user) {
      await this.repository.ignoreEvent(eventId, "unknown_user");
      return { status: "IGNORED", reason: "unknown_user" };
    }

    const alreadyMapped = await this.repository.findCustomer(intent.userId);
    if (alreadyMapped && alreadyMapped.providerCustomerId !== intent.providerCustomerId) {
      await this.repository.ignoreEvent(eventId, "account_already_associated");
      return { status: "IGNORED", reason: "account_already_associated" };
    }
    if (!alreadyMapped) {
      try {
        await this.repository.createCustomer({
          userId: intent.userId,
          providerCustomerId: intent.providerCustomerId,
        });
      } catch {
        const raced = await this.repository.findCustomerByProviderId(intent.providerCustomerId);
        if (!raced || raced.userId !== intent.userId) {
          await this.repository.ignoreEvent(eventId, "association_conflict");
          return { status: "IGNORED", reason: "association_conflict" };
        }
      }
    }
    await this.repository.completeEvent(eventId, { userId: intent.userId, subscriptionId: null });
    observability().event("billing.customer.associated", {
      userId: intent.userId,
      providerEventId,
      eventType,
    });
    return { status: "PROCESSED", userId: intent.userId, subscriptionId: null };
  }

  private async applySubscriptionSync(
    eventId: string,
    providerEventId: string,
    eventType: string,
    intent: Extract<ReturnType<typeof toBillingIntent>, { kind: "SUBSCRIPTION_SYNC" }>,
  ): Promise<BillingEventProcessingResult> {
    const facts = intent.subscription;
    const resolved = resolveSubscriptionPlan(this.environment, facts);
    const userId =
      facts.customDataUserId ??
      (await this.repository.resolveOwnerId(facts.providerCustomerId)) ??
      null;

    const outcome = await this.repository.applySubscriptionSync({
      facts,
      plan: resolved?.plan ?? null,
      interval: resolved?.interval ?? null,
      userId,
      occurredAt: intent.occurredAt,
      eventType,
    });

    if (!outcome.applied) {
      const reason = outcome.reason.toLowerCase();
      await this.repository.ignoreEvent(eventId, reason);
      if (outcome.reason === "STALE_EVENT") {
        // Out-of-order delivery: newer state is already stored, so this event is
        // recorded for audit and deliberately not applied.
        observability().event("billing.event.out_of_order", {
          providerEventId,
          eventType,
          occurredAt: intent.occurredAt.toISOString(),
        });
      } else {
        observability().error(
          `billing.sync.${reason}`,
          { providerEventId, eventType, providerCustomerId: facts.providerCustomerId },
          new Error(`Subscription sync not applied: ${outcome.reason}`),
        );
      }
      return { status: "IGNORED", reason };
    }

    const { subscription, previousPlan, created } = outcome;
    await this.repository.completeEvent(eventId, {
      userId: subscription.userId,
      subscriptionId: subscription.id,
    });

    // Billing state changes are sensitive: record the transition with useful
    // identifiers (never secrets, tokens, or payment details).
    observability().event(
      created ? "billing.subscription.created" : "billing.subscription.updated",
      {
        userId: subscription.userId,
        subscriptionId: subscription.providerSubscriptionId,
        providerEventId,
        eventType,
        plan: subscription.plan,
        status: subscription.status,
        billingInterval: subscription.billingInterval ?? undefined,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        previousPlan: previousPlan ?? undefined,
      },
    );
    if (previousPlan && previousPlan !== subscription.plan) {
      observability().event("billing.entitlement.changed", {
        userId: subscription.userId,
        subscriptionId: subscription.providerSubscriptionId,
        providerEventId,
        from: previousPlan,
        to: subscription.plan,
      });
    }
    if (subscription.status === "CANCELED") {
      observability().event("billing.subscription.canceled", {
        userId: subscription.userId,
        subscriptionId: subscription.providerSubscriptionId,
        providerEventId,
        accessUntil: subscription.currentPeriodEnd?.toISOString(),
      });
    }
    if (subscription.status === "PAST_DUE") {
      observability().event("billing.subscription.past_due", {
        userId: subscription.userId,
        subscriptionId: subscription.providerSubscriptionId,
        providerEventId,
        accessUntil: subscription.currentPeriodEnd?.toISOString(),
      });
    }

    return {
      status: "PROCESSED",
      userId: subscription.userId,
      subscriptionId: subscription.id,
    };
  }
}
