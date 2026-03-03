# Setup Processes You Need To Configure

## 1) Supabase Project
- This repository is pinned to UWC Supabase project:
  - project ref: `lnuugnvwjyndvxhzbuib`
  - CLI profile: `~/.config/supabase/uwc.toml`
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
  - `supabase/migrations/20260218008000_fix_current_user_role_security_definer.sql`
  - `supabase/migrations/20260218009000_harden_rbac_and_applicant_write_guards.sql`
  - `supabase/migrations/20260219001000_recommender_otp_and_ocr_prompt.sql`
  - `supabase/migrations/20260225000100_allow_custom_cycle_stage_template_codes.sql`
  - `supabase/migrations/20260226000200_add_admin_config_to_cycle_stage_templates.sql`
  - `supabase/migrations/20260227000300_add_stage_sections_table.sql`
  - `supabase/migrations/20260227000400_seed_default_sections_and_assign_fields.sql`
  - `supabase/migrations/202603040002_admin_candidate_ops_reliability.sql`
  - `supabase/migrations/202603040003_export_presets.sql`
  - `supabase/migrations/202603040004_broadcast_communications.sql`
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
- This script now seeds two applicant demos and blocks non-dev environments unless `ALLOW_DEMO_SEEDING=true`.

## 2.1) Supabase Profile Shortcuts
- `sbu` (UWC): `supabase --profile uwc` (profile config at `~/.config/supabase/uwc.toml`)
- `sbp` (personal): `supabase --profile personal` (profile config at `~/.config/supabase/personal.toml`)
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
  - Gmail API option:
    - `GOOGLE_GMAIL_CLIENT_ID`
    - `GOOGLE_GMAIL_CLIENT_SECRET`
    - `GOOGLE_GMAIL_REFRESH_TOKEN`
    - `GOOGLE_GMAIL_SENDER_EMAIL`
    - `GOOGLE_GMAIL_REDIRECT_URI` (optional)
  - Shared mail options:
    - `EMAIL_FROM_NAME` (optional)
    - `EMAIL_REPLY_TO` (optional)
  - `RECOMMENDER_TOKEN_SALT` (recommended; extra hardening for OTP/session token hashing)

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

## 6) Outbound Email Provider
- Gmail API setup values:
  - `GOOGLE_GMAIL_CLIENT_ID`
  - `GOOGLE_GMAIL_CLIENT_SECRET`
  - `GOOGLE_GMAIL_REFRESH_TOKEN`
  - `GOOGLE_GMAIL_SENDER_EMAIL`
  - Optional: `GOOGLE_GMAIL_REDIRECT_URI`
  - One-time connect flow:
    - sign in as an admin in the app
    - open `GET /api/google-mail/connect`
    - finish Google consent
    - copy the refresh token shown by `/auth/google-mail/callback`
- Shared recommended values:
  - `EMAIL_FROM_NAME`
  - `EMAIL_REPLY_TO`
  - `RECOMMENDER_TOKEN_SALT`
- Communication queue processing endpoint that sends real emails:
  - `POST /api/communications/process`
- Broadcast campaign compose/send uses:
  - `POST /api/communications/send`
- Preview / test-send endpoints:
  - `POST /api/communications/preview`
  - `POST /api/communications/test-send`
- Recommender invite/reminder/OTP endpoints also depend on Gmail API:
  - `PUT /api/recommendations`
  - `POST /api/recommendations/:id/remind`
  - `POST /api/recommendations/public/:token/otp`

### Recommended smoke test after deploy
1. Send a communications test email to an admin inbox.
2. Run one broadcast campaign against a narrow test filter.
3. Verify recommendation invite -> OTP -> submission.
4. Verify admin reminder re-send and manual mark-received actions.
5. Confirm reply/bounce ownership for the configured sender inbox.

## 7) GitHub Repository + Secrets
- Recommended repo secrets:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `ADMIN_EMAIL_ALLOWLIST`
  - `LOG_LEVEL` (optional)
  - `GEMINI_API_KEY` (optional)
  - `GOOGLE_GMAIL_CLIENT_ID`
  - `GOOGLE_GMAIL_CLIENT_SECRET`
  - `GOOGLE_GMAIL_REFRESH_TOKEN`
  - `GOOGLE_GMAIL_SENDER_EMAIL`
  - `RECOMMENDER_TOKEN_SALT` (recommended)

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
- Security E2E verification (requires app running on `http://localhost:3000`):
```bash
bun run test:e2e tests/e2e/access-control.spec.ts
```
