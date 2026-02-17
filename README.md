# UWC Peru Selection Platform (MVP)

Spanish-first MVP for UWC Peru selection management with:
- Applicant mode (Stage 1 document submission)
- Admin mode (validation + stage management)
- Two-stage flow (`documents` -> `exam_placeholder`)
- Structured logs, audit trail, Sentry hooks, and reportable error IDs

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
- Applicant form draft/save/submit
- Applicant document upload (signed upload URL)
- Recommendation request registration
- Admin queue for applications
- Admin validation (`eligible` / `ineligible`)
- Stage management for 2 stages (Stage 2 is placeholder)
- External exam CSV import
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
4. Run DB migrations in Supabase SQL editor (or via Supabase CLI):
- `supabase/migrations/20260217001000_init_mvp.sql`
- `supabase/migrations/20260217002000_storage_policies.sql`
- `supabase/migrations/20260217013000_add_profiles_insert_policy.sql`
5. Create fake accounts (requires `SUPABASE_SERVICE_ROLE_KEY`):
```bash
bun run seed:fake-users
```
6. Start app:
```bash
bun run dev
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
- `POST /api/recommendations`
- `POST /api/exam-imports`
- `POST /api/communications/send`
- `POST /api/errors/report`
- `GET /api/exports`

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
