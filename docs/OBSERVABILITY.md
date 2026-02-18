# Observability and Logging

## Goals
- One runtime log destination in production: Cloudflare Logs.
- Local developer visibility: terminal output during `bun run dev`.
- Keep Supabase for business audit events only (not high-volume runtime logs).

## What Goes Where
- Runtime logs (info/warn/error):
  - Emitted by `pino` to stdout.
  - Local: visible in terminal.
  - Cloudflare deploys: captured by Cloudflare Logs/Log Explorer.
- Business audit events:
  - Stored in `audit_events` table in Supabase.
  - Used for accountability (stage changes, validations, submissions, imports).
  - Viewed by committee in `/admin/audit` and exported via `GET /api/audit/export`.

## Runtime Log Shape
- `requestId`: correlation id returned as `errorId` on API failures.
- `operation`: endpoint-level operation key (for filtering/search).
- `status`: response status code.
- `durationMs`: request latency.
- `level`: log severity (`info`, `warn`, `error`).

## Commands
- Local development logs:
```bash
bun run dev
```
- Deployed real-time log tail:
```bash
wrangler tail
```

## Retention Guidance
- Cloudflare runtime logs: keep short-to-medium retention for debugging/operations.
- Supabase `audit_events`: keep longer retention because this supports selection-process traceability.

## Privacy and Redaction
- Do not log secrets, auth tokens, or full document payloads.
- Keep `metadata` in audit events minimal and decision-relevant.
