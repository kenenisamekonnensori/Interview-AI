export type AiFailureCategory = "CONFIGURATION" | "TRANSIENT" | "PROVIDER" | "INVALID_OUTPUT";

export class AiProviderError extends Error {
  constructor(
    readonly category: AiFailureCategory,
    message: string,
    readonly diagnostic: {
      provider: string;
      status?: number;
      attempt?: number;
      providerRequestId?: string;
    } = {
      provider: "unknown",
    },
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}

export function isRetryableAiError(error: unknown) {
  return error instanceof AiProviderError && error.category === "TRANSIENT";
}
