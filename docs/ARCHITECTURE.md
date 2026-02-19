# Architecture

## Stack
- Frontend/API: Next.js App Router (TypeScript)
- UI: Material UI + custom theme layer
- Auth/DB/Storage: Supabase
- OCR provider: Google Gemini (`gemini-3-flash-preview`)
- Email delivery provider: Resend
- Runtime logging: structured server logs to stdout (local terminal + Cloudflare Logs)
- Audit logging: `audit_events` table for business-critical actions
- Runtime/package manager: Bun

## High-Level Components
1. Web app
- Public landing page
- Login page (Google OAuth + optional dev bypass)
- Role-gated process dashboards (`/admin`, `/applicant`)
- Process detail pages:
  - admin: `/admin/process/:cycleId`
  - applicant: `/applicant/process/:cycleId`
- Stage configuration page:
  - admin: `/admin/process/:cycleId/stage/:stageCode`
- Admin audit dashboard (`/admin/audit`) with filtering and CSV export

2. API layer
- Selection process management (`GET/POST /api/cycles`, `PATCH /api/cycles/:id`)
- Selection process stage templates (`GET/PATCH /api/cycles/:id/templates`)
- Stage form and automation config (`GET/PATCH /api/cycles/:id/stages/:stageCode/config`)
- Application CRUD and submit
- OCR check + OCR history (`POST/GET /api/applications/:id/ocr-check`)
- Validation and stage transition
- Recommendation management (`GET/PUT /api/recommendations`, `POST /api/recommendations/:id/remind`)
- Public no-login recommender flow (`/recomendacion/:token` + OTP/session APIs)
- Exam import and export
- Communication queue listing and processing (`GET /api/communications`, `POST /api/communications/process`)
- Audit listing and export
- Bug reporting endpoint

3. Supabase data layer
- Auth users + `profiles`
- `cycles` (selection process per year + stage date config + per-user cap)
- `cycle_stage_templates` (stage labels, milestones, and due dates per process)
- `cycle_stage_fields` (stage field schema: key/label/type/required/order/visibility)
- `stage_automation_templates` (triggered email templates per stage)
- `applications`, `recommendation_requests`, `stage_transitions`
- `exam_imports`, `communication_logs`, `application_ocr_checks`, `audit_events`, `bug_reports`
- Storage bucket `application-documents`

## Authorization Model
- Supabase RLS enforces role/data access boundaries.
- Applicant sees and edits own data only.
- Admin can review all applications and operate stage transitions/import/export.
- Defense in depth for admin protection:
  - API routes use server-side `requireAuth(["admin"])` checks (client role tampering is ignored).
  - Dashboard pages gate by server session role before render.
  - Database RLS enforces admin-only writes for admin resources (`cycles`, transitions, imports, communications, stage configs).
- Applicant-side direct table writes are guarded to prevent privilege escalation (no self role promotion, no applicant stage/status/admin-note mutations).
  - `recommendation_requests` table is admin-only at DB level; applicant access happens only via server APIs with ownership checks.
  - CI regression tests fail if admin route guards are removed (`tests/security/access-control-regressions.test.ts`).
  - E2E browser tampering test verifies applicant receives `403` on admin API attempts (`tests/e2e/access-control.spec.ts`).

## Stage Management Model
- Current MVP allowed stages:
  - `documents`
  - `exam_placeholder`
- Transition guard:
  - `documents -> exam_placeholder` only when eligible/advanced state
  - rollback supported for admin correction
- Process-level configuration:
  - each process has `stage1_open_at`, `stage1_close_at`, `stage2_open_at`, `stage2_close_at`
  - date order validation is enforced on update
  - only one active process at a time
  - applicant cap is enforced (max 3 applications across processes for now)
  - stage templates are auto-bootstrapped when creating a process and then editable by admin
  - stage templates include OCR prompt template configurable per stage
  - stage field schema is editable by admin and drives applicant form rendering
  - required file fields are validated before submit
  - file uploads store path + UX metadata (title, original name, mime, upload timestamp)
  - applicant submit now requires both recommender roles submitted (`mentor` + `friend`)
  - applicant cannot edit once stage close date passes; post-close edits require admin intervention
  - recommender flow is no-login link + OTP verification + draft save + final one-way submit
  - applicant sees recommender status/reminders but never sees/copies recommender tokenized links
  - stage automation templates can queue communication entries on trigger events
  - communication queue rows support delivery lifecycle (`queued`, `processing`, `sent`, `failed`)
  - admins can process queued deliveries and retry failed deliveries from process dashboard
  - OCR checks are stored historically per application with confidence + summary for admin review

## Error and Observability Model
- API handlers are wrapped with centralized error handling.
- All user-facing failures return:
  - friendly Spanish message
  - generated `errorId`
- Users can submit bug reports using that `errorId`.
- Admin/engineering can correlate logs + audit events via request identifiers.
- Application submission is resilient to outbound email queue failures:
  - application status still transitions to `submitted`
  - queue failures are logged as warnings and tracked in audit metadata (`automationQueueFailed`)

## OAuth Provisioning
- OAuth callback exchanges code for session.
- If user profile does not exist, it is created automatically.
- Role assignment is determined by `ADMIN_EMAIL_ALLOWLIST`; otherwise defaults to `applicant`.
