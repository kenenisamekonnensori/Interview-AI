# Security Configuration

## Browser origins and cookies

`WEB_URL` is the primary browser origin and is always the only required CORS origin.
Set `CORS_ALLOWED_ORIGINS` to a comma-separated list only when additional, known browser origins need credentialed API access. Wildcards are not supported. Production `WEB_URL` values must use HTTPS.

Sessions use secure cookies in production and retain development-compatible cookies locally. Set `TRUST_PROXY=true` only when the API runs behind a trusted proxy that correctly supplies forwarding headers; otherwise leave it `false` so client IP rate limiting cannot be spoofed.

## Rate limits

The API uses Redis-backed fixed-window limits keyed by client IP:

- authentication POST endpoints: 10 requests per 10 minutes;
- resume upload creation: 5 requests per 15 minutes;
- voice-token minting: 10 requests per minute;
- conversation POST endpoints: 40 requests per minute.

Redis is required for these protected routes. If it is unavailable, they return `503 RATE_LIMIT_UNAVAILABLE` rather than bypassing protection.

## Candidate data

Request logs redact authorization/cookie headers, passwords, tokens, transcript text, and raw job-description text. Conversation and lifecycle logs contain identifiers and event names only; they do not include transcript, prompt, report, or resume content.

Resume upload URLs require signed metadata binding the object to the requesting user and resume record. The API verifies this metadata, content type, and exact file size before marking an upload ready and again before a worker parses it. The worker also checks the queued user ID against the persisted resume owner.

For browser-direct R2 uploads, configure the bucket CORS policy to allow only the same explicit origins and the `PUT` method. It must allow the request headers `Content-Type`, `x-amz-meta-owner-user-id`, and `x-amz-meta-resume-id`; do not use a wildcard origin for credentialed application traffic.
