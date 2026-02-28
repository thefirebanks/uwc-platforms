# Potential Refactoring Opportunities

> Deep code review of the UWC Peru Selection Platform.
> Generated: 2026-02-26

---

## Priority Summary

| Priority | Count | Description |
|----------|-------|-------------|
| **P0** | 4 | Critical — address before next feature cycle |
| **P1** | 7 | High — schedule within 2 weeks |
| **P2** | 9 | Medium — next sprint |
| **P3** | 3 | Low — nice to have |

---

## P0 — Critical

### 1. Monolithic Components

Two components exceed 2,500 lines and mix multiple unrelated concerns:

**`stage-config-editor.tsx` (2,726 lines)**
- Handles: field editor, drag-and-drop, automation templates, custom sections, stage settings, OCR prompt editing
- Split into: `<StageFieldEditor>`, `<StageAutomationManager>`, `<CustomSectionManager>`, `<StageSettings>`, `<OCRPromptEditor>`

**`applicant-application-form.tsx` (2,560 lines)**
- Handles: multi-step wizard, form rendering, validation, document uploads, recommender flows, auto-save
- 25+ useState hooks in a single component
- Split into: `<ApplicationFormWizard>`, `<FormStep>`, `<DocumentUploadSection>`, `<RecommenderSection>`, `<FormProgress>`

**Impact**: Impossible to test in isolation, performance issues from unnecessary re-renders, any change risks unrelated regressions.

### 2. Type Safety — Unsafe `as` Casts

20+ instances of `as` type assertions with no runtime validation:
- `(cyclesData as CycleRow[] | null)` in API routes
- `(record.fieldSectionAssignments as Record<string, Json>)` in config parsing
- `(templateData as Pick<StageTemplateRow, "admin_config">)`

**Fix**: Introduce Zod schemas for all DB query results and API payloads.

### 3. Zero Test Coverage

Vitest is configured in `package.json` but no test files exist. Critical untested paths:
- `validateStagePayload()` — form validation
- `application-service.ts` — all functions
- `groupApplicantFormFieldsWithCustomSections()` — section grouping
- API route error handling
- `deriveEditorSections()` — field bucketing logic

### 4. Inconsistent API Error Handling

Each component reimplements error handling independently:
```
const [error, setError] = useState(null);
const response = await fetch(url);
const body = await response.json();
if (!response.ok) { setError(body); return; }  // No type safety
```

**Fix**: Create a shared `fetchApi<T>()` wrapper in `/src/lib/client/api-client.ts` that handles errors consistently, with typed error responses.

---

## P1 — High

### 5. Reusable Hooks Missing

Repeated patterns across components that should be custom hooks:
- **`useApiState<T>()`** — loading/error/data state management (repeated in 5+ components)
- **`usePersistentState<T>(key, default)`** — localStorage + React state sync (repeated in sidebar, recommender form)

### 6. State Management in Large Components

`applicant-application-form.tsx` uses 25+ individual `useState` hooks. Related states drift out of sync.
- **Fix**: Consolidate with `useReducer` for form state, save state, and navigation state.

### 7. Missing Error Boundary

No `<ErrorBoundary>` component at root layout. Any unhandled throw crashes the entire app.

### 8. Service Layer Gaps

Several API routes contain inline Supabase queries instead of using the service layer:
- `/api/cycles/route.ts`
- `/api/applications/[id]/validate/route.ts`

**Fix**: Move all DB access to `/src/lib/server/*-service.ts` files. API routes should only handle HTTP concerns.

### 9. API Route Type Contracts

Routes don't declare input/output types:
```ts
export async function GET(request: NextRequest) { ... }  // What does this return?
```

**Fix**: Define typed request/response shapes per route.

### 10. CSS Architecture

`globals.css` is 1,900+ lines mixing variables, resets, layout, and component-specific styles.

**Fix**: Split into modular structure:
```
/src/styles/
  globals.css       (imports only)
  theme.css         (CSS variables)
  layout.css        (topbar, sidebar, shell)
  utilities.css     (eyebrow, page-header)
  components/       (forms.css, buttons.css, cards.css)
```

### 11. Accessibility Gaps

- Some buttons missing `aria-label` (collapse toggles, icon buttons)
- No focus trapping in mobile drawer / modal dialogs
- Color contrast for `--muted: #9A9590` may not meet WCAG AA on light backgrounds

---

## P2 — Medium

### 12. Duplicated Date Formatting

`toDateInputValue()` and `toIsoDate()` reimplemented in 3+ files.
- **Fix**: Centralize in `/src/lib/utils/date-formatters.ts`

### 13. Duplicated Label Mappings

`getStageLabel()`, `getStatusLabel()`, `roleLabel()` scattered across components.
- **Fix**: Single source in `/src/lib/utils/domain-labels.ts`

### 14. Hardcoded Section IDs Across 4 Files

The 8 builtin section IDs (`eligibility`, `identity`, `family`, `school`, `motivation`, `recommenders`, `documents`, `other`) are independently declared in:
1. `applicant-sections.ts` — `SECTION_ORDER`
2. `stage-admin-config.ts` — `BUILTIN_SECTION_IDS`
3. `stage-config-editor.tsx` — `BUILTIN_SECTION_ORDER_DEFAULT`
4. `route.ts` (config API) — `BUILTIN_SECTION_IDS`

**Fix**: Export from one canonical location and import everywhere.

### 15. Section Display Names Hardcoded in 3 Places

Spanish titles like "Datos Personales", "Elegibilidad" defined independently in:
1. `applicant-sections.ts` — `SECTION_META`
2. `stage-config-editor.tsx` — `getBuiltinSectionTitle()`
3. `applicant-application-form.tsx` — `SECTION_TITLES_ES` / `SECTION_TITLES_EN`

**Fix**: Single `SECTION_DISPLAY_NAMES` constant or move to DB/i18n.

### 16. Field Classification is Hardcoded

`classifyApplicantFieldKey()` in `applicant-sections.ts` uses hardcoded prefix patterns + hardcoded field key sets to auto-classify fields into sections. This means adding new field types requires code changes.

**Fix**: Migrate to DB-driven field→section assignments via `admin_config.fieldSectionAssignments`. See Architecture Analysis section below.

### 17. CSS Modules for Components

Non-MUI components use global CSS classes (`.sidebar`, `.stage-item`) risking naming collisions.
- **Fix**: Adopt CSS Modules per component.

### 18. Hardcoded Spanish/English Strings

Multiple components have hardcoded UI text instead of using the i18n system:
```ts
return "1. Formulario Principal";  // Hardcoded in getStageLabel()
```

### 19. Environment-Specific Configuration

Values like `SESSION_TTL_MS = 8 * 60 * 60 * 1000` are hardcoded. Should be configurable per environment.

### 20. Inconsistent Supabase Query Error Handling

Different error handling patterns between service files (`throw new AppError(...)`) and component-level fetch (`setError(body)`).
- **Fix**: Standard `supabaseQuery<T>()` wrapper.

---

## P3 — Low

### 21. Build-Time Environment Validation

Environment checks happen at runtime with `throw`. Could fail earlier at build time.

### 22. Vague Error Context Types

`error-callout.tsx` accepts `context: string` — should be a union type for clarity.

### 23. CSS File Size Impact

1,900+ line CSS file parsed on every page load. Splitting into modules would allow tree-shaking.

---

## Architecture Analysis: Single Source of Truth

### Current State

| What | Source | DB-Driven? |
|------|--------|------------|
| Field definitions | `cycle_stage_fields` table | Yes |
| Field→section assignments | `admin_config.fieldSectionAssignments` | Yes (override) |
| Default field classification | `classifyApplicantFieldKey()` | **No** — hardcoded |
| Builtin section IDs | TypeScript constants (4 files) | **No** — hardcoded |
| Section display names | TypeScript constants (3 files) | **No** — hardcoded |
| Section order | `admin_config.builtinSectionOrder` | Yes (override) |
| Custom sections | `admin_config.customSections` | Yes |
| Sub-groups within sections | `field-sub-groups.ts` | **No** — hardcoded |

### Recommendation

The app currently uses a **hybrid approach**: the DB stores field definitions and admin overrides, but the default section structure is hardcoded. This is discussed in more detail in the architecture answer below.

**Short-term** (P2): Deduplicate the 4 copies of section IDs into one canonical file.

**Medium-term** (P1): Move section display names to the i18n system or a DB-driven config table.

**Long-term** (P0 if new sections needed): Create a `stage_sections` DB table to make the section structure fully dynamic, eliminating the hardcoded `classifyApplicantFieldKey()` logic entirely.
