import type { ServerEnvironment } from "@interviewer-ai/config";
import {
  buildFollowUpGuidance,
  buildGreetingPrompt,
  buildInterviewerBehaviorPrompt,
} from "@interviewer-ai/prompts";

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
    const greetingOnly = input.greetingOnly === true;
    // Greetings skip the full interviewer machinery: no memory/assessment
    // context, a stripped request payload, and a small output budget — the
    // greeting is two or three spoken sentences.
    const instructions = greetingOnly
      ? buildGreetingPrompt({
          interviewType: input.interviewContext.interviewType,
          difficulty: input.interviewContext.difficulty,
          targetRole: input.interviewContext.targetRole,
          language: input.interviewContext.language,
          isGeneralIntake: input.interviewContext.isGeneralIntake,
        })
      : `${buildInterviewerBehaviorPrompt(input.interviewContext)}\n${buildFollowUpGuidance()}`;
    const context =
      greetingOnly === false
        ? input
        : {
            interviewType: input.interviewContext.interviewType,
            difficulty: input.interviewContext.difficulty,
            targetRole: input.interviewContext.targetRole,
            language: input.interviewContext.language,
            isGeneralIntake: input.interviewContext.isGeneralIntake,
          };
    try {
      return interviewerResponseProposalSchema.parse(
        await this.adapter.generateJson({
          instructions,
          context,
          maxOutputTokens: greetingOnly ? 220 : 350,
          ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
          ...(greetingOnly ? { maxAttempts: 2 } : {}),
        }),
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
