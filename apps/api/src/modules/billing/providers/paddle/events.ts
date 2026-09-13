import type { BillingIntervalValue, SubscriptionStatusValue } from "@interviewer-ai/types";

/**
 * Provider-neutral description of what a webhook asks the application to do.
 * The Paddle payload shape stops here: everything downstream (subscriptions,
 * entitlements, usage) works with these facts, so the domain layer never
 * depends on Paddle-specific concepts.
 */
export type BillingEventIntent =
  | {
      kind: "SUBSCRIPTION_SYNC";
      occurredAt: Date;
      subscription: PaddleSubscriptionFacts;
    }
  | {
      kind: "CUSTOMER_ASSOCIATION";
      occurredAt: Date;
      providerCustomerId: string;
      /** Application user the checkout was created for, when present. */
      userId: string | null;
      providerSubscriptionId: string | null;
    }
  | { kind: "IGNORED"; occurredAt: Date; reason: string };

export type PaddleSubscriptionFacts = {
  providerSubscriptionId: string;
  providerCustomerId: string;
  status: SubscriptionStatusValue;
  /** Paddle price id of the first subscription item, resolved to a plan downstream. */
  priceId: string | null;
  /** Paddle product id, used as a fallback when a new price replaces the configured one. */
  productId: string | null;
  /** Paddle's own cadence, used only as a fallback for the interval mapping. */
  billingCycleInterval: string | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  scheduledChange: { action: string; effectiveAt: string } | null;
  providerCreatedAt: Date | null;
  providerUpdatedAt: Date | null;
  /** `user_id` recorded on the checkout, used to associate the subscription. */
  customDataUserId: string | null;
};

/** Paddle's subscription lifecycle, mapped onto our stored statuses. */
const subscriptionStatusMap: Record<string, SubscriptionStatusValue> = {
  trialing: "TRIALING",
  active: "ACTIVE",
  past_due: "PAST_DUE",
  paused: "PAUSED",
  canceled: "CANCELED",
};

/**
 * Events that carry a complete subscription snapshot. Every subscription
 * lifecycle change Paddle can send (creation, activation, trial, renewal
 * update, upgrade, downgrade, pause, resume, past due, cancellation) is
 * represented by this same sync path — there is deliberately no per-event
 * bespoke lifecycle logic.
 */
const subscriptionSyncEvents = new Set([
  "subscription.created",
  "subscription.updated",
  "subscription.activated",
  "subscription.trialing",
  "subscription.past_due",
  "subscription.paused",
  "subscription.resumed",
  "subscription.canceled",
  "subscription.imported",
]);

/**
 * Transaction and customer events are not used to derive plan state (the
 * subscription snapshot is authoritative), but they let us persist the
 * customer -> user association as early as possible so a later subscription
 * event can never be attached to the wrong account.
 */
const associationEvents = new Set([
  "transaction.created",
  "transaction.updated",
  "transaction.ready",
  "transaction.completed",
  "transaction.paid",
  "transaction.billed",
  "transaction.past_due",
  "transaction.payment_failed",
  "customer.created",
  "customer.updated",
]);

type PaddleSubscriptionPayload = {
  id: string;
  status: string;
  customerId: string;
  createdAt: string | null;
  updatedAt: string | null;
  currentBillingPeriod: { startsAt: string; endsAt: string } | null;
  billingCycle: { interval: string; frequency: number } | null;
  scheduledChange: { action: string; effectiveAt: string } | null;
  items: Array<{ price: { id: string } | null; product: { id: string } | null }>;
  customData: Record<string, unknown> | null;
};

function asDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function customDataUserId(customData: Record<string, unknown> | null): string | null {
  const value = customData?.user_id ?? customData?.userId;
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Reads the provider-neutral facts out of a Paddle subscription payload. Used for
 * both webhook notifications and reconciliation reads, so both paths interpret
 * provider state in exactly one place.
 */
export function toSubscriptionFacts(payload: unknown): PaddleSubscriptionFacts | null {
  return subscriptionFacts(payload as PaddleSubscriptionPayload);
}

function subscriptionFacts(payload: PaddleSubscriptionPayload): PaddleSubscriptionFacts | null {
  const status = subscriptionStatusMap[payload.status];
  // An unrecognized status means Paddle introduced state we do not understand.
  // Refuse to sync rather than store a guessed status; the event stays in the
  // log and reconciliation will surface the drift.
  if (!status) return null;
  if (typeof payload.id !== "string" || typeof payload.customerId !== "string") return null;

  const currentPeriodEnd = asDate(payload.currentBillingPeriod?.endsAt);
  const scheduledAction = payload.scheduledChange?.action ?? null;
  return {
    providerSubscriptionId: payload.id,
    providerCustomerId: payload.customerId,
    status,
    priceId: payload.items?.[0]?.price?.id ?? null,
    productId: payload.items?.[0]?.product?.id ?? null,
    billingCycleInterval: payload.billingCycle?.interval ?? null,
    currentPeriodStart: asDate(payload.currentBillingPeriod?.startsAt),
    currentPeriodEnd,
    // Scheduled cancellation is represented separately from status: the customer
    // keeps paid access until the period actually ends.
    cancelAtPeriodEnd: scheduledAction === "cancel" || status === "CANCELED",
    scheduledChange:
      scheduledAction && payload.scheduledChange?.effectiveAt
        ? { action: scheduledAction, effectiveAt: payload.scheduledChange.effectiveAt }
        : null,
    providerCreatedAt: asDate(payload.createdAt),
    providerUpdatedAt: asDate(payload.updatedAt),
    customDataUserId: customDataUserId(payload.customData),
  };
}

/**
 * Translates a verified provider event into a domain intent. Unknown events are
 * still persisted (for audit) and then ignored, which keeps the webhook
 * endpoint forward-compatible with new Paddle event types.
 */
export function toBillingIntent(event: {
  eventType: string;
  occurredAt: string;
  data: unknown;
}): BillingEventIntent {
  const occurredAt = asDate(event.occurredAt) ?? new Date();

  if (subscriptionSyncEvents.has(event.eventType)) {
    const facts = toSubscriptionFacts(event.data);
    if (!facts) return { kind: "IGNORED", occurredAt, reason: "unsupported_subscription_state" };
    return { kind: "SUBSCRIPTION_SYNC", occurredAt, subscription: facts };
  }

  if (associationEvents.has(event.eventType)) {
    const data = event.data as {
      id?: string | null;
      customerId?: string | null;
      subscriptionId?: string | null;
      customData?: Record<string, unknown> | null;
    } | null;
    const customData = data?.customData ?? null;
    const providerCustomerId = event.eventType.startsWith("customer.")
      ? (data?.id ?? null)
      : (data?.customerId ?? null);
    if (!providerCustomerId) return { kind: "IGNORED", occurredAt, reason: "missing_customer" };
    const subscriptionId = data?.subscriptionId ?? null;
    return {
      kind: "CUSTOMER_ASSOCIATION",
      occurredAt,
      providerCustomerId,
      userId: customDataUserId(customData),
      providerSubscriptionId: subscriptionId,
    };
  }

  return { kind: "IGNORED", occurredAt, reason: "unhandled_event_type" };
}

export function isSubscriptionSyncEvent(eventType: string): boolean {
  return subscriptionSyncEvents.has(eventType);
}

/** Interval mapping used when a price id is not in the configured catalog. */
export function intervalFromBillingCycle(interval: string | null): BillingIntervalValue | null {
  if (interval === "month") return "MONTH";
  if (interval === "year") return "YEAR";
  return null;
}
