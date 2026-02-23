# Codebase Navigation Map

Quick map for navigating the repo during UI and form work.

## Applicant experience (main route flow)

1. Login (demo bypass available): `src/app/(auth)/login/page.tsx`
2. Applicant dashboard list: `src/app/(dashboard)/applicant/page.tsx`
3. Applicant process page (loads app + stage fields): `src/app/(dashboard)/applicant/process/[cycleId]/page.tsx`
4. Main applicant UI shell + form rendering: `src/components/applicant-application-form.tsx`

## Applicant form UI rendering (where to change what)

- Field rendering, labels, placeholders, help text, grid layout:
  `src/components/applicant-application-form.tsx`
- Boolean segmented controls (Sí/No, Público/Privado):
  `src/components/toggle-pill.tsx`
- Grades tabs and editable grade table:
  `src/components/grades-table.tsx`
- File upload field UI:
  `src/components/upload-zone.tsx`
- Sidebar / progress / top nav wrappers:
  `src/components/applicant-sidebar.tsx`
  `src/components/applicant-mobile-progress.tsx`
  `src/components/applicant-top-nav.tsx`
  `src/components/applicant-action-bar.tsx`
- Edit/view mode flow decisions and UI state rules:
  `docs/APPLICANT_EDIT_MODE_FLOWS.md`

## Field grouping and section classification

- Applicant sections (which field belongs to which step + section descriptions):
  `src/lib/stages/applicant-sections.ts`
- Visual sub-groups/cards inside sections (icons, guardian cards, school info group):
  `src/lib/stages/field-sub-groups.ts`
- Fallback and validation helpers:
  `src/lib/stages/stage-field-fallback.ts`
  `src/lib/stages/form-schema.ts`

## Field definitions / source labels (seeded template copy)

- Stage field template definitions (labels, placeholders, help text):
  `src/lib/stages/templates.ts`

## Theme and global styling

- MUI theme overrides:
  `src/styles/theme.ts`
- Global CSS variables and shared page styles:
  `src/app/globals.css`

## Mockup references

- Applicant mockup HTML reference:
  `public/mockup-applicant-form.html`

## Tests that protect current applicant UI behavior

- Applicant form integration-ish component tests:
  `tests/components/applicant-form.test.tsx`
- Toggle pill component tests:
  `tests/components/toggle-pill.test.tsx`
- Upload zone tests:
  `tests/components/upload-zone.test.tsx`

## Demo testing notes (fastest UI verification path)

- Use login demo bypass buttons in `src/app/(auth)/login/page.tsx`:
  "Entrar como postulante demo"
- From `/applicant`, click "Abrir postulación" on the active cycle.
- Playwright CLI skill works well for snapshot + screenshots during visual polish.

## Recent applicant mockup alignment touchpoints

- `src/components/applicant-application-form.tsx`:
  applicant-specific field chrome, mockup label/placeholder overrides, school section flow tweaks, prep intro step, sidebar hide state, edit-mode top-bar status signals
- `src/components/toggle-pill.tsx`:
  segmented control sizing and selected-state polish
- `src/lib/stages/field-sub-groups.ts`:
  card header icons (visual match to mockup)
- `TODOS_FOR_ADMIN_VIEW.md`:
  follow-ups for admin/editor compatibility
