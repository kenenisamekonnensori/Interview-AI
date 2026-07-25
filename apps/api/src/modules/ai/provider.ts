import type { ServerEnvironment } from "@interviewer-ai/config";
import type { InterviewerResponse } from "@interviewer-ai/prompts";
import { conversationTurnTypeSchema } from "@interviewer-ai/types";
import { z } from "zod";

export type AiCapabilityInput = {
  instructions: string;
  context: unknown;
};

export type StructuredGenerationInput = AiCapabilityInput;

/**
 * Application-facing reasoning contract. Provider payloads and SDKs must not
 * escape this module.
 */
export interface AiProvider {
  createInterviewPlan(input: AiCapabilityInput): Promise<unknown>;
  generateInterviewerResponse(input: AiCapabilityInput): Promise<InterviewerResponse>;
  evaluateInterview(input: AiCapabilityInput): Promise<unknown>;
  generateReport(input: AiCapabilityInput): Promise<unknown>;
  generateStructured<T>(input: StructuredGenerationInput, parse: (value: unknown) => T): Promise<T>;
}

export class AiProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiProviderError";
  }
}

const interviewerResponseSchema = z.object({
  text: z.string().trim().min(1).max(4_000),
  turnType: conversationTurnTypeSchema.extract([
    "QUESTION",
    "FOLLOW_UP",
    "CLARIFICATION",
    "CLOSING",
  ]),
});

class GeminiAiProvider implements AiProvider {
  constructor(private readonly environment: ServerEnvironment) {}

  async createInterviewPlan(input: AiCapabilityInput) {
    return this.generateJson(input);
  }

  async generateInterviewerResponse(input: AiCapabilityInput): Promise<InterviewerResponse> {
    return interviewerResponseSchema.parse(await this.generateJson(input));
  }

  async evaluateInterview(input: AiCapabilityInput) {
    return this.generateJson(input);
  }

  async generateReport(input: AiCapabilityInput) {
    return this.generateJson(input);
  }

  async generateStructured<T>(input: StructuredGenerationInput, parse: (value: unknown) => T) {
    return parse(await this.generateJson(input));
  }

  private async generateJson({ instructions, context }: AiCapabilityInput): Promise<unknown> {
    if (!this.environment.GEMINI_API_KEY) {
      throw new AiProviderError("The AI provider is not configured.");
    }
    let response: Response;
    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.environment.GEMINI_MODEL}:generateContent?key=${this.environment.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: instructions }] },
            contents: [
              {
                role: "user",
                parts: [{ text: typeof context === "string" ? context : JSON.stringify(context) }],
              },
            ],
            generationConfig: { responseMimeType: "application/json" },
          }),
        },
      );
    } catch {
      throw new AiProviderError("The AI provider could not be reached.");
    }
    if (!response.ok) throw new AiProviderError(`The AI provider returned ${response.status}.`);
    const body = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new AiProviderError("The AI provider returned no response.");
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new AiProviderError("The AI provider returned invalid structured output.");
    }
  }
}

export function createAiProvider(environment: ServerEnvironment): AiProvider {
  return new GeminiAiProvider(environment);
}
