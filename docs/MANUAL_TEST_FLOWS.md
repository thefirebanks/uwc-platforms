# Manual Test Flows

## Flow 1: Google OAuth Authentication
1. Open `/login`.
2. Click `Continuar con Google`.
3. Complete OAuth in Google.
4. Verify redirect back to app.
5. Verify role routing:
- allowlisted email goes to `/admin`
- non-allowlisted email goes to `/applicant`

Expected:
- Login succeeds without raw errors.
- Profile exists in `profiles` table.

## Flow 2: Applicant Draft + Submit
1. Login as applicant.
2. Open `/applicant`.
3. Select a process and click `Iniciar postulación` or `Abrir postulación`.
4. **Desktop:** Verify fixed sidebar (280px left) shows process title, gradient progress bar, draft status dot, and numbered step list.
5. **Mobile:** Verify collapsible progress panel shows circular progress indicator, current step label, and draft status; tap to expand full step list.
6. Verify section eyebrow header shows "Paso N de M" (uppercase) with serif section title.
7. Fill required form fields.
8. Save draft via the fixed bottom action bar (`Guardar borrador`).
9. Navigate sections using sidebar (desktop) or mobile progress panel.
10. Submit application from `Revisión y envío` section.

Expected:
- Desktop sidebar shows step progress with complete (green check) / active (maroon border) / pending states.
- Mobile progress panel expands/collapses correctly and matches sidebar data.
- Fixed action bar shows Previous (ghost) + Save Draft (outlined) + Next (maroon contained); Previous hidden on first section.
- `Revisión y envío` section shows `Progreso por secciones` summary with per-section status.
- Draft save success message appears.
- Submit success message appears.
- Record status changes in `applications`.

## Flow 3: Applicant Document Upload
1. Login as applicant with an existing application.
2. Upload identification document.
3. Edit `Título visible` and click `Guardar título`.
4. Replace the same document once.

Expected:
- Upload succeeds.
- File metadata stored in `applications.files` (`path`, `title`, `original_name`, `mime_type`, `uploaded_at`).
- UI shows upload timestamp and latest title immediately.
- File appears in Supabase storage bucket.

## Flow 4: Recommendation Registration
1. Login as applicant.
2. Enter one email for `Tutor/Profesor/Mentor` and one for `Amigo`.
3. Click `Guardar recomendadores`.
4. Replace one role email and click `Guardar recomendadores` again.
5. Click `Enviar recordatorio` on one pending recommender.

Expected:
- Requests are created in `recommendation_requests` with role/status fields.
- Same email cannot be reused across both roles.
- Replacing a recommender invalidates prior token row (`status=invalidated`) and creates a new invite row.
- Applicant can see status and reminder count, but never sees raw recommendation links.

## Flow 5: Admin Validation + Stage Transition
1. Login as admin.
2. Open `/admin`.
3. Enter one process via `Gestionar proceso`.
4. Mark one application as `eligible`.
5. Move stage from `documents` to `exam_placeholder`.

Expected:
- Status and stage updates are visible.
- Transition history row is created.
- Audit events are written.

## Flow 6: Exam Import
1. Login as admin.
2. Open `/admin/process/:cycleId` and expand `Operaciones avanzadas`.
3. Paste CSV in import panel.
4. Trigger import.

Expected:
- Imported/skipped summary shown.
- No rows are persisted; this endpoint is in simulation mode.

## Flow 7: Error Reporting
1. Trigger an error case (invalid action or malformed payload).
2. Confirm UI shows `Error ID`.
3. Click `Reportar este problema`.

Expected:
- `bug_reports` row created with error id and context.
- Non-technical user has copyable bug context.

## Flow 8: Access Control
1. While logged out, open `/admin` and `/applicant`.
2. As applicant, attempt admin-only action.

Expected:
- Redirect to login when unauthenticated.
- Admin-only actions return permission-safe errors.

## Flow 9: Runtime Logging Visibility
1. Run `bun run dev`.
2. Execute one successful API flow (e.g., save applicant draft).
3. Execute one failing API flow (e.g., invalid payload).

Expected:
- Terminal shows structured `info` log with `operation`, `status`, and `durationMs`.
- Terminal shows structured `warn`/`error` log for failing flow with `requestId`.
- Returned UI error includes `Error ID` that matches the same `requestId` in logs.

## Flow 10: Admin Audit Viewer
1. Login as admin and open `/admin/audit`.
2. Verify recent actions are listed.
3. Filter by `Request ID` and click `Buscar`.
4. Click `Exportar CSV`.

Expected:
- Table updates with filtered results.
- Actor name/email are visible when available.
- CSV download contains filtered audit rows.

## Flow 11: Applicant Lock/Unlock Editing
1. Login as applicant.
2. Open a process in `/applicant/process/:cycleId`.
3. Submit the application.
4. Verify form fields are disabled.
5. Click `Editar respuesta`.
6. Verify fields become editable again.
7. Move stage close date to past in admin settings and refresh applicant page.
8. Verify applicant cannot enable edit mode anymore.

Expected:
- Applicant cannot accidentally edit right after submitting.
- Explicit edit action is required before any changes can be made.
- After stage close date, applicant edits stay blocked and only admin intervention is possible.

## Flow 12: Admin Process Dashboard + Stage Date Config
1. Login as admin and open `/admin`.
2. Create a process with `Crear proceso`.
3. Open `Gestionar proceso`.
4. Update Stage 1/Stage 2 dates and click `Guardar fechas`.
5. Return to `/admin` and verify process summary dates changed.
6. Use `Marcar activo` on a different process.

Expected:
- New process appears in process list with zero applications.
- Date updates persist after refresh.
- Only one process remains active at a time.

## Flow 13: Applicant Process Dashboard Limits
1. Login as applicant and open `/applicant`.
2. Verify existing applications show `Abrir postulación`.
3. After reaching 3 total applications, verify a process without application shows `Límite alcanzado`.

Expected:
- Applicant sees process-level status before entering forms.
- Max-3 rule is visible and enforced in UI.

## Flow 14: Process Templates Bootstrap + Edit
1. Login as admin and create a new process from `/admin`.
2. Open that process (`Gestionar proceso`).
3. Verify `Plantillas de etapas` shows Stage 1 and Stage 2 preloaded.
4. Edit `Nombre de etapa` and `Hito`.
5. Click `Guardar plantillas`.

Expected:
- New processes auto-generate two stage templates.
- Edited template fields persist after page refresh.
- Audit log records `cycle.templates_updated`.
- Date edits are handled only in `Configuración de etapas` (no duplicated date input in template rows).

## Flow 15: Applicant Stage Context View
1. Login as applicant and open `/applicant/process/:cycleId`.
2. **Desktop:** Confirm sidebar header shows process title and optional deadline date for current stage.
3. **Mobile:** Confirm collapsible progress panel shows current step label; no extra full-process timeline card is rendered.
4. Confirm no standalone page header with stage badge is rendered (stage context is embedded in sidebar/mobile panel).

Expected:
- Applicant sees only current-stage context (minimal information principle).
- Stage close date (if configured) appears in sidebar header on desktop and is accessible via mobile progress panel.
- No separate page-level header duplicates stage information.

## Flow 16: Admin Stage Field Builder
1. Login as admin and open `/admin/process/:cycleId`.
2. In `Plantillas de etapas`, click `Editar campos` for Stage 1.
3. Add one field, edit one existing label, mark one field optional/required, and remove one field.
4. Reorder fields (drag and drop or `mover arriba/abajo` buttons).
5. Use `+` controls (`Agregar campo en posición ...`) between two existing fields.
6. Click `Guardar configuración`.
7. Refresh page and verify edits persist.

Expected:
- Stage field list supports add/remove/edit and required toggle.
- Stage field list supports ordering (drag/move controls) and insertion between rows with explicit `+` controls.
- Save succeeds with visible success message.
- Audit includes `cycle.stage_config_updated`.

## Flow 17: Applicant Dynamic Form Rendering
1. Login as admin and rename one Stage 1 field label from stage config page.
2. Login as applicant and open `/applicant/process/:cycleId`.
3. Verify the renamed field appears with updated label.
4. Try saving with a required field empty and verify validation error.

Expected:
- Applicant sees form fields based on current stage configuration.
- Required-field validation blocks invalid save attempts with clear messages.

## Flow 18: Stage Automation Templates
1. Login as admin and open `/admin/process/:cycleId/stage/documents`.
2. Expand `Automatizaciones de correo (Avanzado)`.
3. Enable `Postulación enviada` automation and edit subject/body with template variables.
4. As applicant, submit a valid application.
5. In Supabase, verify `communication_logs` row is queued with rendered subject/body.

Expected:
- Automation template edits persist.
- Submit trigger queues communication log using configured template.
- If queueing fails, submission still completes and audit metadata includes `automationQueueFailed=true`.

## Flow 19: Communication Queue Lifecycle
1. Login as admin and open `/admin/process/:cycleId`.
2. Expand `Operaciones avanzadas`.
3. In `Comunicaciones`, click `Actualizar estado`.
4. Verify at least one queued row appears when automations were triggered.
5. Click `Procesar cola`.
6. Verify counters and table status update (`queued -> sent` or `failed`).
7. Confirm the destination inbox received the email when status is `sent`.
8. Click `Reintentar fallidas`.

Expected:
- Summary chips reflect queue lifecycle counts.
- Process action shows processed/sent/failed totals.
- `provider_message_id` is stored for delivered emails.
- Failed rows can be retried without page errors.
- If `RESEND_API_KEY`/`RESEND_FROM_EMAIL` are missing, UI shows a clear configuration error.

## Flow 20: OCR Validation and History
1. Ensure applicant has at least one uploaded document.
2. Login as admin and open `/admin/process/:cycleId`.
3. In `Postulaciones`, click `OCR` for that application.
4. Confirm success feedback includes confidence percentage.
5. Confirm `Historial OCR` panel appears and includes:
- timestamp
- file key
- confidence chip
- OCR summary text
6. Refresh page and click `Ver OCR`.

Expected:
- OCR run persists a history row per execution.
- OCR history remains visible after refresh.
- Admin can use OCR output for quick document triage/debugging.

## Flow 21: OCR Prompt Editor
1. Login as admin and open `/admin/process/:cycleId/stage/documents`.
2. In `Prompt OCR (Gemini)`, edit prompt text and click `Guardar configuración`.
3. Return to process dashboard and run OCR on one file.

Expected:
- Prompt text persists after refresh.
- New OCR execution uses the updated prompt template.
- Audit metadata includes stage config update event.

## Flow 22: Dark Mode Toggle
1. Open `/`, `/login`, or any dashboard page.
2. Click `Alternar modo oscuro`.
3. Verify colors switch immediately.
4. Reload page and confirm selected mode persists.
5. Navigate between home/login/admin/applicant and confirm mode remains consistent.

## Flow 23: Applicant Browser Tampering Attempt
1. Login as applicant demo.
2. Open browser console and run:
```js
await fetch("/api/audit");
await fetch("/api/communications/process", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({})
});
await fetch("/api/applications/00000000-0000-0000-0000-000000000000/validate", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ status: "eligible", notes: "test" })
});
```
3. Verify all responses are `403`.
4. Verify terminal logs contain matching `requestId` for each denied attempt.

Expected:
- Applicant cannot trigger admin actions via direct API calls.
- Response includes clear permission-safe error message.
- Denied attempts are observable in structured logs.

## Flow 24: Privilege Escalation Attempts (Applicant)
1. Login as applicant.
2. From browser console, try calling admin API endpoints directly:
- `POST /api/applications/:id/transition`
- `PATCH /api/cycles/:id`
- `PATCH /api/cycles/:id/stages/documents/config`
3. Using Supabase JS in console, attempt direct table mutations:
- update own `profiles.role` to `admin`
- update own `applications.stage_code` or `applications.validation_notes`
- insert `recommendation_requests` for an application that is not yours

Expected:
- Admin endpoints return `403`.
- Direct profile role change is rejected by RLS (`profiles_update_self` guard).
- Applicant direct application privilege fields are blocked by trigger/RLS guards.
- Cross-application recommendation inserts are rejected by RLS ownership check.

## Flow 25: Public Recommender OTP + Draft + Submit
1. Use a real recommendation link from email (`/recomendacion/:token`).
2. Verify page shows masked email, role, and expiry.
3. Click `Enviar OTP`, read code from email, and click `Validar OTP`.
4. Fill form partially and click `Guardar borrador`.
5. Reload page; verify draft is restored after session validation.
6. Complete all required fields and click `Enviar recomendación`.
7. Reopen the link and confirm form is locked as submitted.

Expected:
- OTP required before form access.
- Draft saves and resumes within active session.
- Final submit is one-way (`status=submitted` + immutable for recommender).
- Friend role requires non-family confirmation checkbox.

## Flow 26: UI Consistency Audit Pass
1. Review `/`, `/login`, `/applicant`, `/applicant/process/:cycleId`, `/admin`, and `/admin/process/:cycleId`.
2. Verify text alignment for labels/placeholders/helper text in all form controls.
3. Verify toggle contrast and selected/unselected visibility.
4. Verify date fields and dense rows keep consistent spacing and alignment.
5. Verify no clipped text in chips/buttons/cards at desktop and mobile widths.

Expected:
- No visual misalignment regressions in core forms.
- Control states are distinguishable and accessible.
- Layout remains stable across breakpoints.

## Flow 27: UX Visibility and Information Density Audit
1. For applicant pages, verify only current-stage actions are visible by default.
2. For admin pages, verify high-frequency actions are visible first.
3. Verify advanced/low-frequency controls are behind explicit reveal sections.
4. Verify there is no duplicated configuration entry point for the same setting.

Expected:
- Pages remain functional without overwhelming users.
- Visibility hierarchy matches user role priorities.
- Advanced controls are discoverable but not noisy.

## Flow 28: Export Data (Individual + Bulk)
1. As admin, export one individual applicant package.
2. Click `Exportar JSON` in one row and confirm a `.json` file downloads.
3. Verify metadata includes stage, validation status, and document references.
4. Apply filters (stage/status/eligibility) and export a bulk CSV.
5. Click `Exportar CSV filtrado` and confirm the downloaded CSV matches current filters.
6. Validate exported rows match filtered table contents.

Expected:
- Individual export is complete and downloadable.
- Bulk export respects selected filters.
- Export schemas are stable and committee-friendly.

## Flow 29: Stage 1 PDF Default Schema Coverage
1. Login as admin and open `/admin/process/:cycleId/stage/documents`.
2. Verify fields include all major sections from `docs/STAGE1_PDF_FIELD_INVENTORY.md`:
- Cumplimiento de requisitos
- Información personal
- Información del colegio
- Hoja de vida e interés en UWC
- Documentos y pago
- Notas oficiales por grado (PRIMERO a QUINTO)
3. Verify one field from the notes matrix exists (por ejemplo, `Notas oficiales PRIMERO - Arte`).
4. Login as applicant and open `/applicant/process/:cycleId`.
5. Verify those default fields render in applicant mode without manual admin bootstrapping.

Expected:
- Legacy 7-field cycles are auto-expanded to the full Stage 1 default schema.
- New/empty Stage 1 configs bootstrap to the full official default schema.
- Admin can edit/reorder/remove the expanded defaults as usual.
- Applicant form reflects the same expanded schema.

## Flow 30: Applicant Section Wizard + Autosave
1. Login as applicant and open `/applicant/process/:cycleId`.
2. Verify `Antes de empezar` appears as its own dedicated intro step before `Elegibilidad` (not repeated inside every section).
3. Open that intro step and verify checklist + required document hints are present.
4. **Desktop:** Verify fixed sidebar (280px left) shows clickable step list with active step highlighted. **Mobile:** Verify collapsible progress panel shows progress and current step label.
5. In section `Elegibilidad`, edit one field and stop typing.
6. Verify draft status indicator shows `Cambios pendientes` then transitions to `Guardando...` and finally `Borrador guardado` (status visible in top nav and mobile progress panel on mobile).
7. Click `Siguiente` in the fixed bottom action bar and confirm section navigation works without losing values.
8. **Desktop:** Use sidebar step list to jump directly to `Recomendadores`, then back to `Datos personales`. **Mobile:** Expand progress panel and tap steps to navigate.
9. In any field, make another edit and pause (without pressing submit); verify debounced autosave persists the draft.

Expected:
- Applicant sees one section at a time (reduced cognitive load).
- Desktop sidebar and mobile progress panel both reflect current section and completion status.
- Autosave persists partial drafts without forcing all required fields immediately.
- Draft status label updates clearly while editing/saving and after save completes.
- Manual `Guardar borrador` in the fixed bottom action bar remains available and uses same draft pipeline.
- Section navigation via sidebar (desktop), mobile progress panel, or action bar buttons keeps data intact and progress statuses update.

## Flow 31: Applicant Mobile Layout Polish (Stage 1)
1. Open `/applicant/process/:cycleId` on mobile viewport (e.g. 390x844).
2. Verify top navigation remains usable:
   - brand and `Procesos` stay visible
   - role chip is hidden on mobile
   - `Cerrar sesión` stays tappable
3. Verify collapsible mobile progress panel:
   - compact bar shows current step label + circular SVG progress percentage
   - tapping the bar expands full step list with numbered items and completion states
   - draft status dot/label is visible in the panel
   - panel collapses cleanly when tapped again
4. Verify section eyebrow header:
   - "Paso N de M" uppercase label in maroon
   - serif section title (Newsreader) is readable and does not clip
5. Scroll through Stage 1 content and verify the fixed bottom action bar:
   - bar is fixed at bottom with no left offset on mobile (full width)
   - Previous (ghost), Save Draft (outlined), Next (maroon contained) buttons are tappable
   - no overlay blocking form inputs
6. Verify long labels (especially imported from PDF inventory) are readable and do not collapse into clipped text.
7. Verify sidebar is completely hidden on mobile (no horizontal overflow or scroll).

Expected:
- Mobile flow stays readable and tappable across header, progress panel, and form sections.
- Collapsible progress panel provides navigation and status without consuming permanent screen space.
- Fixed action bar remains visible and accessible without covering in-progress fields.
- High-density field labels stay legible through normalized display labels.
- No horizontal scroll caused by hidden sidebar elements.
