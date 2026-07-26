# AI System

## Purpose

This document defines the application-facing AI contract. It complements [architecture.md](./architecture.md): Gemini is the initial reasoning adapter and Deepgram owns voice, but neither provider leaks into controllers or domain services.

## Responsibilities

The AI system reasons over supplied, minimized context and returns structured suggestions. Backend modules validate those suggestions and remain responsible for authorization, state transitions, persistence, scoring policy, and report publication. Provider HTTP clients, retries, error normalization, structured-output schemas, and allowed tool bridges belong exclusively to `apps/api/src/modules/ai`.

| Capability | Input | Output | Owner |
| --- | --- | --- | --- |
| `createInterviewPlan` | Interview configuration plus analyzed resume/job context | Validated plan | AI provider |
| `generateInterviewerResponse` | Plan, recent validated turns, interview settings | One interviewer turn and requested next state | AI provider |
| `evaluateInterview` | Completed validated transcript and rubric | Structured evaluation | AI provider |
| `generateReport` | Validated evaluation and interview metadata | Candidate-facing report | AI provider |

Resume and job-description extraction use the AI module's internal structured-analysis facility. They are not a controller integration point.

## Contract rules

1. Controllers call an `AiProvider` capability, never Gemini/OpenAI SDKs, URLs, or request formats.
2. Prompts belong in `packages/prompts`; adapters may add provider-specific response-format instructions without changing domain prompts.
3. Every provider response is parsed and validated against a domain schema before it is persisted or returned.
4. Models may propose content, never call the database or make authorization decisions.
5. Adding OpenAI later means implementing `AiProvider` and selecting it in composition/configuration. It does not mean adding OpenAI conditionals to controllers.
6. An interviewer proposal is limited to response text, response type, recommended action, optional topic/objective references, and a suggested conversation state. The Conversation Manager validates that proposal against the persisted session before applying an allowed turn transition.

## Live-turn sequence

```text
Deepgram final transcript -> Conversation Manager validates/persists user turn
                         -> AiProvider.generateInterviewerResponse
                         -> validate response + persist AI turn
                         -> Deepgram TTS plays persisted text
```

Voice transport is deliberately separate from the LLM. A live voice provider is not an AI-orchestration provider in this design.

## Failure and privacy behavior

The AI module exposes categorized errors to its caller without provider payloads. The caller maps them to the documented API error contract and keeps existing persisted state intact. Logs may contain operational metadata only; see [architecture.md](./architecture.md#privacy) for the data-minimization rules.
