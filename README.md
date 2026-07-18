# Interviewer AI

Interviewer AI is a voice-first interview preparation platform built as a pnpm monorepo.

## Applications

| Application | Directory  | Responsibility                                  | Deployment target |
| ----------- | ---------- | ----------------------------------------------- | ----------------- |
| Web         | `apps/web` | Next.js candidate experience and voice controls | Vercel            |
| API         | `apps/api` | Fastify business API and AI orchestration       | Railway or Fly.io |

The applications are separate deployable units. Shared contracts, configuration, utilities, prompts, and UI primitives live in `packages/` and never contain application-specific business logic.

## Local development

1. Copy `.env.example` to `.env` and fill in the required values.
2. Run `docker compose up -d` to start PostgreSQL and Redis.
3. Run `pnpm install`.
4. Run `pnpm dev` to start both applications.

Use `pnpm lint`, `pnpm typecheck`, and `pnpm build` before merging changes.

## Deployment

Deploy the web application from `apps/web` on Vercel. Deploy the API using `apps/api/Dockerfile` with the repository root as the Docker build context. Configure the environment variables defined in `.env.example` in each deployment environment; never commit secrets.
