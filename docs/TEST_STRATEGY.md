# Test Strategy and Coverage Expectations

## Principle
Every feature ships with tests at the most appropriate level. No feature is considered complete without automated tests and updated manual flows.

## Test Layers
- Unit tests:
  - validation rules
  - stage transition logic
  - role resolution logic
  - centralized error handling
- Component tests:
  - applicant form behavior
  - admin dashboard actions
  - error callout/reporting UI
  - stage badges and key UI primitives
- Integration tests:
  - exam CSV import behavior
  - stage transition service behavior
- E2E tests:
  - base UI smoke and navigation

## Current Coverage Matrix
- Auth role mapping:
  - `tests/unit/role-resolution.test.ts`
- Application schema:
  - `tests/unit/application-validation.test.ts`
- Stage transitions:
  - `tests/unit/stage-transition.test.ts`
  - `tests/integration/transition-application.test.ts`
- Error handling:
  - `tests/unit/error-handling.test.ts`
- Exam import:
  - `tests/integration/import-exam-csv.test.ts`
- Applicant UI:
  - `tests/components/applicant-form.test.tsx`
- Admin UI:
  - `tests/components/admin-dashboard.test.tsx`
  - `tests/components/admin-audit-log.test.tsx`
- Error UI:
  - `tests/components/error-callout.test.tsx`
- Audit filtering/export helpers:
  - `tests/unit/audit-service.test.ts`
- Smoke E2E:
  - `tests/e2e/home.spec.ts`

## Required Commands Before PR
- `bun run lint`
- `bun run typecheck`
- `bun run test`
- `bun run build`

## Manual QA Requirement
If a feature changes user-visible behavior, update `docs/MANUAL_TEST_FLOWS.md` in the same PR.
