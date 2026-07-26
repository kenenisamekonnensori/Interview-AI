import type { ServerEnvironment } from "@interviewer-ai/config";
import { buildFollowUpGuidance, buildInterviewerBehaviorPrompt } from "@interviewer-ai/prompts";

import { GeminiAdapter } from "./adapters/gemini.js";
import { AiProviderError } from "./errors.js";
import { interviewerResponseProposalSchema } from "./output-schema.js";
import type {
  AiStructuredRequest,
  GenerateInterviewerResponseInput,
  InterviewerResponseProposal,
} from "./types.js";

export interface AiProvider {
  createInterviewPlan(input: AiStructuredRequest): Promise<unknown>;
  generateInterviewerResponse(
    input: GenerateInterviewerResponseInput,
  ): Promise<InterviewerResponseProposal>;
  evaluateInterview(input: AiStructuredRequest): Promise<unknown>;
  generateReport(input: AiStructuredRequest): Promise<unknown>;
  generateStructured<T>(input: AiStructuredRequest, parse: (value: unknown) => T): Promise<T>;
}

class ApplicationAiProvider implements AiProvider {
  constructor(private readonly adapter: GeminiAdapter) {}

  createInterviewPlan(input: AiStructuredRequest) {
    return this.adapter.generateJson(input);
  }

  async generateInterviewerResponse(
    input: GenerateInterviewerResponseInput,
  ): Promise<InterviewerResponseProposal> {
    const instructions = `${buildInterviewerBehaviorPrompt(input.interviewContext)}\n${buildFollowUpGuidance()}`;
    try {
      return interviewerResponseProposalSchema.parse(
        await this.adapter.generateJson({ instructions, context: input }),
      );
    } catch (error) {
      if (error instanceof AiProviderError) throw error;
      throw new AiProviderError(
        "INVALID_OUTPUT",
        "The AI response did not match the required schema.",
        {
          provider: "gemini",
        },
      );
    }
  }

  evaluateInterview(input: AiStructuredRequest) {
    return this.adapter.generateJson(input);
  }

  generateReport(input: AiStructuredRequest) {
    return this.adapter.generateJson(input);
  }

  async generateStructured<T>(input: AiStructuredRequest, parse: (value: unknown) => T) {
    try {
      return parse(await this.adapter.generateJson(input));
    } catch (error) {
      if (error instanceof AiProviderError) throw error;
      throw new AiProviderError(
        "INVALID_OUTPUT",
        "The AI response did not match the required schema.",
        {
          provider: "gemini",
        },
      );
    }
  }
}

export function createAiProvider(environment: ServerEnvironment): AiProvider {
  return new ApplicationAiProvider(new GeminiAdapter(environment));
}
