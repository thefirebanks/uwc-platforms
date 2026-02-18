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

## Phase 3 (Next)
- Improve UX polish and performance on heavy forms
- Introduce selection-process abstraction (`Proceso de Selección` per year)
  - Admin dashboard becomes process-first (create/edit yearly process, stage dates, templates)
  - Applicant dashboard becomes process-first (history across years, max 3 applications)
  - Role home pages become dashboard views before entering a specific process
- Expand communication reliability (delivery status lifecycle)
- OCR workflow hardening and confidence scoring visibility

## Phase 4 (Post-MVP)
- Evaluator/reviewer portal
- Scoring and ranking interfaces
- Richer packet generation and downstream export adapters

## Planning Rules
- Every feature PR must include:
  - tests for added behavior
  - docs updates in `docs/` if requirements/system behavior changed
  - manual QA flow updates if user-visible behavior changed
