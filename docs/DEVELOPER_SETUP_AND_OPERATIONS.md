# Developer Setup and Operations

This document contains the detailed implementation and operations notes that were intentionally removed from the root README.

## Tech Stack
- Next.js 16 + TypeScript + Tailwind
- Material UI (hybrid custom look)
- Supabase (Google OAuth, Postgres, Storage)
- Cloudflare Pages deployment
- Bun runtime/package manager
- Vitest + Testing Library + Playwright

## Local Setup
1. Install dependencies:
```bash
bun install
```
2. Create env file:
```bash
cp .env.example .env.local
```
3. Fill env variables in `.env.local`.
4. Link to the Supabase project:
```bash
supabase link --project-ref <your-project-ref>
```
5. Run DB migrations:
```bash
supabase db push
```
6. Create demo accounts (requires `SUPABASE_SECRET_KEY`):
```bash
bun run seed:fake-users
```
7. Start app:
```bash
bun run dev
```

## Supabase CLI Profiles
If you use named profiles, aliases can help:

```bash
# Add to ~/.zshrc or ~/.bashrc
alias sbu="supabase --profile uwc"
alias sbp="supabase --profile personal"
```

Profile config files live at `~/.config/supabase/<profile-name>.toml`.

## OAuth Configuration
- Enable Google provider in Supabase Auth.
- Configure callback URL: `http://localhost:3000/auth/callback`.
- Add production callback URL in deployed environments.

## Optional Dev Bypass
If OAuth keys are not ready:
- Set `NEXT_PUBLIC_ENABLE_DEV_BYPASS=true`.
- Configure demo account env vars in `.env.local`.

## Deployment (Cloudflare)
This app deploys to Cloudflare via GitHub Actions.

Required GitHub secrets:
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_APP_URL`

Runtime secrets (set in Cloudflare dashboard):
- `SUPABASE_SECRET_KEY`
- `GOOGLE_GMAIL_CLIENT_ID`
- `GOOGLE_GMAIL_CLIENT_SECRET`
- `GOOGLE_GMAIL_REFRESH_TOKEN`
- `GOOGLE_GMAIL_SENDER_EMAIL`
- `GEMINI_API_KEY`

## Observability
- Local logs: terminal output from `bun run dev`.
- Cloudflare logs: Log Explorer.
- Business audit data: `audit_events` in Supabase.
- See `docs/OBSERVABILITY.md` for full logging guidance.

## Provider Notes
- OCR provider: Gemini (`gemini-3-flash-preview`).
- Email provider: Gmail API.

## Smoke Checklist (Email and Recommendations)
- Validate admin test-send in Communications.
- Validate admin broadcast send.
- Validate recommendation invite and submit flow.
- Validate reminder re-send and manual mark-received flow.

## Test Commands
```bash
bun run lint
bun run typecheck
bun run test
bun run test:coverage
bun run test:e2e
bun run build
bun run build:cf
```

For E2E details, see `docs/E2E_TEST_GUIDE.md`.

## Important API Areas
- Auth/session and profile endpoints
- Applications CRUD/submit/validate/transition/upload/OCR
- Recommendations
- Cycles/templates/stage config
- Communications processing/sending
- Exports and audit

## Git Workflow
- Main branch: `main`
- Branch prefixes: `feature/`, `fix/`, or `codex/` when using Codex branch flows.
