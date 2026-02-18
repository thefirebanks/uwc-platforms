# Implementation Planning (Iterative)

## Phase 1 (Done)
- Foundation setup (Next.js, Supabase, MUI, CI, tests)
- Applicant mode baseline
- Admin mode baseline
- Stage management with 2 stages
- Core APIs and logging infrastructure

## Phase 2 (Current Hardening)
- Google OAuth primary auth flow
- Bun migration end-to-end
- Docs consolidation under `docs/`
- Stronger test coverage for auth/error/stage transitions
- Selection-process abstraction (`Proceso de Selección` per year)
  - Admin dashboard is process-first (create/activate process + per-process management)
  - Applicant dashboard is process-first (see all years before entering a form)
  - Per-process stage date configuration (Stage 1 / Stage 2 dates)
  - Applicant cap enforced (max 3 applications across processes)

## Phase 3 (Next)
- Improve UX polish and performance on heavy forms
- Add process templates and yearly process bootstrap
  - initialize stage templates automatically when creating the new yearly process ✅
  - configurable milestones and labels per stage ✅
  - applicant-facing process timeline visibility ✅
  - process-level reporting rollups ✅
- Add admin stage builder + automation control
  - configurable stage fields (add/remove/edit required fields) ✅
  - dynamic applicant form rendering from stage schema ✅
  - configurable stage email automations with trigger templates ✅
- Expand communication reliability (delivery status lifecycle)
  - queue status tracking (`queued/processing/sent/failed`) ✅
  - manual queue processing + retry of failed rows ✅
  - admin process-level communication status visibility ✅
- OCR workflow hardening and confidence scoring visibility
  - OCR results persisted per application ✅
  - OCR confidence + summary visible in admin dashboard ✅
  - OCR history endpoint for debugging and auditability ✅

## Phase 4 (Post-MVP)
- Evaluator/reviewer portal
- Scoring and ranking interfaces
- Richer packet generation and downstream export adapters

## Planning Rules
- Every feature PR must include:
  - tests for added behavior
  - docs updates in `docs/` if requirements/system behavior changed
  - manual QA flow updates if user-visible behavior changed
