import type { FastifyReply, FastifyRequest } from "fastify";

type SafeLogger = { error: (payload: unknown, message?: string) => unknown };

export function configuredCorsOrigins(environment: {
  WEB_URL: string;
  CORS_ALLOWED_ORIGINS: string[];
}) {
  return [...new Set([environment.WEB_URL, ...environment.CORS_ALLOWED_ORIGINS])];
}

export function sendSafeRateLimitError(
  reply: FastifyReply,
  resetSeconds: number,
  requestId?: string,
) {
  reply.header("Retry-After", String(resetSeconds));
  return reply.status(429).send({
    code: "RATE_LIMITED",
    message: "Too many requests. Please try again later.",
    ...(requestId ? { requestId } : {}),
  });
}

export function logSafeError(
  logger: SafeLogger,
  message: string,
  error: unknown,
  context: Record<string, unknown> = {},
) {
  logger.error(
    {
      ...context,
      errorType: error instanceof Error ? error.name : "UnknownError",
    },
    message,
  );
}

export function sendSafeUnexpectedError(
  request: FastifyRequest,
  reply: FastifyReply,
  error: unknown,
) {
  logSafeError(request.log, "Unhandled request error", error, { requestId: request.id });
  return reply.status(500).send({
    code: "INTERNAL_ERROR",
    message: "The request could not be completed.",
    requestId: request.id,
  });
}
