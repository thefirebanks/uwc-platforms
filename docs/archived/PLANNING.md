# Implementation Planning (Iterative)

## Phase 1 (Done)
- Foundation setup (Next.js, Supabase, MUI, CI, tests)
- Applicant mode baseline
- Admin mode baseline
- Stage management with 2 stages
- Core APIs and logging infrastructure

## Phase 2 (Done / Stabilized)
- Google OAuth primary auth flow
- Bun migration end-to-end
- Docs consolidation under `docs/`
- Stronger test coverage for auth/error/stage transitions
- Selection-process abstraction (`Proceso de Selección` per year)
  - Admin dashboard is process-first (create/activate process + per-process management)
  - Applicant dashboard is process-first (see all years before entering a form)
  - Per-process stage date configuration (Stage 1 / Stage 2 dates)
  - Applicant cap enforced (max 3 applications across processes)

## Phase 3 (Current: UX Hardening + Export v1)
Goal: make current MVP faster, cleaner, and less overwhelming before expanding to more stages.

- UI quality audit and fixes (alignment, spacing, contrast, component consistency)
  - audit all core pages with a checklist
  - fix form control alignment issues (labels/placeholders/toggles/date fields)
  - standardize button/text contrast and loading/disabled states
- UX information architecture audit (minimum necessary information)
  - admin: show primary actions first, move advanced controls behind explicit reveal
  - applicant: show only current-stage context and required next actions
  - reduce duplicated configuration surfaces
- Export v1 (operationally useful, low complexity)
  - individual applicant export (structured JSON + linked document metadata) ✅
  - bulk export for filtered applicant sets (CSV for committee workflows) ✅
  - process-level export filters (stage, validation status, eligibility) ✅
- Performance hardening for heavy forms
  - reduce slow saves/transitions
  - add timing instrumentation for form and admin config operations

## Phase 4 (Next: Stage 3-6 Expansion)
Goal: move from 2-stage MVP to real multi-stage selection workflow.

- Add Stage 3-6 templates to yearly process bootstrap
- Extend stage configuration UI for all active stages
- Support stage-specific required fields, documents, and automations for stages 3-6
- Add stage gating rules and transitions across full pipeline (1 -> 6)
- Keep applicant UI minimal: only active stage details + status of completed/pending stages
- Extend test coverage (unit, component, integration, E2E) for all new stages

## Phase 5 (Post-MVP+)
- Evaluator/reviewer portal
- Scoring and ranking interfaces
- Richer packet generation and downstream export adapters

## Cross-Cutting Rules (Every Phase)
- Every feature PR must include:
  - tests for added behavior
  - docs updates in `docs/` if requirements/system behavior changed
  - manual QA flow updates if user-visible behavior changed
- Every phase must include:
  - one explicit UI audit pass (visual consistency/accessibility/performance)
  - one explicit UX audit pass (visibility hierarchy, information density, progressive disclosure)
