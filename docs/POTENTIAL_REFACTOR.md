# Potential Refactoring Opportunities

> Deep code review of the UWC Peru Selection Platform.
> Generated: 2026-02-26 | Updated: 2026-03-01

---

## Priority Summary

| Priority | Count | Description |
|----------|-------|-------------|
| **P0** | 2 | Critical — address before next feature cycle |
| **P1** | 5 | High — schedule within 2 weeks |
| **P2** | 7 | Medium — next sprint |
| **P3** | 3 | Low — nice to have |
| **Done** | 4 | Completed since original review |

---

## P0 — Critical

### 1. Monolithic Components *(partially addressed)*

Two components still exceed 2,000 lines:

**`stage-config-editor.tsx` (2,107 lines)** *(down from 2,726)*
- ~620 lines removed via DB-driven section migration
- Still handles: field editor, drag-and-drop, automation templates, stage settings, OCR prompt editing
- Split into: `<StageFieldEditor>`, `<StageAutomationManager>`, `<StageSettings>`, `<OCRPromptEditor>`

**`applicant-application-form.tsx` (2,516 lines)** *(down from 2,560)*
- Sub-components extracted: `ApplicantSidebar`, `ApplicantActionBar`, `ApplicantMobileProgress`, `ApplicantTopNav`, `TogglePill`, `GradesTable`, `UploadZone`
- useState reduced from 25+ → 6 in the main component body
- Still needs split into: `<ApplicationFormWizard>`, `<FormStep>`, `<DocumentUploadSection>`, `<RecommenderSection>`

**Impact**: Large files remain hard to test in isolation and risk unrelated regressions.

### 2. Type Safety — Unsafe `as` Casts

**89 instances** of `as` type assertions across 20 files with no runtime validation.

Top offenders:
- `cycles/[id]/stages/[stageCode]/config/route.ts`: 15 instances
- `recommendations-service.ts`: 12 instances
- `application-service.ts`: 8 instances
- `automation-service.ts`: 8 instances
- `exports-service.ts`: 7 instances

**Fix**: Introduce Zod schemas for all DB query results and API payloads.

---

## P1 — High

### 3. Client-Side API Error Handling

Server-side error handling is now consistent via `withErrorHandling()` + `AppError` (see Completed section). However, **client-side** components still independently implement `fetch()` + `response.ok` checks + `useState` error patterns.

**Fix**: Create a shared `fetchApi<T>()` wrapper in `/src/lib/client/api-client.ts`.

### 4. Reusable Hooks Missing

Repeated patterns across components that should be custom hooks:
- **`useApiState<T>()`** — loading/error/data state management (repeated in 5+ components)
- **`usePersistentState<T>(key, default)`** — localStorage + React state sync (repeated in sidebar, recommender form)

### 5. Missing Error Boundary

No `<ErrorBoundary>` component at root layout. Any unhandled throw crashes the entire app.

### 6. Service Layer Gaps *(partially addressed)*

`/api/applications/[id]/validate/route.ts` now delegates to the service layer (fixed).

Still outstanding: `/api/cycles/route.ts` contains **inline Supabase queries** in both GET (lines 37-95) and POST (lines 120-191) handlers. No `cycles-service.ts` exists.

**Fix**: Create `/src/lib/server/cycles-service.ts` and move all DB access there.

### 7. CSS Architecture

`globals.css` is **1,930 lines** mixing variables, resets, layout, and component-specific styles.

**Fix**: Split into modular structure under `/src/styles/`.

---

## P2 — Medium

### 8. Duplicated Date Formatting

`toDateInputValue()` defined independently in:
1. `admin-dashboard.tsx` (line 27)
2. `stage-config-editor.tsx` (line 202)

`toIsoDate()` in `admin-dashboard.tsx` + variant `toIsoDateBoundary()` in config route.

**Fix**: Centralize in `/src/lib/utils/date-formatters.ts`

### 9. Duplicated Label Mappings

- `roleLabel()` defined independently in 3 files: `recommendations-service.ts`, `applicant-application-form.tsx`, `recommender-form.tsx`
- `getStatusLabel()` in 2 files: `admin-candidates-dashboard.tsx`, `recommender-form.tsx`
- `getStageLabel()` in `admin-candidates-dashboard.tsx`

**Fix**: Single source in `/src/lib/utils/domain-labels.ts`

### 10. Section Display Names *(partially addressed)*

Form content section titles (`eligibility`, `identity`, `family`, etc.) are now DB-driven via `stage_sections` table. `SECTION_META` and `getBuiltinSectionTitle()` have been removed.

Still hardcoded: wizard-level static section titles (`SECTION_TITLES_ES` / `SECTION_TITLES_EN` in `applicant-application-form.tsx` lines 80-92) for `prep_intro`, `documents_uploads`, `recommenders_flow`, `review_submit`. Also a stale hardcoded string "Sección 1: Datos Personales" in `stage-config-editor.tsx` line 1412.

### 11. Accessibility *(partially addressed)*

21 `aria-label` attributes now exist across 10 component files.

Still outstanding:
- No focus trapping in mobile drawer / modal dialogs
- Color contrast for `--muted: #9A9590` may not meet WCAG AA on light backgrounds

### 12. CSS Modules for Components

Zero `.module.css` files exist. All component styling uses global CSS classes risking naming collisions.

### 13. Hardcoded Spanish/English Strings

Still prevalent in admin components:
- `admin-candidates-dashboard.tsx`: `"1. Formulario Principal"`, `"En progreso"`, `"Completado"`
- `stage-config-editor.tsx`: `"Formulario Principal"`, `"Sección 1: Datos Personales"`
- `admin-stage-sidebar.tsx`, `admin-stage-form-preview.tsx`: `"Formulario Principal"`

### 14. Environment-Specific Configuration

`SESSION_TTL_MS = 8 * 60 * 60 * 1000` hardcoded in `recommendations-service.ts`. No build-time env validation.

### 15. API Route Type Contracts

Routes don't declare typed request/response shapes. Zod used for input validation but no shared response types.

---

## P3 — Low

### 16. Build-Time Environment Validation

Environment checks happen at runtime with `throw`. Could fail earlier at build time with `t3-env` or `envalid`.

### 17. Vague Error Context Types

`error-callout.tsx` accepts `context: string` — should be a union type for clarity.

### 18. CSS File Size Impact

1,930-line CSS file parsed on every page load. Splitting into modules would allow tree-shaking.

---

## Completed

### ~~3. Zero Test Coverage~~ (was P0)
**Resolved 2026-02-28.** 38 test files across 5 categories:
- `tests/unit/` — 17 files (applicant-sections, application-validation, automation-service, etc.)
- `tests/components/` — 12 files (applicant-form, stage-config-editor, admin-dashboard, etc.)
- `tests/e2e/` — 7 Playwright specs (access-control, admin-field-crud, applicant lifecycle, etc.)
- `tests/integration/` — 2 files
- `tests/security/` — 1 file

151+ tests passing. Previously untested paths like `validateStagePayload()`, `applicant-sections`, and `stage-form-schema` are now covered.

### ~~4. Server-Side API Error Handling~~ (was P0)
**Resolved 2026-02-28.** All 29 API route files use `withErrorHandling()` from `/src/lib/errors/with-error-handling.ts`, providing consistent `AppError`-based responses with `requestId`, structured logging, and typed user messages. Client-side `fetchApi<T>()` wrapper remains outstanding (see item 3 above).

### ~~14. Hardcoded Section IDs Across 4 Files~~ (was P2)
**Resolved 2026-02-27.** All 4 copies removed:
- `SECTION_ORDER` in `applicant-sections.ts` — gone
- `BUILTIN_SECTION_IDS` in `stage-admin-config.ts` — gone (file stripped to 37 lines with redirect comment)
- `BUILTIN_SECTION_ORDER_DEFAULT` in `stage-config-editor.tsx` — gone
- `BUILTIN_SECTION_IDS` in config route — gone

`stage_sections` DB table (migrations `20260227000300` + `20260227000400`) is now the single source of truth.

### ~~16. Field Classification is Hardcoded~~ (was P2)
**Resolved 2026-02-27.** `classifyApplicantFieldKey()` completely removed from the codebase. Fields are now assigned to sections via `section_id` FK on `cycle_stage_fields`, pointing to the `stage_sections` table. Comment in `applicant-sections.ts`: "No more hardcoded prefix matching."

---

## Architecture Analysis: Single Source of Truth

### Current State (as of 2026-03-01)

| What | Source | DB-Driven? |
|------|--------|------------|
| Field definitions | `cycle_stage_fields` table | Yes |
| Field→section assignments | `cycle_stage_fields.section_id` FK → `stage_sections` | Yes |
| Section IDs | `stage_sections` table | Yes |
| Section display names (form) | `stage_sections.title` | Yes |
| Section display names (wizard) | `SECTION_TITLES_ES/EN` in `applicant-application-form.tsx` | **No** — hardcoded |
| Section order | `stage_sections.sort_order` | Yes |
| Section visibility | `stage_sections.is_visible` | Yes |
| Sub-groups within sections | `field-sub-groups.ts` | **No** — hardcoded |

### Remaining Work

The architecture is now **predominantly DB-driven**. The short-term and long-term goals from the original review have been completed (deduplicate section IDs → done; create `stage_sections` table → done).

Two items remain hardcoded:
1. **Wizard section titles** — Move to i18n system or make configurable per cycle.
2. **Sub-groups** — Consider making configurable if admin needs to reorder fields within sections.
