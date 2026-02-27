# UWC Platforms — Project Memory

## Project Overview
- Next.js app (App Router), TypeScript, Supabase, Tailwind/global CSS
- Branch: `codex/admin-ui-revamp-phase1`
- Package manager: **bun** (`bun run dev`, `bun run test`)
- Dev server: port 3000 via `.claude/launch.json`
- Demo login: "Entrar como admin demo" button on `/admin` login page

## Key Files
- `src/components/stage-config-editor.tsx` — main 2800-line admin form editor component
- `src/app/(dashboard)/admin/process/[cycleId]/stage/[stageCode]/page.tsx` — stage config page
- `src/app/globals.css` — all CSS including `.admin-stage-*` classes
- `src/lib/stages/config.ts` — stage codes: `"documents"` and `"exam_placeholder"`

## Stage Config Editor Architecture
- Two stage codes: `"documents"` (main form) and `"exam_placeholder"` (custom stages)
- `stageCode` param in URL can be either the UUID or the code string; page resolves to `stage_code`
- `documentsRouteRepresentsMainForm = stageCode === "documents"` — filters eligibility section
- Builtin sections: `["eligibility", "identity", "family", "school", "motivation", "recommenders", "documents", "other"]`
- `normalizeBuiltinSectionOrder()` always appends any missing default sections at the end
- Sections with 0 fields are **not rendered** in `editorSections` (`deriveEditorSections` skips them)

## Section Reordering — Key Bug Fix (Feb 2026)
**Problem:** `builtinSectionPositionById` included ALL non-hidden sections (even empty ones not rendered).
This caused:
1. Position map indices didn't match visual order (empty sections counted as slots)
2. `moveBuiltinSection` rebuild loop only preserved `eligibility` in place; hidden/empty sections
   were incorrectly replaced by visible sections, corrupting their positions in the order

**Fix in `stage-config-editor.tsx`:**
- `builtinSectionPositionById` now derived from `editorSections` (only rendered sections)
- `moveBuiltinSection` uses `editorSections` for visible list; rebuild uses `visibleSet` to
  preserve all non-visible sections (hidden, empty) at their original positions in the order

## Demo Navigation
1. Log in via "Entrar como admin demo"
2. Go to Procesos → "Formulario Principal" → Editor de Formulario
3. URL pattern: `/admin/process/[cycleId]/stage/[stageId-or-code]`

## CSS Classes for Section Editor
- `.admin-stage-section-heading-row` — flex row with title + action buttons
- `.admin-stage-section-header-btn` — 28×28px icon buttons (up/down/delete/collapse)
- Disabled state: `opacity: 1`, `cursor: not-allowed` (looks similar to enabled — UX caveat)
