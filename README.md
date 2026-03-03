# UWC Peru Selection Platform

Platform for UWC Peru selection management with:
- Applicant mode (Stage 1 document submission)
- Admin mode (validation + stage management)
- Multi-stage flow (`documents` -> `exam_placeholder`)
- Structured runtime logs (Cloudflare-ready), audit trail, and reportable error IDs

## Tech Stack
- Next.js 16 + TypeScript + Tailwind
- Material UI (hybrid custom look)
- Supabase (Google OAuth, Postgres, Storage)
- Cloudflare Pages deployment
- Bun runtime/package manager
- Vitest + Testing Library + Playwright

## Documentation
- Canonical project docs live in `./docs/`.
- Start at `./docs/README.md`.

## Features
- Role-based login (`admin`, `applicant`)
- Google OAuth sign-in via Supabase
- OAuth callback profile provisioning with admin allowlist support
- Optional temporary dev bypass mode (off by default)
- Process-first dashboards:
  - admin process dashboard (`/admin`)
  - applicant process dashboard (`/applicant`)
  - process detail pages (`/admin/process/:cycleId`, `/applicant/process/:cycleId`)
- Process management (`cycles`): create yearly process, activate process, configure Stage 1/2 dates
- Process templates bootstrap:
  - new yearly process auto-creates stage templates for Stage 1 and Stage 2
  - admin can edit stage labels, milestones, and target dates per process
  - applicant can view process timeline/hitos inside each process
- Stage configuration builder:
  - admin can edit fields per stage (add/remove/edit/reorder required data)
  - dedicated editor route: `/admin/process/:cycleId/stage/:stageCode`
  - applicant form renders dynamically from stage field configuration
- Stage automation templates:
  - admin can edit email automation subject/body per stage trigger
  - `application_submitted` automation queues automatically on submit
  - `stage_result` automation can be queued from admin communications
- Applicant form draft/save/submit
- Applicant document upload (signed upload URL)
- Recommendation request registration + persisted recommender list display
- Admin queue for applications
- Admin candidate search fallback + Stage 1 funnel visibility
- Admin validation (`eligible` / `ineligible`)
- Multi-stage management
- Admin file metadata editing + recommendation operational controls
- Admin audit viewer with filters + CSV export (`/admin/audit`)
- External exam CSV import (modo simulación)
- Payload-driven CSV/XLSX export builder with saved presets
- Communication queue logging endpoint
- Communication queue lifecycle (`queued/processing/sent/failed`) with admin processing/retry controls
- Real email delivery via Resend from queued communications
- Broadcast compose/send with campaign audit trail and idempotency protection
- Prompt Studio for guarded OCR experiments + OCR history endpoint (Gemini API key required)
- Clear user-facing error handling with `Error ID`
- Bug report endpoint for non-technical users
- Audit logging for key actions

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
   - Required for real email delivery:
     - `RESEND_API_KEY`
     - `RESEND_FROM_EMAIL`
     - `RESEND_FROM_NAME` (optional, defaults to `UWC Peru`)
     - `RECOMMENDER_TOKEN_SALT` (strongly recommended outside local dev)
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
If seeding fails, verify `SUPABASE_SECRET_KEY` is set in `.env.local`. The script now seeds two applicant demos and refuses to run outside dev/test unless `ALLOW_DEMO_SEEDING=true`.
7. Start app:
```bash
bun run dev
```

## Supabase CLI Profiles

If you use named Supabase CLI profiles, you can set up aliases in your shell:

```bash
# Add to ~/.zshrc or ~/.bashrc
alias sbu="supabase --profile uwc"
alias sbp="supabase --profile personal"
```

Profile config files live at `~/.config/supabase/<profile-name>.toml`.

Examples:
```bash
sbu projects list
sbu migration list
sbu db push
```

## OAuth Configuration
- Enable Google provider in Supabase Auth.
- Set redirect URL to:
- `http://localhost:3000/auth/callback`
- Add production callback URL once deployed.

## Optional Dev Bypass
If OAuth keys are not ready yet:
- Set `NEXT_PUBLIC_ENABLE_DEV_BYPASS=true`
- Set demo env vars:
- `NEXT_PUBLIC_DEMO_ADMIN_EMAIL`
- `NEXT_PUBLIC_DEMO_APPLICANT_EMAIL`
- `NEXT_PUBLIC_DEMO_PASSWORD`

## Cloudflare Deployment

This app deploys to Cloudflare Pages via GitHub Actions. On every push to `main`, the app is built and deployed automatically.

### Required GitHub Secrets

| Secret | Description |
|--------|-------------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with Pages permissions |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous/publishable key |
| `NEXT_PUBLIC_APP_URL` | Production URL (e.g. `https://uwc-platforms.pages.dev`) |
| `NEXT_PUBLIC_ENABLE_DEV_BYPASS` | `"true"` for staging preview |
| `NEXT_PUBLIC_DEMO_ADMIN_EMAIL` | Demo admin email for bypass |
| `NEXT_PUBLIC_DEMO_APPLICANT_EMAIL` | Demo applicant email for bypass |
| `NEXT_PUBLIC_DEMO_PASSWORD` | Demo password for bypass |

Runtime secrets (set in Cloudflare Pages dashboard, not GitHub Actions):
- `SUPABASE_SECRET_KEY`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `GEMINI_API_KEY`

## Observability
- Runtime logs:
  - Local development: emitted to terminal (`bun run dev`).
  - Cloudflare environments: same structured logs are captured in Cloudflare Logs / Log Explorer.
- Business audit:
  - Critical actions are stored in `audit_events` in Supabase for process accountability.
- See `./docs/OBSERVABILITY.md` for commands and retention guidance.

## Provider Notes
- OCR provider: Gemini `gemini-3-flash-preview`.
- Email provider: Resend API (real delivery when queue is processed).

## Email / Recommendation Smoke Checklist
- Verify the Resend sender domain is healthy (SPF/DKIM passing) before sending outside local development.
- Confirm `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_FROM_NAME`, and `RECOMMENDER_TOKEN_SALT` are configured in each environment.
- Run these smoke tests after deploy:
  - admin `Enviar prueba` in Communications
  - admin broadcast `Send now` to a test segment
  - recommendation invite -> OTP/session -> submit
  - admin reminder resend and manual mark-received flow
- Define who monitors replies/bounces on the configured sender inbox.

## Test Commands
```bash
bun run lint
bun run typecheck
bun run test
bun run test:coverage
bun run test:e2e
bun run build
bun run build:cf   # Cloudflare build
```

See `./docs/E2E_TEST_GUIDE.md` for E2E test documentation.

## Important Endpoints
- `GET /api/me`
- `GET/POST /api/applications`
- `POST /api/applications/:id/submit`
- `POST /api/applications/:id/validate`
- `POST /api/applications/:id/transition`
- `POST /api/applications/:id/upload-url`
- `POST /api/applications/:id/files`
- `POST /api/applications/:id/ocr-check`
- `GET /api/applications/:id/ocr-check`
- `GET/POST /api/recommendations`
- `GET/POST /api/cycles`
- `PATCH /api/cycles/:id`
- `GET/PATCH /api/cycles/:id/templates`
- `GET/PATCH /api/cycles/:id/stages/:stageCode/config`
- `POST /api/exam-imports`
- `GET /api/communications`
- `POST /api/communications/process`
- `POST /api/communications/send`
- `POST /api/errors/report`
- `GET /api/exports`
- `GET /api/audit`
- `GET /api/audit/export`

## Git Workflow (Feature Branch + PR)
- Main branch: `main`
- Feature branch prefix: `feature/` or `fix/`
- Example:
```bash
git checkout -b feature/my-new-feature
git add .
git commit -m "feat: add my new feature"
git push -u origin feature/my-new-feature
```
Then open a PR into `main`.
