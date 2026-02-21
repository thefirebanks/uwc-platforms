# Test Strategy and Coverage Expectations

## Principle
Every feature ships with tests at the most appropriate level. No feature is considered complete without automated tests and updated manual flows.

## Test Layers
- Unit tests:
  - validation rules
  - stage transition logic
  - cycle stage template bootstrap rules
  - stage dynamic form validation rules
  - automation pre-submit checks
  - communication queue lifecycle and provider delivery handling
  - OCR parsing and confidence normalization
  - recommender payload validation rules
  - role resolution logic
  - centralized error handling
- Component tests:
  - applicant form behavior
  - applicant process dashboard behavior
  - admin stage config editor behavior (add/edit/remove/reorder/insert)
  - admin dashboard actions
  - admin communication queue controls and OCR actions
  - admin process dashboard behavior
  - error callout/reporting UI
  - stage badges and key UI primitives
- Integration tests:
  - exam CSV import behavior
  - stage transition service behavior
- E2E tests:
  - base UI smoke and navigation
  - applicant anti-tampering access-control checks

## Current Coverage Matrix
- Auth role mapping:
  - `tests/unit/role-resolution.test.ts`
- Application schema:
  - `tests/unit/application-validation.test.ts`
- Stage template bootstrap:
  - `tests/unit/stage-templates.test.ts`
  - `tests/unit/stage-field-fallback.test.ts`
- Stage dynamic validation:
  - `tests/unit/stage-form-schema.test.ts`
- Automation pre-submit checks:
  - `tests/unit/automation-service.test.ts`
- Communication lifecycle:
  - `tests/unit/communications-service.test.ts`
- OCR parser/service:
  - `tests/unit/ocr.test.ts`
- Recommender validation:
  - `tests/unit/recommendations-service.test.ts`
- Stage transitions:
  - `tests/unit/stage-transition.test.ts`
  - `tests/integration/transition-application.test.ts`
- Error handling:
  - `tests/unit/error-handling.test.ts`
- Exam import:
  - `tests/integration/import-exam-csv.test.ts`
- Applicant UI:
  - `tests/components/applicant-form.test.tsx`
  - `tests/components/applicant-processes-dashboard.test.tsx`
- Admin UI:
  - `tests/components/admin-dashboard.test.tsx`
  - `tests/components/stage-config-editor.test.tsx`
  - `tests/components/admin-processes-dashboard.test.tsx`
  - `tests/components/admin-audit-log.test.tsx`
- Error UI:
  - `tests/components/error-callout.test.tsx`
- Audit filtering/export helpers:
  - `tests/unit/audit-service.test.ts`
- Application export filters/csv/file normalization:
  - `tests/unit/exports-service.test.ts`
- Smoke E2E:
  - `tests/e2e/home.spec.ts`
  - `tests/e2e/access-control.spec.ts`

## Required Commands Before PR
- `bun run lint`
- `bun run typecheck`
- `bun run test`
- `bun run build`

## Runner Stability Notes
- Test runner is pinned to `vitest@2.1.8` (with `vite@5.x` / `esbuild@0.21.x`) because `vitest@3.x` requires `esbuild@0.27.3`, which can hang indefinitely on some local macOS setups.
- If tests appear frozen at `RUN vX`, check `esbuild --version`. If it hangs, do not upgrade Vitest/Vite until the esbuild issue is resolved upstream.
- Playwright now starts the app automatically via `webServer` in `playwright.config.ts`.
- Access-control E2E test that uses demo bypass is automatically skipped when bypass env vars are not present.

## Manual QA Requirement
If a feature changes user-visible behavior, update `docs/MANUAL_TEST_FLOWS.md` in the same PR.
