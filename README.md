# UWC Peru Selection Platform (MVP)

Spanish-first MVP for UWC Peru selection management with:
- Applicant mode (Stage 1 document submission)
- Admin mode (validation + stage management)
- Two-stage flow (`documents` -> `exam_placeholder`)
- Structured runtime logs (Cloudflare-ready), audit trail, and reportable error IDs

## Tech Stack
- Next.js 16 + TypeScript + Tailwind
- Material UI (hybrid custom look)
- Supabase (Google OAuth, Postgres, Storage)
- Cloudflare deployment target
- Bun runtime/package manager
- Vitest + Testing Library + Playwright

## Documentation
- Canonical project docs live in `/Users/dafirebanks/Projects/uwc-platforms/docs/`.
- Start at `/Users/dafirebanks/Projects/uwc-platforms/docs/README.md`.

## MVP Features Implemented
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
- Admin validation (`eligible` / `ineligible`)
- Stage management for 2 stages (Stage 2 is placeholder)
- Admin audit viewer with filters + CSV export (`/admin/audit`)
- External exam CSV import (modo simulación)
- CSV export endpoint
- Communication queue logging endpoint
- OCR check endpoint (Gemini API key required)
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
4. Use UWC Supabase profile commands for this repo:
```bash
sbu link --project-ref lnuugnvwjyndvxhzbuib
```
5. Run DB migrations in Supabase SQL editor (or via Supabase CLI):
- `supabase/migrations/20260217001000_init_mvp.sql`
- `supabase/migrations/20260217002000_storage_policies.sql`
- `supabase/migrations/20260217013000_add_profiles_insert_policy.sql`
- `supabase/migrations/20260218001000_add_audit_events_indexes.sql`
- `supabase/migrations/20260218002000_add_cycle_stage_configuration.sql`
- `supabase/migrations/20260218003000_add_cycle_stage_templates.sql`
- `supabase/migrations/20260218004000_add_stage_form_and_automation_configs.sql`
```bash
sbu db push
```
6. Create fake accounts (requires `SUPABASE_SECRET_KEY`):
```bash
bun run seed:fake-users
```
If seeding fails, verify `SUPABASE_SECRET_KEY` is set in `.env.local`.
7. Start app:
```bash
bun run dev
```

## Supabase CLI Profiles
This project should always use the UWC Supabase profile.

- `sbu` = `supabase --profile /Users/dafirebanks/.config/supabase/uwc.toml`
- `sbp` = `supabase --profile /Users/dafirebanks/.config/supabase/personal.toml`

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

## Observability
- Runtime logs:
  - Local development: emitted to terminal (`bun run dev`).
  - Cloudflare environments: same structured logs are captured in Cloudflare Logs / Log Explorer.
- Business audit:
  - Critical actions are stored in `audit_events` in Supabase for process accountability.
- See `/Users/dafirebanks/Projects/uwc-platforms/docs/OBSERVABILITY.md` for commands and retention guidance.

## Test Commands
```bash
bun run lint
bun run typecheck
bun run test
bun run test:coverage
bun run test:e2e
bun run build
```

## Important Endpoints
- `GET /api/me`
- `GET/POST /api/applications`
- `POST /api/applications/:id/submit`
- `POST /api/applications/:id/validate`
- `POST /api/applications/:id/transition`
- `POST /api/applications/:id/upload-url`
- `POST /api/applications/:id/files`
- `POST /api/applications/:id/ocr-check`
- `GET/POST /api/recommendations`
- `GET/POST /api/cycles`
- `PATCH /api/cycles/:id`
- `GET/PATCH /api/cycles/:id/templates`
- `GET/PATCH /api/cycles/:id/stages/:stageCode/config`
- `POST /api/exam-imports`
- `POST /api/communications/send`
- `POST /api/errors/report`
- `GET /api/exports`
- `GET /api/audit`
- `GET /api/audit/export`

## Git Workflow (Feature Branch + PR)
- Main branch: `main`
- Feature branch prefix: `codex/`
- Example:
```bash
git checkout -b codex/mvp-stage1-admin-applicant
git add .
git commit -m "feat: implement stage1 mvp with admin/applicant flows"
git push -u origin codex/mvp-stage1-admin-applicant
```
Then open a PR into `main`.
