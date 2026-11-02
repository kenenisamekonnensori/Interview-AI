# Operations Runbook

## Purpose

This runbook defines operational procedures for database migrations, backups, storage lifecycle, BullMQ queue management, account deletion, and billing reconciliation for Interviewer AI.

---

## 1. Database and Object-Storage Operations

### Release migrations

Generate Prisma Client during build and run migrations as a separate release step before starting new API or worker instances:

```bash
pnpm --filter @interviewer-ai/api prisma:generate
pnpm --filter @interviewer-ai/api prisma:migrate:deploy
```

- CI runs `prisma migrate status` against an ephemeral review database.
- Production releases must run `prisma:migrate:deploy` once with the production `DATABASE_URL` supplied by the deployment secret manager.
- Never use `prisma migrate dev`, `db push`, or reset commands against production.
- For migrations adding indexes on large tables, schedule during low-traffic windows or apply concurrently before marking the migration applied.

### Backup and restore

Before every production migration or major maintenance window:

1. Verify a recent encrypted PostgreSQL backup and perform a restore rehearsal regularly.
2. Create a logical backup using an operator command:
   ```bash
   pg_dump --format=custom --no-owner --file=interviewer-ai-<timestamp>.dump "$DATABASE_URL"
   ```
3. Store the dump using the approved encrypted backup location and record the migration version.

Restore into an isolated database first to verify integrity:

```bash
createdb interviewer_ai_restore
pg_restore --clean --if-exists --no-owner --dbname=interviewer_ai_restore interviewer-ai-<timestamp>.dump
```

Validate Prisma migration status and application smoke tests against the restored database before any production recovery. R2 resume objects are not contained in PostgreSQL backups: maintain R2 versioning/retention policies separately.

### Soft deletion and storage cleanup

Visible resume and job-description queries must filter `deletedAt: null`; workers also ignore deleted records and do not use deleted resume/job context when preparing an interview. Historical interviews retain nullable references for audit/history without exposing deleted resources as reusable inputs.

Abandoned `PENDING_UPLOAD` resumes older than 24 hours are cleaned with a dry-run-first operator command:

```bash
pnpm --filter @interviewer-ai/api cleanup:resume-uploads
pnpm --filter @interviewer-ai/api cleanup:resume-uploads -- --execute
```

The command deletes the R2 object before marking the row `DELETED`. If R2 is unavailable it stops without changing the row, so it can be retried safely. Failed analyses are retained for user recovery and are not automatically deleted.

### Account deletion

Use the authenticated support/offboarding workflow, verify the account identifier, then execute:

```bash
pnpm --filter @interviewer-ai/api account:delete -- <user-id> --confirm
```

The command deletes every owned R2 resume object first, then deletes the user record. Existing foreign-key cascades remove owned database records (profile, sessions, accounts, resumes, jobs, interviews, analyses, conversations, reports, and outbox entries). If object deletion fails, the database account remains intact and the operator can retry; this prevents orphaning private files.

---

## 2. Queue Operations (BullMQ & Worker Mode)

### Career-analysis retry policy

Career-analysis jobs make at most three attempts with a 10-second exponential backoff.
- Only transient AI-provider and unexpected dependency failures retry.
- Invalid AI output, missing provider configuration, invalid documents, failed storage verification, and storage configuration failures are terminal.
- Terminal failures set the corresponding resume, job description, or interview to `FAILED`.
- BullMQ retains failed jobs (up to 1,000) with a safe `QUEUE_FAILURE:<code>` reason and attempt history. Payloads do not retain provider responses, resume/job text, prompts, credentials, or stack traces beyond one safe wrapper frame.
- Resume and job analyses use upserts to finalize an existing analysis without redundant provider calls on ambiguous retry.
- Interview-plan retries detect an already persisted plan and finish its state transition without creating duplicate plans.

### Inspect and recover failed jobs

Run these commands from a configured deployment environment with the worker's `REDIS_URL`:

```bash
# Inspect failed jobs in queue
pnpm --filter @interviewer-ai/api queue:inspect

# Retry a specific failed job
pnpm --filter @interviewer-ai/api queue:retry -- <failed-job-id>
```

Inspect output excludes job payloads because they contain user identifiers. Retry only after the safe failure code identifies a remediated cause. The command retries one explicitly named failed job; it never bulk-retries blindly.

### Shutdown behavior

Workers handle `SIGINT` and `SIGTERM`: they pause before accepting more work, wait for active jobs to settle, close BullMQ/Redis connections, then disconnect Prisma. If the platform terminates the process before that completes, BullMQ's stalled-job recovery returns the unfinished job to the queue for bounded retry.

---

## 3. Billing & Subscription Operations

### Webhook verification

Paddle webhook events are verified with `@paddle/paddle-node-sdk` using `PADDLE_WEBHOOK_SECRET_KEY`. Events are processed idempotently based on `eventId` recorded in `BillingEvent`.

### Subscription reconciliation

If webhook delivery is delayed or an out-of-sync subscription state is detected, run the billing reconciliation script:

```bash
pnpm --filter @interviewer-ai/api billing:reconcile
```

This verifies customer status, active tiers, and usage counters directly with Paddle and synchronizes local `Subscription` records.
