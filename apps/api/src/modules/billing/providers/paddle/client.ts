import { Environment, Paddle } from "@paddle/paddle-node-sdk";
import type { ServerEnvironment } from "@interviewer-ai/config";

import { billingNotConfiguredError } from "../../domain/errors.js";

export type PaddleEnvironment = Pick<
  ServerEnvironment,
  "PADDLE_API_KEY" | "PADDLE_ENVIRONMENT" | "PADDLE_WEBHOOK_SECRET"
>;

let cached: { apiKey: string; client: Paddle } | null = null;

/**
 * The single place a Paddle client is constructed. The API key never leaves the
 * server process, and the client is only created when credentials exist so the
 * rest of the application keeps working without billing configured.
 */
export function createPaddleClient(environment: PaddleEnvironment): Paddle | null {
  if (!environment.PADDLE_API_KEY) return null;
  if (cached?.apiKey === environment.PADDLE_API_KEY) return cached.client;
  const client = new Paddle(environment.PADDLE_API_KEY, {
    environment:
      environment.PADDLE_ENVIRONMENT === "production"
        ? Environment.production
        : Environment.sandbox,
  });
  cached = { apiKey: environment.PADDLE_API_KEY, client };
  return client;
}

/** Throws a structured, non-sensitive error when billing is not configured. */
export function requirePaddleClient(environment: PaddleEnvironment): Paddle {
  const client = createPaddleClient(environment);
  if (!client) throw billingNotConfiguredError();
  return client;
}

export function webhookSecret(environment: PaddleEnvironment): string | null {
  return environment.PADDLE_WEBHOOK_SECRET ?? null;
}

export function isPaddleEnvironment(payload: unknown): payload is Paddle {
  return payload instanceof Paddle;
}
