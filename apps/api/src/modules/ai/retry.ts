import { AiProviderError, isRetryableAiError } from "./errors.js";

const maxAttempts = 3;

export async function withAiRetry<T>(operation: () => Promise<T>) {
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
