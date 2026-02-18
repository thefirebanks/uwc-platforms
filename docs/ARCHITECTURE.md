# Architecture

## Stack
- Frontend/API: Next.js App Router (TypeScript)
- UI: Material UI + custom theme layer
- Auth/DB/Storage: Supabase
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
- Validation and stage transition
- Recommendation request registration
- Exam import and export
- Audit listing and export
- Bug reporting endpoint

3. Supabase data layer
- Auth users + `profiles`
- `cycles` (selection process per year + stage date config + per-user cap)
- `cycle_stage_templates` (stage labels, milestones, and due dates per process)
- `cycle_stage_fields` (stage field schema: key/label/type/required/order/visibility)
- `stage_automation_templates` (triggered email templates per stage)
- `applications`, `recommendation_requests`, `stage_transitions`
- `exam_imports`, `communication_logs`, `audit_events`, `bug_reports`
- Storage bucket `application-documents`

## Authorization Model
- Supabase RLS enforces role/data access boundaries.
- Applicant sees and edits own data only.
- Admin can review all applications and operate stage transitions/import/export.

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
  - stage field schema is editable by admin and drives applicant form rendering
  - required file fields are validated before submit
  - stage automation templates can queue communication entries on trigger events

## Error and Observability Model
- API handlers are wrapped with centralized error handling.
- All user-facing failures return:
  - friendly Spanish message
  - generated `errorId`
- Users can submit bug reports using that `errorId`.
- Admin/engineering can correlate logs + audit events via request identifiers.

## OAuth Provisioning
- OAuth callback exchanges code for session.
- If user profile does not exist, it is created automatically.
- Role assignment is determined by `ADMIN_EMAIL_ALLOWLIST`; otherwise defaults to `applicant`.
