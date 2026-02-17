# Setup Processes You Need To Configure

## 1) Supabase Project
- This repository is pinned to UWC Supabase project:
  - project ref: `lnuugnvwjyndvxhzbuib`
  - CLI profile: `/Users/dafirebanks/.config/supabase/uwc.toml`
- Keep these in `.env.local`:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Use UWC profile shortcut for all project Supabase commands:
```bash
sbu projects list
sbu link --project-ref lnuugnvwjyndvxhzbuib
```
- Run SQL migrations in order:
  - `supabase/migrations/20260217001000_init_mvp.sql`
  - `supabase/migrations/20260217002000_storage_policies.sql`
  - `supabase/migrations/20260217013000_add_profiles_insert_policy.sql`
```bash
sbu db push
```
- Configure Google OAuth provider in Supabase Auth.
- Add callback URLs:
  - `http://localhost:3000/auth/callback`
  - Your production domain callback URL.
- Set `ADMIN_EMAIL_ALLOWLIST` for admin auto-role assignment.

## 2) Temporary Auth Bypass (until OAuth is ready)
- Set:
  - `NEXT_PUBLIC_ENABLE_DEV_BYPASS=true`
  - `NEXT_PUBLIC_DEMO_ADMIN_EMAIL`
  - `NEXT_PUBLIC_DEMO_APPLICANT_EMAIL`
  - `NEXT_PUBLIC_DEMO_PASSWORD`
- To generate demo users quickly, set `SUPABASE_SERVICE_ROLE_KEY` and run:
```bash
bun run seed:fake-users
```

## 2.1) Supabase Profile Shortcuts
- `sbu` (UWC): `supabase --profile /Users/dafirebanks/.config/supabase/uwc.toml`
- `sbp` (personal): `supabase --profile /Users/dafirebanks/.config/supabase/personal.toml`
- Always use `sbu` for this repository unless explicitly working on a different project.

## 3) Cloudflare Hosting
- Create a Cloudflare Pages project connected to this repo.
- Build command: `bun run build`
- Production command: `bun run start` (or Next.js adapter mode if you prefer Worker runtime)
- Set environment variables in Cloudflare Pages:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `ADMIN_EMAIL_ALLOWLIST`
  - `NEXT_PUBLIC_SENTRY_DSN` (optional)
  - `GEMINI_API_KEY` (optional)

## 4) Sentry (Recommended)
- Create Sentry project for Next.js.
- Add DSN in env (`NEXT_PUBLIC_SENTRY_DSN`).
- Optional CI release/source map vars:
  - `SENTRY_AUTH_TOKEN`
  - `SENTRY_ORG`
  - `SENTRY_PROJECT`

## 5) Gemini API (Optional for OCR)
- Create Google AI Studio API key.
- Set `GEMINI_API_KEY`.
- Endpoint using it: `POST /api/applications/:id/ocr-check`.

## 6) GitHub Repository + Secrets
- Recommended repo secrets:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `ADMIN_EMAIL_ALLOWLIST`
  - `NEXT_PUBLIC_SENTRY_DSN` (optional)
  - `SENTRY_AUTH_TOKEN` (optional)
  - `GEMINI_API_KEY` (optional)

## 7) Feature Branch + PR Process
- Always branch from `main` with `codex/` prefix.
- Open PR for each feature branch.
- Suggested branch names:
  - `codex/mvp-foundations`
  - `codex/mvp-applicant-flow`
  - `codex/mvp-admin-stage-management`
  - `codex/mvp-observability-hardening`
