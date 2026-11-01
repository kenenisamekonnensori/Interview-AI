# Observability Foundation

The API generates a request ID for every request unless the caller supplies a valid `X-Request-Id`; the API returns it in the response header. Safe unexpected, rate-limit, readiness errors also include `requestId` in their JSON body.

Structured events and metrics are emitted through `apps/api/src/services/observability.ts`. The default adapter writes JSON-safe logs through Fastify or the worker console. It records operation names, IDs, outcomes, durations, and status categories, but redacts secrets, credentials, prompts, resume text, transcripts, raw audio, and tokens.

Queue payloads carry `correlationId`, allowing career-analysis and report workers to correlate their job events with the originating request where one exists.

## Connecting a monitoring provider

No monitoring vendor is required. To connect OpenTelemetry, Sentry, Datadog, or another provider, implement the `Observability` interface and install it from the API/worker composition root with `setObservabilityAdapter(adapter)`. Adapters must preserve the data-minimization behavior: export identifiers, operation names, durations, status, and safe error categories only. Do not export request bodies, cookies, authorization headers, AI prompts, resume text, transcripts, audio, provider keys, or presigned URLs.

## Voice gateway events

The server-owned agent pipeline (`VOICE_PIPELINE=agent`) emits these events; all carry `interviewId` and identifiers only, never prompts, transcripts or audio:

| Event | Meaning |
| --- | --- |
| `voice.gateway.session_started` | A gateway session began; includes the replayed history turn count. |
| `voice.agent.connecting` / `voice.agent.ready` / `voice.agent.setup_failed` | Provider setup progress and deadline-bounded setup failure. |
| `voice.gateway.user_turn_persisted` / `voice.gateway.agent_turn_persisted` | A conversation turn was committed; includes sequence and turn kind. |
| `voice.gateway.assessment_saved` | Post-turn structured assessment updated memory (answer depth, follow-up need, topic). |
| `voice.gateway.context_refresh_requested` | A mid-interview `UpdateThink` refresh was sent; includes asked-question and covered-topic counts. |
| `voice.gateway.think_warning` | A think-stage warning (`THINK_REQUEST_FAILED`, `SLOW_THINK_REQUEST`); the fallback chain absorbs it. |
| `voice.gateway.degraded` | The think/speak chain was exhausted; the session moved to the text lane. |
| `voice.gateway.provider_closed` / `voice.agent.closed` | The provider closed the session; includes the close code. |
| `voice.provider.deadline_exceeded` | A voice segment blew its deadline (connect, setup, TTS, Deepgram call). |
| `voice.gateway.move_on_requested` | The silence ladder asked the live agent to change topic. |
| `voice.gateway.closing_requested` | The ladder or the duration cap asked the live agent to say goodbye. |
| `voice.gateway.duration_reached` | The interview clock reached its cap; the session is closing. |
| `voice.gateway.greeting_timed_out` | No greeting audio arrived within the deadline; the client reconnects to retry it. |
| `voice.gateway.greeting_scheduled` | A fresh session will be greeted by the provider's verbatim `agent.greeting`. |
| `voice.gateway.resume_injected` | A reconnect with persisted history received a resume directive instead of a second greeting. |
| `voice.gateway.injection_refused` | The provider refused an injected control message; the ladder or the next turn recovers. |
| `voice.gateway.user_turn_deferred` | A user turn arrived before the previous AI turn settled; it was kept for the next flush instead of failing the session. |
| `voice.gateway.settle_skipped` | Server-side turn settlement found the state already advanced; carries the conversation error code, never content. |
| `voice.gateway.superseded` | A newer connection claimed the interview's live session; this gateway closed with code `4001`. |
| `voice.gateway.capacity_rejected` | The deployment's live voice session ceiling was reached; includes active count and limit. |
| `voice.session.lease_failed` / `voice.session.redis_error` / `voice.session.supersede_handler_failed` | Multi-instance ownership lease or takeover problems (Redis optional; in-process fallback). |
| `voice.concurrency.acquire_failed` / `voice.concurrency.redis_error` | The shared concurrency counter was unavailable; the limiter degrades to the process view. |
| `transcript.retention.started` / `transcript.retention.deleted` / `transcript.retention.failed` | Configurable transcript retention ran; includes the cutoff, never transcript content. |
| `conversation.silence.nudge` / `conversation.silence.move_on` / `conversation.silence.closed` | Ladder stage delivered, with lane (`agent`/`legacy`). |
| `conversation.silence.stage_failed` / `conversation.silence.close_failed` | A ladder stage failed; the next stage or the sweeper recovers. |
| `conversation.playback.settle_fallback` | A canned turn was never acknowledged and the server settled it itself. |
| `interview.sweeper.started` / `interview.sweeper.swept` / `interview.sweeper.completion_failed` | Abandoned-session sweep ran and what it completed. |
| `usage.interview.record_failed` | A provider usage counter could not be written (metering never fails an interview). |

`GET /health` is a process liveness endpoint. `GET /ready` checks PostgreSQL and Redis without returning dependency URLs or credentials; use it for traffic readiness checks.
