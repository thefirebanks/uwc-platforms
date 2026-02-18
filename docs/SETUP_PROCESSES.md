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
  - `supabase/migrations/20260218001000_add_audit_events_indexes.sql`
  - `supabase/migrations/20260218002000_add_cycle_stage_configuration.sql`
  - `supabase/migrations/20260218003000_add_cycle_stage_templates.sql`
  - `supabase/migrations/20260218004000_add_stage_form_and_automation_configs.sql`
  - `supabase/migrations/20260218005000_add_communications_lifecycle_and_ocr_checks.sql`
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
- To generate demo users quickly, set `SUPABASE_SECRET_KEY` and run:
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
  - `LOG_LEVEL` (optional, default `info`)
  - `GEMINI_API_KEY` (optional)
  - `RESEND_API_KEY` (required for real email delivery)
  - `RESEND_FROM_EMAIL` (required for real email delivery)
  - `RESEND_FROM_NAME` (optional)

## 4) Cloudflare Observability (Recommended)
- Use Cloudflare Logs / Log Explorer as the single runtime log destination.
- Runtime logs are emitted as structured stdout JSON from the app and are collected by Cloudflare in deployed environments.
- For live stream debugging:
```bash
wrangler tail
```
- Keep local debugging on terminal with:
```bash
bun run dev
```

## 5) Gemini API (Optional for OCR)
- Create Google AI Studio API key.
- Set `GEMINI_API_KEY`.
- Model used by app: `gemini-3-flash-preview`.
- Endpoints using it:
  - `POST /api/applications/:id/ocr-check`
  - `GET /api/applications/:id/ocr-check` (history view)

## 6) Resend (Required for Real Email Sending)
- Create a Resend account and API key.
- Verify a sending domain in Resend (production), then define:
  - `RESEND_API_KEY`
  - `RESEND_FROM_EMAIL` (example: `noreply@tudominio.org`)
  - `RESEND_FROM_NAME` (optional, example: `UWC Peru`)
- Communication queue processing endpoint that sends real emails:
  - `POST /api/communications/process`

## 7) GitHub Repository + Secrets
- Recommended repo secrets:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `ADMIN_EMAIL_ALLOWLIST`
  - `LOG_LEVEL` (optional)
  - `GEMINI_API_KEY` (optional)
  - `RESEND_API_KEY`
  - `RESEND_FROM_EMAIL`
  - `RESEND_FROM_NAME` (optional)

## 8) Feature Branch + PR Process
- Always branch from `main` with `codex/` prefix.
- Open PR for each feature branch.
- Suggested branch names:
  - `codex/mvp-foundations`
  - `codex/mvp-applicant-flow`
  - `codex/mvp-admin-stage-management`
  - `codex/mvp-observability-hardening`

## 9) Test Runner Baseline
- Keep Vitest stack on:
  - `vitest@2.1.8`
  - `@vitest/ui@2.1.8`
  - `@vitest/coverage-v8@2.1.8`
- Reason:
  - `vitest@3.x` pulls `vite@7.x` and `esbuild@0.27.3`; in this project environment that esbuild binary can hang, which blocks all tests.
- Verification command:
```bash
bun run test
```
