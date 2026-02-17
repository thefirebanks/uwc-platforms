# Setup Processes You Need To Configure

## 1) Supabase Project
- Create a Supabase project.
- Copy values into `.env.local`:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
- Run the SQL migrations in order from `supabase/migrations/`.
- Confirm bucket `application-documents` exists.
- Run:
```bash
npm run seed:fake-users
```

## 2) Cloudflare Hosting
- Create a Cloudflare Pages project connected to this repo.
- Build command: `npm run build`
- Output directory: `.next`
- Set environment variables in Cloudflare Pages:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `NEXT_PUBLIC_SENTRY_DSN` (optional, recommended)
  - `GEMINI_API_KEY` (optional for OCR endpoint)

## 3) Sentry (Recommended)
- Create Sentry project for Next.js.
- Add DSN in env (`NEXT_PUBLIC_SENTRY_DSN`).
- Optional release/source map upload setup for CI:
  - `SENTRY_AUTH_TOKEN`
  - `SENTRY_ORG`
  - `SENTRY_PROJECT`

## 4) Gemini API (Optional for OCR)
- Create Google AI Studio API key.
- Set `GEMINI_API_KEY`.
- Endpoint using it: `POST /api/applications/:id/ocr-check`.

## 5) GitHub Repository + Secrets
- Required repo secrets for CI/deploy:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `NEXT_PUBLIC_SENTRY_DSN` (optional)
  - `SENTRY_AUTH_TOKEN` (optional)
  - `GEMINI_API_KEY` (optional)

## 6) Feature Branch + PR Process
- Always branch from `main` with `codex/` prefix.
- Open PR for each feature branch.
- Suggested branch names:
  - `codex/mvp-foundations`
  - `codex/mvp-applicant-flow`
  - `codex/mvp-admin-stage-management`
  - `codex/mvp-observability-hardening`
