# Architecture

## Approved AI provider design

The development and initial-release stack is **provider-agnostic at the application boundary**, with these approved first providers:

| Capability | Approved provider | Notes |
| --- | --- | --- |
| Speech-to-text (STT) | Deepgram | Browser audio is transcribed through a short-lived Deepgram access token. |
| Text-to-speech (TTS) | Deepgram | The API synthesizes persisted interviewer text for playback. |
| Live voice transport | Browser WebSocket to Deepgram | The web app owns microphone capture and playback; the backend only issues a short-lived token. |
| Planning and resume/job analysis | Gemini | Gemini returns validated JSON through the AI provider module. |
| Interviewing | Gemini | Gemini generates the next interviewer turn; the Conversation Manager owns state and persistence. |
| Evaluation and reports | Gemini | Implemented through the same provider interface when those modules are added. |

Gemini and Deepgram were chosen for the build-and-test phase because their free allowances make iterative development practical. They are implementation choices, not application contracts. A future OpenAI or other provider must be added as an adapter to the interfaces below; controllers, services, events, and clients must not change to accommodate provider request formats.

## Boundaries

```text
Web app -- REST / short-lived voice token --> Fastify API
Web app -- microphone audio / transcript events --> Deepgram
Fastify Conversation Manager --> AI provider interface --> Gemini adapter
Fastify services --> PostgreSQL / Redis / object storage
```

The Conversation Manager decides when a turn is needed, validates transitions, and persists approved turns. It calls `AiProvider.generateInterviewerResponse`; it does not construct Gemini requests or parse Gemini responses. The AI module alone owns provider SDKs, HTTP payloads, model names, retries, and output conversion.

## Provider interface

The AI module exposes these capability-oriented operations:

```ts
interface AiProvider {
  createInterviewPlan(input: CreateInterviewPlanInput): Promise<InterviewPlan>;
  generateInterviewerResponse(input: GenerateInterviewerResponseInput): Promise<InterviewerResponse>;
  evaluateInterview(input: EvaluateInterviewInput): Promise<InterviewEvaluation>;
  generateReport(input: GenerateReportInput): Promise<InterviewReport>;
}
```

The first Gemini adapter may also provide internal structured-analysis helpers for resume and job analysis. Those helpers remain inside the AI module. The caller supplies domain context and validates the returned domain object; it never sees a Gemini request format.

## Availability and fallback

- If Deepgram is unavailable or unconfigured, voice-token and TTS routes return `VOICE_UNAVAILABLE` (503). The UI must keep the interview usable through typed turns where available and must not expose a long-lived Deepgram key.
- If Gemini is unavailable, malformed, rate-limited, or times out, the affected planning or response operation fails explicitly. Planning marks the interview as failed; a live response returns `AI_RESPONSE_FAILED` (502) and preserves the last valid conversation state so the user can retry. Do not fabricate an interviewer answer or evaluation.
- Provider failures are logged as provider name, capability, status/category, request ID when supplied, and retry count. Prompt text, raw resume content, audio, and credentials are excluded.

## Environment configuration

Only these AI/voice environment variables are approved for the current stack:

```dotenv
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash-lite
DEEPGRAM_API_KEY=
```

`GEMINI_API_KEY` and `DEEPGRAM_API_KEY` are server-only. No `NEXT_PUBLIC_` provider key is permitted. OpenAI environment variables are not part of the approved configuration until an OpenAI adapter is deliberately introduced.

## Privacy

- Send the smallest resume, job, and conversation context needed for the capability.
- Do not log full resumes, raw audio, complete prompts, transcripts, credentials, or provider authorization tokens.
- Store recordings only when the product explicitly enables recording and the user has consented; otherwise retain only the validated transcript and derived results required by the product.
- Use HTTPS, short-lived Deepgram tokens, server-side provider keys, and existing authorization checks for all provider access.
