import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

type ObservabilityLogger = {
  info: (payload: unknown, message?: string) => unknown;
  warn: (payload: unknown, message?: string) => unknown;
  error: (payload: unknown, message?: string) => unknown;
};

export type ObservabilityAttributes = Record<string, boolean | number | string | undefined>;
export type Observability = {
  event: (name: string, attributes?: ObservabilityAttributes) => void;
  error: (name: string, attributes: ObservabilityAttributes, error: Error) => void;
  metric: (name: string, value: number, attributes?: ObservabilityAttributes) => void;
  time: <T>(
    name: string,
    attributes: ObservabilityAttributes,
    operation: () => Promise<T>,
  ) => Promise<T>;
};

const sensitiveAttributeNames = new Set([
  "authorization",
  "cookie",
  "password",
  "secret",
  "token",
  "apiKey",
  "prompt",
  "resumeText",
  "transcript",
  "audio",
  "rawText",
]);

export function redactObservabilityAttributes(
  attributes: ObservabilityAttributes,
): ObservabilityAttributes {
  return Object.fromEntries(
    Object.entries(attributes).map(([key, value]) => [
      key,
      sensitiveAttributeNames.has(key) ? "[REDACTED]" : value,
    ]),
  );
}

function consoleObservability(logger: ObservabilityLogger): Observability {
  return {
    event: (name, attributes = {}) =>
      logger.info(
        { event: name, ...redactObservabilityAttributes(withCorrelation(attributes)) },
        name,
      ),
    error: (name, attributes, error) =>
      logger.error(
        {
          event: name,
          errorType: error.name,
          errorMessage: error.message,
          errorStack: error.stack,
          ...redactObservabilityAttributes(withCorrelation(attributes)),
        },
        name,
      ),
    metric: (name, value, attributes = {}) =>
      logger.info(
        { metric: name, value, ...redactObservabilityAttributes(withCorrelation(attributes)) },
        "Observability metric",
      ),
    time: async (name, attributes, operation) => {
      const startedAt = performance.now();
      try {
        const result = await operation();
        const durationMs = Math.round(performance.now() - startedAt);
        logger.info(
          {
            event: name,
            outcome: "success",
            durationMs,
            ...redactObservabilityAttributes(withCorrelation(attributes)),
          },
          name,
        );
        return result;
      } catch (error) {
        const durationMs = Math.round(performance.now() - startedAt);
        logger.warn(
          {
            event: name,
            outcome: "error",
            durationMs,
            errorType: error instanceof Error ? error.name : "UnknownError",
            ...redactObservabilityAttributes(withCorrelation(attributes)),
          },
          name,
        );
        throw error;
      }
    },
  };
}

let activeObservability: Observability | null = null;
const correlationContext = new AsyncLocalStorage<string>();

function withCorrelation(attributes: ObservabilityAttributes) {
  const correlationId = correlationContext.getStore();
  return correlationId && attributes.correlationId === undefined
    ? { ...attributes, correlationId }
    : attributes;
}

export function configureObservability(logger: ObservabilityLogger) {
  activeObservability = consoleObservability(logger);
  return activeObservability;
}

/** Composition root hook for a future OpenTelemetry, Sentry, or vendor adapter. */
export function setObservabilityAdapter(adapter: Observability) {
  activeObservability = adapter;
}

export function observability(): Observability {
  if (!activeObservability) {
    activeObservability = consoleObservability(console);
  }
  return activeObservability;
}

export function withCorrelationId<T>(correlationId: string | undefined, operation: () => T): T {
  return correlationId ? correlationContext.run(correlationId, operation) : operation();
}

export function setRequestCorrelationId(correlationId: string) {
  correlationContext.enterWith(correlationId);
}

export function createRequestId(value: unknown) {
  if (typeof value === "string" && /^[A-Za-z0-9_-]{8,128}$/.test(value)) return value;
  return randomUUID();
}
