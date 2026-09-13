import type { ServerEnvironment } from "@interviewer-ai/config";
import { billingCheckoutRequestSchema } from "@interviewer-ai/types";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { PrismaClient } from "../../../prisma/generated/client.js";

import type { createBillingEventQueue } from "../../services/billing-event-queue.js";
import type { MonolithExecutionManager } from "../../services/monolith-execution.js";
import { BillingEventProcessor } from "./billing-event-processor.js";
import { BillingError } from "./domain/errors.js";
import { EntitlementService } from "./entitlement-service.js";
import { BillingRepository } from "./repository.js";
import { BillingService } from "./service.js";
import { UsageService } from "./usage-service.js";
import { BillingWebhookService } from "./webhook-service.js";

declare module "fastify" {
  interface FastifyInstance {
    entitlements: EntitlementService;
    usageService: UsageService;
  }
  interface FastifyRequest {
    /** Present only inside the webhook scope: the untouched request body bytes. */
    rawWebhookBody?: Buffer;
  }
}

/** Maps a structured billing error to its API response; anything else is a bug. */
export function sendBillingError(reply: FastifyReply, error: unknown) {
  if (!(error instanceof BillingError)) throw error;
  return reply.status(error.httpStatus).send({
    code: error.code,
    message: error.message,
    ...(error.details ? { details: error.details } : {}),
  });
}

export type BillingDependencies = {
  database: PrismaClient;
  environment: ServerEnvironment;
  queue?: ReturnType<typeof createBillingEventQueue> | undefined;
  monolith?: MonolithExecutionManager | undefined;
};

export function registerBillingRoutes(app: FastifyInstance, dependencies: BillingDependencies) {
  const { database, environment } = dependencies;
  const repository = new BillingRepository(database);
  const entitlements = new EntitlementService(repository);
  const usage = new UsageService(repository, entitlements);
  const processor = new BillingEventProcessor(environment, repository);
  const billing = new BillingService(environment, repository, entitlements, usage);
  const webhooks = new BillingWebhookService(environment, repository, processor, {
    ...(dependencies.queue ? { queue: dependencies.queue } : {}),
    ...(dependencies.monolith ? { monolith: dependencies.monolith } : {}),
  });

  // Other modules resolve access through these decorations instead of talking to
  // Paddle or re-deriving plan state.
  app.decorate("entitlements", entitlements);
  app.decorate("usageService", usage);

  /**
   * The webhook endpoint needs the raw body for signature verification, so it is
   * registered inside its own encapsulated scope with a buffer-preserving JSON
   * parser. Every other route keeps the default parser.
   */
  app.register(async (instance) => {
    instance.addContentTypeParser(
      "application/json",
      { parseAs: "buffer" },
      (request, body, done) => {
        request.rawWebhookBody = body as Buffer;
        try {
          done(null, JSON.parse((body as Buffer).toString("utf8")));
        } catch (error) {
          done(error as Error);
        }
      },
    );
    instance.post(
      "/api/v1/billing/webhooks/paddle",
      async (request: FastifyRequest, reply: FastifyReply) => {
        const raw = request.rawWebhookBody;
        if (!raw) {
          return reply.status(400).send({
            code: "WEBHOOK_PAYLOAD_INVALID",
            message: "Webhook payload is missing.",
          });
        }
        try {
          const result = await webhooks.handle(
            raw.toString("utf8"),
            request.headers["paddle-signature"] as string | undefined,
          );
          // Acknowledge as soon as the event is durably recorded. Synchronization
          // continues asynchronously; replays are detected by the event id.
          return reply.status(200).send({
            status: result.duplicate ? "duplicate" : "accepted",
          });
        } catch (error) {
          return sendBillingError(reply, error);
        }
      },
    );
  });

  /** Public catalog: internal plans and display pricing only, never provider ids. */
  app.get("/api/v1/billing/plans", async () => ({ plans: billing.plans() }));

  app.get("/api/v1/billing/overview", { preHandler: app.requireVerifiedUser }, async (request) => ({
    billing: await billing.overview(request.authContext!.user.id),
  }));

  app.post(
    "/api/v1/billing/checkout",
    { preHandler: app.requireVerifiedUser },
    async (request, reply) => {
      const input = billingCheckoutRequestSchema.safeParse(request.body);
      if (!input.success)
        return reply
          .status(400)
          .send({ code: "VALIDATION_ERROR", message: "Choose a valid plan and billing interval." });
      try {
        return {
          checkout: await billing.createCheckout(request.authContext!.user.id, input.data),
        };
      } catch (error) {
        return sendBillingError(reply, error);
      }
    },
  );

  app.post(
    "/api/v1/billing/portal",
    { preHandler: app.requireVerifiedUser },
    async (request, reply) => {
      try {
        return { portal: await billing.createPortalSession(request.authContext!.user.id) };
      } catch (error) {
        return sendBillingError(reply, error);
      }
    },
  );

  return { repository, entitlements, usage, billing, processor, webhooks };
}
