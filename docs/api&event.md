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

## Implemented interview and conversation endpoints

All endpoints below are under `/api/v1`, require an authenticated verified user, and return the shared DTOs from `@interviewer-ai/types`.

| Method | Path | Request | Result |
| --- | --- | --- | --- |
| `POST` | `/interviews` | `InterviewConfiguration` | Creates an `InterviewDto` in `DRAFT`. |
| `GET` | `/interviews` | — | Lists `InterviewDto`s. |
| `GET` | `/interviews/:id` | — | Returns the owned interview, plan, conversation, and report when present. |
| `POST` | `/interviews/:id/prepare` | — | Transitions `DRAFT -> PREPARING` and queues plan generation. |
| `GET` | `/interviews/:id/plan` | — | Returns the current status and `InterviewPlan` when ready. |
| `GET` | `/interviews/:id/state` | — | Returns the authoritative lifecycle state, timestamps, conversation state, and report readiness. |
| `DELETE` | `/interviews/:id` | — | Cancels only a cancellable interview. |
| `POST` | `/interviews/:id/voice-token` | — | Returns a short-lived Deepgram browser token. |
| `POST` | `/interviews/:id/conversation/start` | — | Transitions `READY -> IN_PROGRESS` and creates the conversation. |
| `POST` | `/interviews/:id/conversation/next-response` | — | Backend generates and persists an AI turn; the model cannot choose lifecycle state. |
| `POST` | `/interviews/:id/conversation/transcripts` | `{ text, metadata? }` | Persists a finalized user transcript and moves the conversation to `THINKING`. |
| `POST` | `/interviews/:id/conversation/turns/:turnId/playback-completed` | — | Records completed AI playback and moves to `LISTENING`, or completes a closing turn. |
| `POST` | `/interviews/:id/conversation/complete` | — | Idempotently moves an active interview to `COMPLETING`, finalizes the conversation, and queues evaluation/report generation. The worker marks it `COMPLETED` only after a valid report is persisted. |
| `GET` | `/interviews/:id/conversation/turns/:turnId/audio` | — | Synthesizes persisted AI text for playback. |

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

The client obtains a short-lived Deepgram token from `POST /api/v1/interviews/:id/voice-token`. It sends raw audio directly to Deepgram and sends only the finalized, validated transcript text to the API as a conversation turn. Raw audio is neither proxied through nor persisted by the API by default.

## Typed real-time event contract

Event names and payload types are exported by `@interviewer-ai/types` as `RealtimeEventName`, `RealtimeEventPayloads`, and `RealtimeEvent`. Events are facts emitted after backend decisions; no event payload accepts an arbitrary next state.

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

The current voice transport is Deepgram's browser WebSocket, with REST acknowledgements for finalized transcripts and playback completion. A future application WebSocket/SSE transport must publish this exact event union rather than inventing a second event vocabulary.

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
| Gemini unavailable, invalid output, or timeout during a live turn | `502 AI_RESPONSE_FAILED` | Preserve the last valid state; client can retry. |
| Gemini failure while creating a plan | Interview preparation fails | Do not create a guessed plan. |
| Deepgram unavailable or unconfigured | `503 VOICE_UNAVAILABLE` | Keep non-voice interaction available where supported. |

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
