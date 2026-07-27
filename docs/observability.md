# Observability Foundation

The API generates a request ID for every request unless the caller supplies a valid `X-Request-Id`; the API returns it in the response header. Safe unexpected, rate-limit, readiness errors also include `requestId` in their JSON body.

Structured events and metrics are emitted through `apps/api/src/services/observability.ts`. The default adapter writes JSON-safe logs through Fastify or the worker console. It records operation names, IDs, outcomes, durations, and status categories, but redacts secrets, credentials, prompts, resume text, transcripts, raw audio, and tokens.

Queue payloads carry `correlationId`, allowing career-analysis and report workers to correlate their job events with the originating request where one exists.

## Connecting a monitoring provider

No monitoring vendor is required. To connect OpenTelemetry, Sentry, Datadog, or another provider, implement the `Observability` interface and install it from the API/worker composition root with `setObservabilityAdapter(adapter)`. Adapters must preserve the data-minimization behavior: export identifiers, operation names, durations, status, and safe error categories only. Do not export request bodies, cookies, authorization headers, AI prompts, resume text, transcripts, audio, provider keys, or presigned URLs.

`GET /health` is a process liveness endpoint. `GET /ready` checks PostgreSQL and Redis without returning dependency URLs or credentials; use it for traffic readiness checks.
