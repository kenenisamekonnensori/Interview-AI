import type { ServerEnvironment } from "@interviewer-ai/config";
import type {
  BillingCheckoutRequest,
  BillingCheckoutSession,
  BillingOverview,
  BillingPlanOption,
  BillingPortalSession,
  SubscriptionSummary,
} from "@interviewer-ai/types";

import { BillingError, planNotPurchasableError } from "./domain/errors.js";
import type { ResolvedAccess } from "./domain/entitlements.js";
import { planOptions, priceIdForPlan } from "./domain/plans.js";
import type { EntitlementService } from "./entitlement-service.js";
import { requirePaddleClient } from "./providers/paddle/client.js";
import type { BillingRepository, SubscriptionRow } from "./repository.js";
import type { UsageService } from "./usage-service.js";
import { observability } from "../../services/observability.js";

/**
 * The customer-facing billing surface. It answers "what plan am I on, what does
 * it grant, and how much have I used?" from local state, and only talks to Paddle
 * for the operations that genuinely require it: starting a checkout, opening the
 * customer portal, and reconciliation.
 */
export class BillingService {
  constructor(
    private readonly environment: ServerEnvironment,
    private readonly repository: BillingRepository,
    private readonly entitlements: EntitlementService,
    private readonly usage: UsageService,
  ) {}

  plans(): BillingPlanOption[] {
    return planOptions(this.environment);
  }

  async overview(userId: string, now: Date = new Date()): Promise<BillingOverview> {
    const { access, subscription } = await this.entitlements.accessFor(userId, now);
    const [usage, customer, activeTargets] = await Promise.all([
      this.usage.status(userId, now),
      this.repository.findCustomer(userId),
      this.repository.countActiveCareerTargets(userId),
    ]);
    return {
      generatedAt: now.toISOString(),
      plan: access.plan,
      entitlements: access.entitlements,
      subscription: subscription ? summarizeSubscription(subscription, access) : null,
      usage,
      careerTargets: {
        active: activeTargets,
        limit: access.entitlements.caps.activeCareerTargets,
      },
      plans: this.plans(),
      canManageBilling: Boolean(customer),
    };
  }

  /**
   * Creates a hosted checkout for a plan the server recognizes.
   *
   * The client only names a plan and interval; the server resolves that to a
   * configured Paddle price and attaches the authenticated user id as trusted
   * custom data. Nothing the browser sends can select a different price, user, or
   * grant entitlements by itself — access only changes when the signed webhook
   * arrives.
   */
  async createCheckout(
    userId: string,
    input: BillingCheckoutRequest,
  ): Promise<BillingCheckoutSession> {
    const priceId = priceIdForPlan(this.environment, input.plan, input.interval);
    if (!priceId) throw planNotPurchasableError(input.plan);
    const paddle = requirePaddleClient(this.environment);

    const existing = await this.repository.findCustomer(userId);
    let providerCustomerId = existing?.providerCustomerId ?? null;
    if (!providerCustomerId) {
      const user = await this.repository.findUserForBilling(userId);
      if (!user) throw new BillingError("BILLING_CUSTOMER_REQUIRED", "Account not found.", 404);
      const customer = await paddle.customers.create({
        email: user.email,
        name: user.name,
        customData: { user_id: user.id },
      });
      providerCustomerId = customer.id;
      try {
        await this.repository.createCustomer({ userId, providerCustomerId });
      } catch {
        // The mapping already exists (concurrent checkout); keep the existing one.
        const raced = await this.repository.findCustomer(userId);
        providerCustomerId = raced?.providerCustomerId ?? providerCustomerId;
      }
    }

    const transaction = await paddle.transactions.create({
      items: [{ priceId, quantity: 1 }],
      customerId: providerCustomerId,
      customData: { user_id: userId },
      checkout: {
        url: `${this.environment.WEB_URL.replace(/\/$/, "")}/subscription?checkout=complete`,
      },
    });
    const checkoutUrl = transaction.checkout?.url ?? null;
    if (!checkoutUrl) {
      observability().event("billing.checkout.unavailable", { userId, plan: input.plan });
      throw new BillingError(
        "BILLING_PROVIDER_UNAVAILABLE",
        "Checkout could not be started. Please try again.",
        503,
      );
    }
    observability().event("billing.checkout.created", {
      userId,
      plan: input.plan,
      interval: input.interval,
      transactionId: transaction.id,
    });
    return { checkoutUrl, transactionId: transaction.id };
  }

  /**
   * Opens Paddle's customer portal for the authenticated user's own customer
   * record. Portal URLs are temporary and are never persisted.
   */
  async createPortalSession(userId: string): Promise<BillingPortalSession> {
    const customer = await this.repository.findCustomer(userId);
    if (!customer) {
      throw new BillingError(
        "BILLING_CUSTOMER_REQUIRED",
        "You do not have a billing account yet.",
        409,
      );
    }
    const paddle = requirePaddleClient(this.environment);
    const subscriptions = await this.repository.listSubscriptionsForUser(userId);
    const session = await paddle.customerPortalSessions.create(
      customer.providerCustomerId,
      subscriptions.map((subscription) => subscription.providerSubscriptionId),
    );
    return { url: session.urls.general.overview };
  }
}

export function summarizeSubscription(
  subscription: SubscriptionRow,
  access: ResolvedAccess,
): SubscriptionSummary {
  return {
    provider: "PADDLE",
    plan: subscription.plan,
    status: subscription.status,
    billingInterval: subscription.billingInterval,
    currentPeriodStart: subscription.currentPeriodStart?.toISOString() ?? null,
    currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    scheduledChangeEffectiveAt: subscription.scheduledChangeEffectiveAt?.toISOString() ?? null,
    accessUntil: access.accessUntil?.toISOString() ?? null,
  };
}
