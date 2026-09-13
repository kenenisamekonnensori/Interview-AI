import type { ServerEnvironment } from "@interviewer-ai/config";

import type { createBillingEventQueue } from "../../services/billing-event-queue.js";
import type { MonolithExecutionManager } from "../../services/monolith-execution.js";
import { observability } from "../../services/observability.js";
import type {
  BillingEventProcessingResult,
  BillingEventProcessor,
} from "./billing-event-processor.js";
import { BillingError } from "./domain/errors.js";
import {
  requirePaddleClient,
  webhookSecret,
  type PaddleEnvironment,
} from "./providers/paddle/client.js";
import type { BillingRepository } from "./repository.js";

export type WebhookAcceptance = {
  providerEventId: string;
  duplicate: boolean;
  /** Populated only when processing had to happen inline. */
  processing: BillingEventProcessingResult | null;
};

export type VerifiedBillingEvent = {
  eventId: string;
  eventType: string;
  occurredAt: Date;
  payload: Record<string, unknown>;
};

/**
 * Verifies a webhook signature over the *original raw request body* using
 * Paddle's official SDK. Re-serializing parsed JSON before verifying would
 * change the bytes and the signature would not match, which is why the route
 * hands the untouched body in here.
 */
export async function verifyPaddleWebhook(
  environment: PaddleEnvironment,
  rawBody: string,
  signature: string | undefined,
): Promise<VerifiedBillingEvent> {
  const secret = webhookSecret(environment);
  if (!secret) {
    throw new BillingError("WEBHOOK_NOT_CONFIGURED", "Webhook processing is not configured.", 503);
  }
  if (!signature) {
    throw new BillingError("WEBHOOK_SIGNATURE_INVALID", "Webhook signature is missing.", 401);
  }
  const paddle = requirePaddleClient(environment);

  let event: Awaited<ReturnType<typeof paddle.webhooks.unmarshal>>;
  try {
    event = await paddle.webhooks.unmarshal(rawBody, secret, signature);
  } catch {
    // Never echo the signature or the body back, and never log the secret.
    observability().event("billing.webhook.signature_rejected", {});
    throw new BillingError(
      "WEBHOOK_SIGNATURE_INVALID",
      "Webhook signature verification failed.",
      401,
    );
  }

  const occurredAt = new Date(event.occurredAt);
  if (
    typeof event.eventId !== "string" ||
    event.eventId.length === 0 ||
    typeof event.eventType !== "string" ||
    Number.isNaN(occurredAt.getTime())
  ) {
    throw new BillingError(
      "WEBHOOK_PAYLOAD_INVALID",
      "Webhook payload is not a valid billing event.",
      400,
    );
  }

  return {
    eventId: event.eventId,
    eventType: event.eventType,
    occurredAt,
    payload: event as unknown as Record<string, unknown>,
  };
}

/**
 * The webhook entry point.
 *
 * Order of operations matters: verify the signature first, then persist the event
 * under its unique provider event id (which is what makes at-least-once delivery
 * safe), then acknowledge quickly. Synchronization runs off the request path, and
 * the persisted row means an event is never lost even if processing fails.
 */
export class BillingWebhookService {
  constructor(
    private readonly environment: ServerEnvironment,
    private readonly repository: BillingRepository,
    private readonly processor: BillingEventProcessor,
    private readonly dependencies: {
      queue?: ReturnType<typeof createBillingEventQueue>;
      monolith?: MonolithExecutionManager;
    } = {},
  ) {}

  async handle(rawBody: string, signature: string | undefined): Promise<WebhookAcceptance> {
    const verified = await verifyPaddleWebhook(this.environment, rawBody, signature);
    const row = await this.repository.createEvent({
      providerEventId: verified.eventId,
      eventType: verified.eventType,
      occurredAt: verified.occurredAt,
      payload: verified.payload,
      userId: null,
      subscriptionId: null,
    });
    if (!row) {
      // Same event id already stored: replay. Acknowledged without side effects.
      observability().event("billing.webhook.duplicate", {
        providerEventId: verified.eventId,
        eventType: verified.eventType,
      });
      return { providerEventId: verified.eventId, duplicate: true, processing: null };
    }

    const dispatched = await this.dispatch(row.id);
    if (dispatched) {
      return { providerEventId: verified.eventId, duplicate: false, processing: null };
    }
    // No worker infrastructure available: process now so the event is not
    // stranded, still after acknowledging durability above.
    return {
      providerEventId: verified.eventId,
      duplicate: false,
      processing: await this.processor.process(row.id),
    };
  }

  private async dispatch(eventId: string): Promise<boolean> {
    if (this.dependencies.monolith?.dispatchBillingEvent(this.processor, eventId)) return true;
    const queue = this.dependencies.queue;
    if (!queue) return false;
    try {
      await queue.enqueue({ eventId });
      return true;
    } catch (error) {
      observability().error(
        "billing.webhook.dispatch_failed",
        { eventId },
        error instanceof Error ? error : new Error(String(error)),
      );
      return false;
    }
  }
}
