# Admin View Workstream Plan (Post-Applicant UI Parity)

This plan is specifically designed to improve the admin experience next while preserving the applicant UI parity work already completed.

Related safeguards:
- `TODOS_FOR_ADMIN_VIEW.md`
- `docs/APPLICANT_EDIT_MODE_FLOWS.md`
- `docs/CODEBASE_NAVIGATION.md`

## Goals

1. Build/admin polish the form-builder and preview experience.
2. Preserve applicant visual parity and edit/save behavior.
3. Make shared form-rendering logic explicit (instead of accidental reuse).
4. Avoid regressions by adding mode-aware rendering boundaries and tests.

## Non-Goals (for this workstream)

- Reworking applicant styling again unless it is a regression fix.
- Rewriting the entire form architecture in one pass.
- Changing applicant autosave semantics unless needed for a shared bug fix.

## Guiding Rule

Treat applicant view and admin view as two products sharing a schema, not one UI with a few conditionals.

This means we should share:
- data schema
- validation
- field grouping metadata
- rendering primitives (where useful)

But we should not blindly share:
- interaction semantics
- action bars
- status messaging
- density/spacing defaults
- edit affordances

## Phase 0: Stabilize the Baseline (1 small PR)

Purpose: lock in current applicant behavior before touching admin UI.

Tasks:
1. Add/confirm a focused applicant regression checklist in PR template notes (manual for now).
2. Keep existing applicant tests green:
   - `tests/components/applicant-form.test.tsx`
   - `tests/components/toggle-pill.test.tsx`
   - `tests/components/grades-table.test.tsx`
3. Capture 3-5 reference screenshots for applicant sections (desktop/mobile) to compare during admin work.

Acceptance criteria:
- Applicant view looks and behaves the same before/after Phase 1 work.
- No applicant autosave/edit-mode regressions.

## Phase 1: Introduce Explicit Renderer Modes (Core Safety Layer)

Purpose: stop admin requirements from leaking into applicant styling/behavior.

Tasks:
1. Introduce a render context prop or enum used by shared form rendering:
   - `applicant_readonly`
   - `applicant_edit`
   - `admin_preview`
   - `admin_builder`
2. Move applicant-only display overrides behind that mode:
   - label overrides
   - placeholder overrides
   - hidden fields in school section
   - prep intro step behavior
   - sidebar localStorage behavior (if shell is reused)
3. Keep default behavior explicit (no implicit fallback to applicant mode).

Suggested implementation points:
- `src/components/applicant-application-form.tsx`
- `src/lib/stages/applicant-sections.ts`
- `src/lib/stages/field-sub-groups.ts`

Acceptance criteria:
- Admin preview can render canonical labels/placeholders when requested.
- Applicant view remains visually unchanged.

## Phase 2: Extract Shared Presentational Primitives (Without Merging Flows)

Purpose: reduce duplication while keeping admin/applicant behavior separate.

Tasks:
1. Extract shared field primitives (if useful) from applicant renderer:
   - text input chrome
   - textarea chrome
   - toggle pill styles
   - section card shell
2. Keep behavior handlers outside the primitives:
   - applicant autosave
   - admin field editing interactions
3. Create small stories/tests for primitives (if Storybook not available, unit render tests are enough).

Acceptance criteria:
- Primitives are reusable by admin without importing applicant-only logic.
- Visual tokens remain centralized and consistent.

## Phase 3: Admin Stage Builder UX Pass (High-Value Admin Tasks First)

Purpose: improve admin productivity and clarity in the field builder.

Priority admin flows:
1. Add/edit/reorder fields quickly
2. Toggle required/active state
3. Edit labels/help/placeholder cleanly
4. Preview applicant rendering (without confusing builder controls)

Tasks:
1. Split admin screen into clear zones:
   - field list / structure
   - selected field editor panel
   - applicant preview panel (mode=`admin_preview`)
2. Make builder controls denser than applicant inputs (admin needs information density).
3. Add explicit “Preview mode” vs “Edit field schema” states so admins know what is editable.
4. Ensure field operations do not cause preview scroll jumps or state resets.

Acceptance criteria:
- Admin can edit schema without confusing preview controls for real applicant inputs.
- Preview resembles applicant view but clearly indicates preview context.

## Phase 4: Admin Preview Parity Controls (Selective)

Purpose: give admins confidence in applicant output without coupling admin UI too tightly.

Tasks:
1. Add preview toggles:
   - language (ES/EN)
   - viewport size (desktop/mobile)
   - applicant state (draft/submitted/manual edit/read-only)
2. Add preview fixtures for key sections:
   - Elegibilidad
   - Datos personales
   - Colegio y notas
   - Motivación
3. Ensure preview can show hidden/conditional fields intentionally (for debugging schema) without changing applicant defaults.

Acceptance criteria:
- Admin preview catches applicant-layout issues before release.
- Applicant production rendering is unchanged by preview tooling.

## Phase 5: Regression Hardening (Before Wider Admin Changes)

Purpose: prevent future breakage as admin features expand.

Tasks:
1. Add tests for mode-aware rendering behavior:
   - applicant mode hides admin-only affordances
   - admin preview shows canonical labels when configured
   - applicant school hidden-field rules remain intact unless config changes
2. Add one Playwright manual script/checklist for admin preview vs applicant view parity.
3. Document “safe extension points” for future contributors.

Acceptance criteria:
- Changes to admin builder/preview do not silently regress applicant view.
- Mode boundaries are covered by tests.

## Execution Strategy (PR Sequence)

Recommended order (small PRs):
1. `Renderer modes + applicant guardrails`
2. `Shared field primitives extraction`
3. `Admin builder layout / density improvements`
4. `Admin preview controls (language/viewport/state)`
5. `Regression hardening + docs`

Why this order:
- It lowers regression risk early.
- It avoids mixing architecture refactors with UI redesign in one review.
- It makes applicant-view preservation testable before admin polish accelerates.

## Risks and Mitigations

Risk: Admin preview accidentally reuses applicant autosave/edit handlers.
- Mitigation: separate render primitives from stateful flow components.

Risk: Applicant label/placeholder overrides leak into admin schema editing.
- Mitigation: mode-aware label source resolution (`canonical` vs `applicant_display`).

Risk: Shared component refactors cause subtle spacing regressions.
- Mitigation: screenshot comparisons + targeted applicant regression checks per PR.

Risk: Performance regressions in builder preview (re-rendering large forms).
- Mitigation: isolate preview state updates and avoid full form rehydration on every field metadata change.

## Definition of Done for “Admin View Next”

We consider the next admin workstream successful when:
1. Admins can edit field schema faster with a clearer builder UI.
2. Admin preview is useful and mode-explicit.
3. Applicant view remains visually and behaviorally stable.
4. The mode boundary is documented and test-covered.
