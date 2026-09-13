import "../load-environment.js";

import { serverEnvironmentSchema } from "@interviewer-ai/config";

import { createAuthDatabase } from "../modules/auth/database.js";
import { BillingEventProcessor } from "../modules/billing/billing-event-processor.js";
import { EntitlementService } from "../modules/billing/entitlement-service.js";
import { BillingReconciliationService } from "../modules/billing/reconciliation-service.js";
import { BillingRepository } from "../modules/billing/repository.js";
import { UsageService } from "../modules/billing/usage-service.js";

/**
 * Recovery pass for billing state.
 *
 * Usage: billing-reconcile [user-id] [limit]
 *   user-id  also rebuild that user's usage counters from the ledger
 *   limit    maximum subscriptions and events to examine in this run
 *
 * Run it on a schedule (for example hourly) so a missed webhook is repaired
 * without polling Paddle on the request path.
 */
const [userId, limitArgument] = process.argv.slice(2);
const limit = limitArgument ? Number(limitArgument) : undefined;
if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
  throw new Error("Usage: billing-reconcile [user-id] [positive-limit]");
}

const environment = serverEnvironmentSchema.parse(process.env);
const database = createAuthDatabase(environment.DATABASE_URL);
const repository = new BillingRepository(database);
const entitlements = new EntitlementService(repository);
const usage = new UsageService(repository, entitlements);
const processor = new BillingEventProcessor(environment, repository);
const reconciliation = new BillingReconciliationService(environment, repository, processor, usage);

try {
  const report = await reconciliation.reconcile({
    ...(userId ? { userId } : {}),
    ...(limit ? { limit } : {}),
  });
  console.log(JSON.stringify(report, null, 2));
} finally {
  await database.$disconnect();
}
