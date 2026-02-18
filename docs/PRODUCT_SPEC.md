# Product Specification (MVP)

## Goal
Build a faster, cleaner, easier-to-use platform for UWC Peru selection process management, replacing spreadsheet-heavy workflows and reducing operational friction.

## MVP Scope
- Roles:
  - `admin`
  - `applicant`
- Process model:
  - yearly `Proceso de Selección` object (`cycles`)
  - process-first dashboards for both roles before entering a specific application
  - max 3 applications per applicant across processes
  - process templates with editable labels/milestones and timeline dates
  - stage-level configurable form fields and required documents
  - stage-level configurable automation templates (email)
- Stage model:
  - `documents` (Stage 1, full flow)
  - `exam_placeholder` (Stage 2, external-exam placeholder)
- Key capabilities:
  - Applicant profile and application form submission
  - Admin process creation/activation and stage date configuration
  - Process template bootstrap and edition (Stage 1/2)
  - Stage form builder (add/remove/edit required data fields)
  - Stage automation template builder (subject/body per trigger)
  - Document upload and file association
  - Recommendation request registration with persisted recommender visibility
  - Admin validation (`eligible`, `ineligible`)
  - Admin stage transitions
  - Exam CSV import
  - CSV export
  - Communication queue lifecycle controls (queue, process, retry, status visibility)
  - Real email sending from queue via provider integration
  - OCR validation execution + confidence/history visibility per application
  - Friendly errors with reportable `Error ID`
  - Structured audit trail

## Authentication
- Primary: Google OAuth via Supabase.
- Temporary dev-only fallback: demo bypass login when explicitly enabled via env.

## Non-Functional Requirements
- Fast and responsive UI.
- Spanish-first UX text.
- Material-design principles with polished, modern visual treatment.
- Clear, actionable error messages for non-technical users.
- Traceable logging for developer debugging.

## Out of Scope (Current MVP)
- Evaluator/reviewer portal.
- Live collaborative docs/sheets editor.
- In-platform written exam engine.
