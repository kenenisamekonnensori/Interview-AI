import type { ServerEnvironment } from "@interviewer-ai/config";
import { AiProviderError } from "../errors.js";
import { withAiRetry } from "../retry.js";
import type { AiStructuredRequest } from "../types.js";

export class GeminiAdapter {
  constructor(private readonly environment: ServerEnvironment) {}

  async generateJson({ instructions, context }: AiStructuredRequest): Promise<unknown> {
    if (!this.environment.GEMINI_API_KEY)
      throw new AiProviderError("CONFIGURATION", "The AI provider is not configured.", {
        provider: "gemini",
      });
    return withAiRetry(() => this.requestJson(instructions, context));
  }

  private async requestJson(instructions: string, context: unknown): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.environment.GEMINI_MODEL}:generateContent?key=${this.environment.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: instructions }] },
            contents: [{ role: "user", parts: [{ text: JSON.stringify(context) }] }],
            generationConfig: { responseMimeType: "application/json" },
          }),
        },
      );
    } catch {
      throw new AiProviderError("TRANSIENT", "The AI provider could not be reached.", {
        provider: "gemini",
      });
    }
    if (!response.ok) {
      const category =
        response.status === 408 || response.status === 429 || response.status >= 500
          ? "TRANSIENT"
          : "PROVIDER";
      throw new AiProviderError(category, "The AI provider returned an error.", {
        provider: "gemini",
        status: response.status,
      });
    }
    const body = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text)
      throw new AiProviderError(
        "INVALID_OUTPUT",
        "The AI provider returned no structured output.",
        {
          provider: "gemini",
        },
      );
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new AiProviderError("INVALID_OUTPUT", "The AI provider returned invalid JSON.", {
        provider: "gemini",
      });
    }
  }
}
