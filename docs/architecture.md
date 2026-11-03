# Architecture

## Approved AI and Voice Provider Design

The development and production stack is **provider-agnostic at the application boundary**, with these approved providers for the V1 audio platform:

| Capability | Approved provider | Notes |
| :--- | :--- | :--- |
| **Speech-to-text (STT)** | Deepgram Nova-3 | Real-time streaming transcription with interim results and word-level timestamps. |
| **Text-to-speech (TTS)** | Cartesia Sonic / Deepgram Aura-2 | Sub-100ms first-byte streaming audio synthesis in 24 kHz. Cartesia primary, Aura-2 fallback. |
| **Media Transport** | WebRTC via LiveKit SFU | Ultra-low-latency UDP transport (Opus codec, hardware AEC, packet loss concealment). Fastify issues session JWTs and retains state authority. |
| **Realtime Interview Brain** | Google Gemini (2.0 Flash / 1.5 Flash) | BYO streaming think endpoint in the voice loop; plain spoken text with sub-500ms TTFT. |
| **Planning & Document Analysis**| Google Gemini | Extracts structured skills, job requirements, and creates multi-topic interview plans. |
| **Evaluation & Reports** | Google Gemini | Generates multidimensional rubric scores, speech analytics, and STAR exemplar rewrites via structured output. |

The Fastify backend remains the authoritative owner of interview lifecycle, turn persistence, state validation, and billing. Providers are implementation choices, not application contracts.

## Boundaries

```text
Candidate Web App ─── WebRTC (Opus Audio) ───► LiveKit SFU
                                                    │
                                                    ▼
                                          LiveKit Agent Runtime
                                          (Silero VAD + Nova-3 + Gemini + Cartesia)
                                                    │
                                  State sync & turns│
                                                    ▼
Candidate Web App ─── REST + SSE ────────────► Fastify API Gateway (Authority)
                                                    │
                             ┌──────────────────────┴──────────────────────┐
                             ▼                                             ▼
             PostgreSQL (Prisma Models)                       Redis (Cache, Leases, BullMQ)
```

Exactly one live gateway owns an interview's voice timeline. `VoiceSessionRegistry` makes the newest connection the owner (a reconnecting tab supersedes the old one over Redis pub/sub) and `VoiceConcurrencyLimiter` enforces the deployment-wide live-session ceiling (default 100 concurrent sessions), so running several API instances never produces two voices or two silence timelines.

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

Approved AI, voice, and media environment variables for the platform:

```dotenv
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.0-flash
GEMINI_FALLBACK_MODELS=gemini-1.5-flash
DEEPGRAM_API_KEY=
CARTESIA_API_KEY=
LIVEKIT_URL=
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
VOICE_PIPELINE=agent
VOICE_MAX_CONCURRENT_SESSIONS=100
TRANSCRIPT_RETENTION_DAYS=0
```

`GEMINI_API_KEY`, `DEEPGRAM_API_KEY`, `CARTESIA_API_KEY`, and `LIVEKIT_API_SECRET` are strictly server-only. No `NEXT_PUBLIC_` provider key is permitted. Client access to voice is granted solely through signed, short-lived session tokens minted by the Fastify backend.

## Security and Privacy

### Browser origins and cookies
- `WEB_URL` is the primary browser origin and is always the only required CORS origin. Production values must use HTTPS.
- Set `CORS_ALLOWED_ORIGINS` to a comma-separated list only when additional, known browser origins need credentialed API access. Wildcards are not supported.
- Sessions use secure cookies in production and retain development-compatible cookies locally. Set `TRUST_PROXY=true` only when the API runs behind a trusted proxy that correctly supplies forwarding headers.

### Rate limits
The API uses Redis-backed fixed-window limits keyed by client IP:
- Authentication POST endpoints: 10 requests per 10 minutes
- Resume upload creation: 5 requests per 15 minutes
- Voice-token minting: 10 requests per minute
- Conversation POST endpoints: 40 requests per minute

Redis is required for these protected routes. If it is unavailable, they return `503 RATE_LIMIT_UNAVAILABLE` rather than bypassing protection.

### Candidate data and upload security
- Send the smallest resume, job, and conversation context needed for the capability.
- Request logs redact authorization/cookie headers, passwords, tokens, transcript text, and raw job-description text. Conversation and lifecycle logs contain identifiers and event names only; they do not include transcript, prompt, report, or resume content.
- Store recordings only when the product explicitly enables recording and the user has consented; otherwise retain only the validated transcript and derived results required by the product. The current product never stores audio.
- `TRANSCRIPT_RETENTION_DAYS` (default `0`, meaning the interview's lifetime) is the hard age limit for validated transcript turns of completed interviews. When set, `TranscriptRetentionSweeper` deletes the turns only; the interview, its memory and its report remain, so outcomes survive the transcript.
- Resume upload URLs require signed metadata binding the object to the requesting user and resume record. The API verifies this metadata, content type, and exact file size before marking an upload ready and again before a worker parses it.
- Browser-direct R2 uploads require an explicit CORS policy allowing only `PUT` from explicit origins with headers `Content-Type`, `x-amz-meta-owner-user-id`, and `x-amz-meta-resume-id`. No wildcard origins.

## Execution Architecture: Monolith Mode vs Worker Mode

The backend supports two operational modes sharing the exact same business logic services:

### 1. Monolith Mode (Current / MVP Stage)
- **Deployment**: Single Fastify API process. Zero dedicated worker processes required.
- **Redis Requirement**: Optional. If `REDIS_URL` is omitted, in-memory rate limiting is used.
- **Flow**: API endpoints return non-blocking responses (`202 Accepted` / `201 Created`) and execute asynchronous tasks (resume analysis, job description analysis, interview planning, report generation, email outbox) in-process via `MonolithExecutionManager`.
- **Logs**: Emits `[Monolith Mode] Running <operation> directly for <id>`.

### 2. Worker Mode (Future Production Architecture)
- **Deployment**: Fastify API service + dedicated BullMQ workers (`career-analysis.worker.ts`, `report.worker.ts`, `auth-email.worker.ts`).
- **Activation**: Set `WORKER_MODE=true` in environment and start worker processes.
- **Flow**: API endpoints enqueue jobs into Redis BullMQ queues (`career-analysis`, `report-generation`) and background workers process jobs by calling the exact same application services.
- **Workers**: Preserved intact in `apps/api/src/workers/` as thin wrappers around application services (`resume-analysis.service.ts`, `job-analysis.service.ts`, `interview-plan.service.ts`, `ReportService`, `auth-email.service.ts`).

