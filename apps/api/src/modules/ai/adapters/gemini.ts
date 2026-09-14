import type { ServerEnvironment } from "@interviewer-ai/config";
import { AiProviderError } from "../errors.js";
import { withAiRetry } from "../retry.js";
import type { AiStructuredRequest } from "../types.js";
import { observability } from "../../../services/observability.js";

/**
 * Default ceiling for one provider request. Reports and cross-interview
 * interpretation are long-running, so the ceiling is generous; the real-time
 * interviewer turn passes a much shorter deadline.
 */
export const defaultAiRequestTimeoutMs = 45_000;

export class GeminiAdapter {
  constructor(private readonly environment: ServerEnvironment) {}

  async generateJson({ instructions, context, timeoutMs }: AiStructuredRequest): Promise<unknown> {
    if (!this.environment.GEMINI_API_KEY)
      return this.fail("CONFIGURATION", "The AI provider is not configured.");
    const deadline = timeoutMs ?? defaultAiRequestTimeoutMs;
    return observability().time(
      "ai.provider.call",
      { provider: "gemini", capability: "structured-json", model: this.environment.GEMINI_MODEL },
      () => withAiRetry(() => this.requestJson(instructions, context, deadline)),
    );
  }

  private async requestJson(
    instructions: string,
    context: unknown,
    timeoutMs: number,
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.environment.GEMINI_MODEL}:generateContent?key=${this.environment.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // Bound the request: a provider that never answers becomes a
          // retryable transient failure instead of an indefinitely open request.
          signal: AbortSignal.timeout(timeoutMs),
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: instructions }] },
            contents: [{ role: "user", parts: [{ text: JSON.stringify(context) }] }],
            generationConfig: { responseMimeType: "application/json" },
          }),
        },
      );
    } catch (cause) {
      const timedOut =
        cause instanceof Error && (cause.name === "TimeoutError" || cause.name === "AbortError");
      return this.fail(
        "TRANSIENT",
        timedOut ? "The AI provider timed out." : "The AI provider could not be reached.",
        { transportErrorType: timedOut ? "TimeoutError" : transportErrorName(cause) },
      );
    }
    if (!response.ok) {
      const category =
        response.status === 408 || response.status === 429 || response.status >= 500
          ? "TRANSIENT"
          : "PROVIDER";
      const providerRequestId =
        response.headers.get("x-goog-request-id") ?? response.headers.get("x-request-id");
      return this.fail(category, "The AI provider returned an error.", {
        status: response.status,
        ...(providerRequestId ? { providerRequestId } : {}),
      });
    }
    let body: {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    try {
      body = (await response.json()) as typeof body;
    } catch {
      return this.fail("INVALID_OUTPUT", "The AI provider returned an invalid response.");
    }
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return this.fail("INVALID_OUTPUT", "The AI provider returned no structured output.");
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return this.fail("INVALID_OUTPUT", "The AI provider returned invalid JSON.");
    }
  }

  private fail(
    category: AiProviderError["category"],
    message: string,
    diagnostic: Omit<AiProviderError["diagnostic"], "provider"> & {
      transportErrorType?: string;
    } = {},
  ): never {
    const error = new AiProviderError(category, message, {
      provider: "gemini",
      ...(diagnostic.status !== undefined ? { status: diagnostic.status } : {}),
      ...(diagnostic.providerRequestId ? { providerRequestId: diagnostic.providerRequestId } : {}),
    });
    observability().error(
      "ai.provider.failed",
      {
        provider: "gemini",
        capability: "structured-json",
        model: this.environment.GEMINI_MODEL,
        failureCategory: category,
        providerStatus: diagnostic.status,
        providerRequestId: diagnostic.providerRequestId,
        transportErrorType: diagnostic.transportErrorType,
      },
      error,
    );
    throw error;
  }
}

function transportErrorName(cause: unknown): string {
  return cause instanceof Error ? cause.name : "UnknownError";
}
