# Queue Operations

## Career-analysis retry policy

Career-analysis jobs make at most three attempts with a 10-second exponential backoff. Only transient AI-provider and unexpected dependency failures retry. Invalid AI output, missing provider configuration, invalid documents, failed storage verification, and storage configuration failures are terminal.

Terminal failures set the corresponding resume, job description, or interview to `FAILED`. BullMQ retains the failed job (up to 1,000) with a safe `QUEUE_FAILURE:<code>` reason and attempt history. It does not retain provider responses, resume/job text, prompts, credentials, or stack traces beyond one safe wrapper frame.

Resume and job analyses use upserts and finalize an existing analysis without another provider call after an ambiguous retry. Interview-plan retries detect an already persisted plan and only finish its state transition; they do not create a second plan/version.

## Inspect and recover failed jobs

Run these commands from a checked-out, configured deployment environment with the same `REDIS_URL` as the worker:

```bash
pnpm --filter @interviewer-ai/api queue:inspect
pnpm --filter @interviewer-ai/api queue:retry -- <failed-job-id>
```

Inspect output deliberately excludes job payloads because they contain internal identifiers. Retry only after the safe failure code identifies a remediated cause. The command retries one explicitly named failed job; it never bulk-retries jobs.

## Shutdown behavior

Workers handle `SIGINT` and `SIGTERM`: they pause before accepting more work, wait for an active job to settle, close BullMQ/Redis connections, then disconnect Prisma. If the platform terminates the process before that completes, BullMQ's stalled-job recovery returns the unfinished job to the queue for its bounded retry policy.
