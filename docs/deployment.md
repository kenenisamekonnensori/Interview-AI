# Production Deployment

## Selected deployment model

The supported template is a **Docker-compatible container platform** using [docker-compose.production.example.yml](../docker-compose.production.example.yml). It is vendor-neutral: run the same images on a managed container service, Kubernetes, or a VM orchestrator. PostgreSQL, Redis, and R2 are external managed services; do not run the development `docker-compose.yml` database/Redis services in production.

## Service topology

### Monolith Mode (Default / MVP Deployment)
```text
Browser -> Next.js web -> Fastify API (Monolith) -> PostgreSQL
                            |                     -> R2 (optional)
                            |                     -> Redis (optional)
                            |                     -> Gemini / Deepgram / Resend
```
In Monolith Mode, the backend deploys as a **single Fastify API service** (e.g. on Render, Heroku, or Fly.io). No dedicated worker processes or Redis queues are required for full application functionality.

### Worker Mode (Future Production Architecture)
```text
Browser -> Next.js web -> Fastify API -> PostgreSQL
                            |          -> Redis / BullMQ
                            |          -> R2
                            |          -> Gemini / Deepgram / Resend
BullMQ career-analysis worker -> Redis, PostgreSQL, R2, Gemini
BullMQ report worker          -> Redis, PostgreSQL, Gemini
Auth-email worker             -> PostgreSQL, Resend
```
When `WORKER_MODE=true` is set, API enqueues tasks to Redis queues and dedicated worker processes execute jobs.

The API and each worker are independently scalable in Worker Mode. Run exactly one migration job per release; do not let every API replica execute migrations concurrently.

## Environment variables

| Variable | Owner | Visibility | Purpose |
| --- | --- | --- | --- |
| `NODE_ENV` | API, workers, web build | Server/build | Set `production` for deployed containers. |
| `NEXT_PUBLIC_API_URL` | Web | **Public/build-time** | Browser API base URL. Rebuild the web image when it changes. |
| `WEB_URL` | API | Server-only | Exact primary browser origin for CORS/auth redirects. |
| `CORS_ALLOWED_ORIGINS` | API | Server-only | Optional comma-separated additional explicit origins. |
| `TRUST_PROXY` | API | Server-only | Enable only behind a trusted forwarding proxy. |
| `API_PORT` | API | Server-only | Fastify listener port; defaults to `4000`. |
| `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET` | API, auth worker | Server-only | Auth public API URL and 32+ character secret. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | API | Server-only | Google OAuth configuration. |
| `DATABASE_URL` | API, all workers, migration job | Server-only | PostgreSQL connection string. |
| `REDIS_URL` | API, BullMQ workers | Server-only | Redis connection string; prefer `rediss://` when supported. |
| `RESEND_API_KEY`, `EMAIL_FROM` | Auth email worker/API | Server-only | Transactional email delivery. |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | API, AI/report workers | Server-only | Gemini reasoning provider. |
| `DEEPGRAM_API_KEY` | API | Server-only | Deepgram voice token/TTS provider. |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_ENDPOINT` | API, career worker, cleanup/offboarding jobs | Server-only | S3-compatible resume storage. `R2_ACCOUNT_ID` is operational metadata; current SDK requests use the endpoint and access keys. |

Use the root [.env.example](../.env.example) as the complete secret-manager/template inventory. No `NEXT_PUBLIC_` variable may contain provider or storage credentials.

## Build and release strategy

1. Run CI: typecheck, lint, formatting check, build, tests, and container image builds.
2. Build immutable API and web images, tagging them with the source revision.
3. Back up PostgreSQL and review migration impact as documented in [database operations](./database-operations.md).
4. Run the API image once as the `migrate` job: `ENV_FILE=.env.production docker compose -f docker-compose.production.example.yml --profile release run --rm migrate`. This runs `prisma migrate deploy` and exits.
5. Start/update API, career-analysis worker, report worker, auth-email worker, and web images using the same release tag.
6. Verify `/health`, `/ready`, worker queue metrics, authentication, and a non-sensitive browser smoke test.

The migration job is intentionally separate from application startup. For the provided template, run the migration command above, then start the long-running services with `ENV_FILE=.env.production docker compose -f docker-compose.production.example.yml up -d`. If it fails, do not start the new application images. A managed platform should implement the same ordering with a one-off release job, never by having each API replica run migrations at startup. `ENV_FILE` defaults to `.env.production` and can point to an untracked secret-manager export during validation.

## Manual cloud configuration

- Provision PostgreSQL with encrypted backups and least-privilege application credentials.
- Provision Redis with authentication/TLS where available.
- Create an R2 bucket and CORS policy for the explicit web origins and signed upload headers documented in [security](./security.md).
- Store all server-only values in the deployment platform’s secret manager; do not place `.env.production` in source control or image layers.
- Configure HTTPS/TLS at the ingress and set `TRUST_PROXY=true` only for a trusted proxy.
- Route `app.example.com` to web and `api.example.com` to API; allow workers no public ingress.
- Connect a monitoring adapter as described in [observability](./observability.md).

## Rollback

1. Stop rollout and keep the previous immutable image tag available.
2. If migration has not run, redeploy the previous web/API/worker images.
3. If an additive migration has run, deploy the previous compatible application version only after confirming it tolerates the added schema. Do not delete columns/tables as a rollback shortcut.
4. For an incompatible future migration, create a forward corrective migration; restore PostgreSQL only after an incident review and an isolated restore rehearsal.
5. Resume workers only after confirming Redis queues and database state are compatible with the selected image version.
