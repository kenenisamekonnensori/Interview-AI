# API & Event Contract

## Purpose

This document defines how every part of Interviewer AI communicates.

It establishes the contracts between the frontend, backend, AI services, and real-time voice session. It is the single source of truth for all HTTP APIs, real-time events, request/response formats, and ownership boundaries.

---

# Communication Principles

The platform uses three communication patterns:

* **REST** — Business operations (authentication, interviews, reports).
* **Realtime** — Live voice sessions, transcripts, and interview events.
* **Function Calls** — Requests from the AI to the backend for business data or actions.

Each pattern has a clear responsibility and should never overlap.

For the approved development stack, Deepgram carries live audio/transcripts and synthesizes speech, while Gemini produces structured reasoning outputs. The browser and REST controllers use only application contracts; Gemini and Deepgram payload formats remain inside their adapters.

---

# REST APIs

REST is used for operations that create, update, retrieve, or delete persistent business data.

Examples:

* Authentication
* Resume management
* Job descriptions
* Interview management
* Reports
* User profile

REST endpoints should be:

* Stateless
* Versioned
* Validated
* Idempotent where appropriate

## Canonical lifecycle ownership

`InterviewStatus` and `ConversationState` are defined in `@interviewer-ai/types` and validated by the backend-owned `modules/conversation/state-machine.ts`. The browser never sends a requested next state.

```text
Interview
DRAFT -> PREPARING -> READY -> IN_PROGRESS -> COMPLETING -> COMPLETED

Cancellation: DRAFT | PREPARING | READY -> CANCELLED
Failure: PREPARING | IN_PROGRESS | COMPLETING -> FAILED

Conversation
GREETING -> LISTENING -> TRANSCRIBING -> THINKING -> SPEAKING -> LISTENING
Any active conversation state -> CLOSING -> COMPLETED
```

The greeting is generated before the first listening state, so its operational transition is `GREETING -> SPEAKING -> LISTENING`. A finalized user transcript follows `LISTENING -> TRANSCRIBING -> THINKING`. These state changes are chosen and persisted by the API.

`LISTENING -> SPEAKING` is reserved for exactly one backend-owned behavior: the canned silence re-engagement. When the candidate stays silent after a greeting, question, or follow-up, the Conversation Manager appends a short fixed-template `CLARIFICATION` turn (never a fabricated answer), pre-warms its TTS, and publishes the standard `AIResponseGenerated` event; the client queues it through the normal playback path and the subsequent playback acknowledgement returns the conversation to `LISTENING`. At most two nudges are delivered per listening period; detected speech schedules a longer watchdog, and the candidate's finalized turn cancels it.

## Implemented interview and conversation endpoints

All endpoints below are under `/api/v1`, require an authenticated verified user, and return the shared DTOs from `@interviewer-ai/types`.

| Method | Path | Request | Result |
| --- | --- | --- | --- |
| `POST` | `/interviews` | `InterviewConfiguration` | Creates an `InterviewDto` in `DRAFT`. |
| `GET` | `/interviews` | — | Lists `InterviewDto`s. |
| `GET` | `/interviews/:id` | — | Returns the owned interview, plan, conversation snapshot, and report when present. The live snapshot contains the current state and the latest 60 persisted turns in sequence order for session restoration. |
| `POST` | `/interviews/:id/prepare` | — | Transitions `DRAFT -> PREPARING` and queues plan generation. |
| `GET` | `/interviews/:id/plan` | — | Returns the current status and `InterviewPlan` when ready. |
| `GET` | `/interviews/:id/state` | — | Returns the authoritative lifecycle state, timestamps, conversation state, and report readiness. |
| `DELETE` | `/interviews/:id` | — | Cancels only a cancellable interview. |
| `POST` | `/interviews/:id/livekit-token` | — | Issues a signed participant JWT for the LiveKit WebRTC audio room. |
| `POST` | `/interviews/:id/voice-token` | — | Returns `{ pipeline, streamPath, streamTicket }`; fallback legacy endpoint for WebSocket bridging. |
| `POST` | `/interviews/:id/conversation/start` | — | Transitions `READY -> IN_PROGRESS` and creates the conversation in `GREETING`, returning immediately; greeting generation is decoupled from the request path and happens through `POST /interviews/:id/conversation/next-response` (the single generation path, so retries never create a second conversation or a duplicate greeting). |
| `POST` | `/interviews/:id/conversation/next-response` | — | Backend generates and persists an AI turn. When a prior request already persisted the pending turn, retries return that same turn without creating another. |
| `POST` | `/interviews/:id/conversation/transcripts` | `{ text, metadata? }` | Persists a finalized user transcript and moves the conversation to `THINKING`. |
| `POST` | `/interviews/:id/conversation/speaking` | — | Publishes an authenticated candidate-speaking event; no audio or interim transcript is persisted. |
| `POST` | `/interviews/:id/conversation/turns/:turnId/playback-completed` | — | Idempotent playback acknowledgement. In the agent pipeline the server already settles the turn when provider audio ends; this keeps the browser UI (and the legacy lane) in sync and completes a closing turn. |
| `POST` | `/interviews/:id/conversation/complete` | — | Idempotently finalizes an active conversation and transitions the interview through `COMPLETING` to `COMPLETED`. It creates one pending report and queues generation; a report failure never reopens or rolls back the completed interview. |
| `GET` | `/interviews/:id/report` | — | Returns the owned report and its `PENDING`, `GENERATING`, `READY`, or `FAILED` status. |
| `POST` | `/interviews/:id/report/retry` | — | Re-queues an owned failed report without changing interview lifecycle state or creating another report. |
| `POST` | `/interviews/:id/drills/new` | `{ questionId?, topic? }` | Creates an ephemeral 3-minute focused voice practice drill for a fumbled question. |
| `GET` | `/analytics/history` | Pagination and optional date/type/role/difficulty filters | Returns owned interview history, including planned, active, failed, and completed states. |
| `GET` | `/analytics/interviews/:id` | — | Returns an owned completed interview only when it has a valid ready report. |
| `GET` | `/analytics/reports` | Optional analytics filters | Returns historical reports backed by valid completed interviews. |
| `GET` | `/analytics/trends` | Optional analytics filters | Returns 0–100 score series separated by interview type. |
| `GET` | `/analytics/summary` | Optional analytics filters | Returns conservative progress summaries, improving areas, and recurring weaknesses. |
| `GET` | `/analytics/next-practice` | — | Returns one owned, conservative next-practice recommendation derived from profile context and schema-valid completed reports. It never creates or changes an interview. |
| `GET` | `/profile` | — | Returns the authenticated user's reusable candidate profile and interview defaults. |
| `PUT` | `/profile` | Profile/settings fields | Validates and updates reusable candidate context and preferences. Profile settings prefill future interviews but never override explicit interview fields. |
| `GET` | `/interviews/:id/conversation/turns/:turnId/audio` | — | Synthesizes persisted AI text for playback. |

Resume upload first creates an owned `PENDING_UPLOAD` record through `POST /resumes/uploads`. The browser normally uploads the supplied signed URL directly to object storage and calls `POST /resumes/:id/complete`. If that browser-to-storage request fails before receiving a response, the web app may instead send the same PDF or DOCX bytes to `POST /resumes/:id/content`; the API applies the same signed ownership metadata, stores the object, verifies it, and returns the ready resume. The fallback is authenticated, accepts at most 10 MB, and is not a second persistence model.

Resume storage and AI analysis are separate states. A profile upload is stored and may be made active without automatically sending it to the AI. A personalized interview requires an `ANALYZED` resume; the client directs the candidate to explicitly start analysis when required. A custom-interview upload may start analysis in the background. Analysis failures retain a safe category (`AI_CONFIGURATION`, `AI_UNAVAILABLE`, `DOCUMENT_UNREADABLE`, `STORAGE_UNAVAILABLE`, or `SYSTEM_ERROR`) so the UI can offer a precise retry or support path without exposing credentials or provider internals.

Errors use `ApiErrorShape`: `{ code, message, details? }`. Invalid lifecycle changes return `409 INVALID_STATE_TRANSITION` (or a more specific lifecycle error); the current persisted state remains authoritative.

---

# Realtime Events

Realtime communication powers the live interview experience.

Events represent something that has already happened.

Examples:

* SessionConnected
* SessionDisconnected
* UserStartedSpeaking
* UserStoppedSpeaking
* TranscriptUpdated
* QuestionGenerated
* AIStartedSpeaking
* AIStoppedSpeaking
* InterviewCompleted

Events should never contain business logic—they only communicate state changes.

### Voice pipeline & media transport

Live voice sessions run through an authoritative server-controlled architecture:
1. **LiveKit WebRTC Audio (Production Core)**: The browser calls `POST /interviews/:id/livekit-token` to obtain a scoped WebRTC JWT. The browser connects via UDP WebRTC Opus, with native browser AEC/AGC/ANS. The autonomous LiveKit Agent worker processes speech via Deepgram Nova-3 and responds via Cartesia Sonic (TTS) and Gemini 2.0 Flash (Think), streaming settled turns back to the Fastify API.
2. **Fastify WebSocket Gateway (Fallback Bridge)**: Selected by `VOICE_PIPELINE=agent` for WebSocket environments. The browser opens a ticketed WebSocket at `/conversation/voice-stream`. Binary PCM frames are forwarded to the agent core.

* The gateway persists both sides of the conversation through the append-turn transaction (candidate statements on `AgentThinking`, interviewer utterances on `AgentAudioDone`), updates the interview memory via the agent-path adapter in `agent-memory.ts` (asked questions, token-mapped topic coverage, closing statements), and publishes the same typed events (`TranscriptFinalized`, `AIResponseGenerated`, `UserSpeechStarted`). A close-classified utterance persists as a `CLOSING` turn and completes the interview through the ordinary lifecycle path.
* Turn-taking is server-authoritative: when the provider finishes sending a turn's audio (`AgentAudioDone`), the gateway itself settles the turn (`SPEAKING -> LISTENING`) and arms the backend silence ladder. The browser's `playback-completed` call is an idempotent UI synchronization, never the event that keeps the interview alive.
* Joining is explicit in the browser (one gesture unlocks audio and the microphone). A fresh session sends the opening greeting verbatim, so the interviewer speaks first without any LLM round trip and even while the think model is slow. A reconnect or page reload with persisted history omits the greeting and injects a resume directive that re-asks the unanswered question (or answers the candidate's last answer) instead of waiting for the candidate to speak first.
* The gateway forwards `agent-thinking` (`AgentThinking`) and `agent-speaking-started` so the UI reflects thinking/speaking instead of showing LISTENING while the interviewer talks.
* Close codes: the gateway closes with `4001` when a newer connection took over the session — the client must not reconnect, it continues in text mode — and with `1013` for capacity/provider failures. Every other drop is recovered by the client's bounded reconnect, which re-fetches a fresh ticket and resumes from persisted state.
* `agent.think` is an ordered chain: `GEMINI_MODEL` first, then the optional `GEMINI_FALLBACK_MODELS` (comma-separated, server-only). The agent runtime retries the next entry when a model fails, and every mid-interview `UpdateThink` refresh resends the whole chain. If every entry is exhausted (`FAILED_TO_THINK`) or the speak stage cannot produce audio (`FAILED_TO_SPEAK`), the gateway sends `think-degraded` with a fixed server template and closes the socket: the client continues the same interview by typing, and no interviewer content is fabricated.
* Post-turn structured assessment runs after the turn is delivered and never in the response path; it updates the persisted memory (answer depth, follow-up need, completed objectives) and the next turn's think instruction. The spoken text itself carries no assessment payload.
* Deliberately not in this skeleton: persisted turn audio for replay (live streaming only).

### Turn-taking, silence policy and metering

Both lanes share one server-owned turn-taking policy (`silence-ladder.ts`):

0. **Greeting guard**: a fresh session's first words are the provider-spoken `agent.greeting` (no LLM call and no injected user turn); a reconnect gets a resume directive. If no interviewer audio arrives within 15 s of `SettingsApplied`, the gateway closes the socket so the client reconnects; bounded reconnects fall back to text mode instead of silent minutes. The ladder only starts once the server has settled a spoken turn, so a slow greeting can never be mistaken for candidate silence.
1. **Nudge** (~12 s idle, or ~25 s after speech that never finalized): a fixed canned line appended as a `CLARIFICATION` turn and delivered through `AIResponseGenerated`; the client plays it through the normal audio path, and the server settles it after a bounded playback fallback if no acknowledgement arrives. Two nudges per listening period.
2. **Move-on** (third silence event, bounded to five per interview): the interviewer changes topic instead of repeating the question. In the agent lane the gateway injects an interviewer control message into the live provider session (`[Interviewer control message]` — never persisted as candidate speech, and its provider echo is suppressed); in the legacy lane the question is generated through the normal turn pipeline with the silence-recovery prompt. The unanswered topic is recorded in interview memory as a weak area.
3. **Graceful close** (move-on budget spent): the agent lane speaks a goodbye through its director; the legacy lane appends a fixed closing turn. Playback acknowledgement runs the ordinary completion path, so the report is produced.

**Duration.** The interview clock is authoritative. The agent gateway arms a timer at `SettingsApplied` and asks the provider to say goodbye at the cap; the legacy lane completes on its next request. Independently, `InterviewSessionSweeper` (every 60 s, 60 s grace) completes any interview whose `startedAt + durationMinutes` has passed, so an abandoned tab still yields its report (a session with no candidate turns keeps the existing empty-report rule instead of fabricating an evaluation).

**Usage counters.** `interview_usage` records server-observed provider consumption per interview: `voiceSeconds` (server-owned agent session), `thinkRequests` (interviewer turns plus post-turn assessments) and `speakCharacters` (real synthesis only — cache hits are free). Counters are additive, never decremented, and never derived from client input; they are the ledger billing will read, while pricing and plan caps remain billing decisions.

## Typed real-time event contract

Event names and payload types are exported by `@interviewer-ai/types` as `RealtimeEventName`, `RealtimeEventPayloads`, and `RealtimeEvent`. Events are published after authoritative backend decisions over Server-Sent Events (SSE) and WebSocket channels; no event payload accepts an arbitrary next state.

| Event | Payload |
| --- | --- |
| `InterviewStarted` | `{ interviewId, conversation }` |
| `UserSpeechStarted` | `{ interviewId, conversationId, occurredAt }` |
| `TranscriptFinalized` | `{ interviewId, conversationId, turn, metadata? }` |
| `AIResponseGenerated` | `{ interviewId, conversationId, turn }` |
| `AIStartedSpeaking` | `{ interviewId, conversationId, turnId, occurredAt }` |
| `InterviewCompletionRequested` | `{ interviewId, conversationId, occurredAt }` |
| `InterviewCompleted` | `{ interviewId, conversationId, occurredAt }` |
| `ReportGenerated` | `{ interviewId, report, occurredAt }` |

The server gateway owns voice transport and publishes this exact typed event vocabulary to synchronize web client state.

### Typed interview fallback

Typed answers use `POST /interviews/:id/conversation/transcripts` with the same validated `{ text, metadata? }` request as a finalized voice transcript. The web app may offer text mode when voice capture, transport, or playback is unavailable, but it may show a composer only while the authoritative conversation is `LISTENING`. Interviewer text remains visible in the shared transcript; when audio cannot play, the client acknowledges the persisted AI turn through `playback-completed` before accepting the next typed answer.

---

# AI Function Calls

The AI never reads or writes the database directly.

Instead, it interacts with the application through approved tools.

Examples:

* Get active resume
* Retrieve job description
* Generate interview context
* Save transcript
* Finish interview
* Generate report

Every tool must have a clear input, output, validation, and ownership.

## AI provider capability contract

The conversation and report modules call an application-facing `AiProvider`, not a provider SDK. Its capabilities are `createInterviewPlan`, `generateInterviewerResponse`, `evaluateInterview`, and `generateReport`. The Conversation Manager persists the valid result and controls the state machine; it never makes an LLM request directly.

Provider failure mappings:

| Condition | API result | State behavior |
| --- | --- | --- |
| Gemini unavailable, invalid output, or timeout during a live turn | `502 AI_RESPONSE_FAILED` with `details.recovery` | Preserve `THINKING`; the safe recovery object reports that the transcript was saved and permits retry, typed continuation, or interview completion. Provider details are never returned. |
| Gemini failure while creating a plan | Interview preparation fails | Do not create a guessed plan. |
| Deepgram unavailable or unconfigured | `503 VOICE_UNAVAILABLE` | Keep non-voice interaction available where supported. |

For a recoverable live-turn failure, `AI_RESPONSE_FAILED.details.recovery` has this application-only shape:

```json
{
  "transcriptSaved": true,
  "conversationState": "THINKING",
  "retryable": true,
  "actions": {
    "retry": true,
    "continueByTyping": true,
    "endInterview": true
  }
}
```

This object intentionally contains no provider diagnostics. It is omitted when the interview is no longer active or the pending state is not recoverable.

---

# API Principles

* Business logic belongs to backend services.
* Realtime transports live state, not persistence.
* AI communicates only through tools.
* PostgreSQL remains the single source of truth.
* Every request and event is typed and validated.
* Events and logs contain minimized data: no full resume, raw audio, complete prompts, or provider credentials.

---

# Success Criteria

An engineer should understand:

* Which communication method to use.
* When to use it.
* Who owns each operation.
* How data moves through the system.
* How the AI interacts with the application.
