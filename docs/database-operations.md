# Database and Object-Storage Operations

## Release migrations

Generate Prisma Client during build and run migrations as a separate release step, before starting new API or worker instances:

```bash
pnpm --filter @interviewer-ai/api prisma:generate
pnpm --filter @interviewer-ai/api prisma:migrate:deploy
```

CI may run `prisma migrate status` against an ephemeral or review database. Production releases must run `prisma:migrate:deploy` once, with the production `DATABASE_URL` supplied by the deployment secret manager. Never use `prisma migrate dev`, `db push`, or reset commands against production.

Migration `20260728000000_add_query_indexes` is additive and data-compatible. **Manual production review is required** for large tables because normal `CREATE INDEX` can take locks; schedule it during a low-traffic window or use an approved concurrent-index deployment procedure before marking the migration applied.

## Backup and restore

Before every production migration:

1. Verify a recent encrypted PostgreSQL backup and perform a restore rehearsal regularly.
2. Create a logical backup with an operator-managed command such as `pg_dump --format=custom --no-owner --file=interviewer-ai-<timestamp>.dump "$DATABASE_URL"`.
3. Store the dump using the approved encrypted backup location and record the migration version.

Restore only into an isolated database first:

```bash
createdb interviewer_ai_restore
pg_restore --clean --if-exists --no-owner --dbname=interviewer_ai_restore interviewer-ai-<timestamp>.dump
```

Validate Prisma migration status and application smoke tests against the restored database before any production recovery. R2 resume objects are not contained in PostgreSQL backups: enable R2 versioning/retention or maintain an approved object-storage replication/backup policy separately.

## Soft deletion and storage cleanup

Visible resume and job-description queries must filter `deletedAt: null`; workers also ignore deleted records and do not use deleted resume/job context when preparing an interview. Historical interviews retain nullable references for audit/history without exposing deleted resources as reusable inputs.

Abandoned `PENDING_UPLOAD` resumes older than 24 hours are cleaned with a dry-run-first operator command:

```bash
pnpm --filter @interviewer-ai/api cleanup:resume-uploads
pnpm --filter @interviewer-ai/api cleanup:resume-uploads -- --execute
```

The command deletes the R2 object before marking the row `DELETED`. If R2 is unavailable it stops without changing the row, so it can be retried safely. Failed analyses are retained for user recovery and are not automatically deleted.

## Account deletion

There is deliberately no self-service endpoint in this slice. Use the authenticated support/offboarding workflow, verify the account identifier, then run:

```bash
pnpm --filter @interviewer-ai/api account:delete -- <user-id> --confirm
```

The command deletes every owned R2 resume object first, then deletes the user. Existing foreign-key cascades remove owned database records (profile, sessions, accounts, resumes, jobs, interviews, analyses, conversations, reports, and outbox entries). If object deletion fails, the database account remains intact and the operator can retry; this avoids orphaning private files.
