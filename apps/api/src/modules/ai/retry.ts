import { AiProviderError, isRetryableAiError } from "./errors.js";

const defaultMaxAttempts = 3;

/**
 * Bounded retry with small backoff. Callers handling real-time turns pass a
 * tighter attempt budget: a slow greeting hurts the user even when it
 * eventually succeeds, so fewer faster attempts beat more patient ones.
 */
export async function withAiRetry<T>(
  operation: () => Promise<T>,
  maxAttempts = defaultMaxAttempts,
) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isRetryableAiError(error) || attempt === maxAttempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 150 * 2 ** (attempt - 1)));
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new AiProviderError("PROVIDER", "The AI provider failed.");
}
