import type { EntitlementKey } from "@interviewer-ai/types";

import { careerTargetLimitError, entitlementError } from "./domain/errors.js";
import { hasEntitlement, resolveAccess, type ResolvedAccess } from "./domain/entitlements.js";
import type { BillingRepository, SubscriptionRow } from "./repository.js";

export type UserAccess = {
  access: ResolvedAccess;
  subscription: SubscriptionRow | null;
};

/**
 * The one place application code asks "is this allowed?".
 *
 * Feature and cap checks resolve from locally persisted subscription state, so
 * authorization never depends on a live billing-provider call and a provider
 * outage cannot take unrelated features down with it.
 */
export class EntitlementService {
  constructor(private readonly repository: BillingRepository) {}

  async accessFor(userId: string, now: Date = new Date()): Promise<UserAccess> {
    const subscription = await this.repository.findSubscriptionForUser(userId);
    return { access: resolveAccess(subscription, now), subscription };
  }

  async can(userId: string, feature: EntitlementKey, now: Date = new Date()): Promise<boolean> {
    const { access } = await this.accessFor(userId, now);
    return hasEntitlement(access.entitlements, feature);
  }

  /** Throws a structured `ENTITLEMENT_REQUIRED` error when the plan lacks a feature. */
  async requireFeature(
    userId: string,
    feature: EntitlementKey,
    now: Date = new Date(),
  ): Promise<ResolvedAccess> {
    const { access } = await this.accessFor(userId, now);
    if (!hasEntitlement(access.entitlements, feature)) {
      throw entitlementError(feature, access.plan);
    }
    return access;
  }

  /** Enforces the count-based active-target allowance for the effective plan. */
  async requireCareerTargetCapacity(
    userId: string,
    now: Date = new Date(),
  ): Promise<{ active: number; limit: number | null }> {
    const { access } = await this.accessFor(userId, now);
    const limit = access.entitlements.caps.activeCareerTargets;
    const active = await this.repository.countActiveCareerTargets(userId);
    if (limit !== null && active >= limit) throw careerTargetLimitError(active, limit, access.plan);
    return { active, limit };
  }
}
