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
- Role-gated dashboards (`/admin`, `/applicant`)
- Admin audit dashboard (`/admin/audit`) with filtering and CSV export

2. API layer
- Application CRUD and submit
- Validation and stage transition
- Recommendation request registration
- Exam import and export
- Audit listing and export
- Bug reporting endpoint

3. Supabase data layer
- Auth users + `profiles`
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
