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
4. Fill required form fields.
5. Save draft.
6. Submit application.

Expected:
- Progress panel (`Progreso de postulación`) is visible and updates section statuses.
- Applicant page keeps maroon mockup hierarchy: eyebrow cycle label, large serif title, and left-accent progress block.
- Draft save success message appears.
- Submit success message appears.
- Record status changes in `applications`.

## Flow 3: Applicant Document Upload
1. Login as applicant with an existing application.
2. Upload identification document.
3. Save association.

Expected:
- Upload succeeds.
- File path stored in `applications.files`.
- File appears in Supabase storage bucket.

## Flow 4: Recommendation Registration
1. Login as applicant.
2. Enter two recommender emails.
3. Register recommenders.

Expected:
- Requests are created in `recommendation_requests`.
- Success message displays request count.

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
2. Paste CSV in import panel.
3. Trigger import.

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

Expected:
- Applicant cannot accidentally edit right after submitting.
- Explicit edit action is required before any changes can be made.

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
2. Confirm page header shows `Cierre de etapa` date for current stage.
3. Confirm no extra full-process timeline card is rendered.

Expected:
- Applicant sees only current-stage context (minimal information principle).
- Stage close date reflects process configuration from admin.

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
2. In `Comunicaciones`, click `Actualizar estado`.
3. Verify at least one queued row appears when automations were triggered.
4. Click `Procesar cola`.
5. Verify counters and table status update (`queued -> sent` or `failed`).
6. Confirm the destination inbox received the email when status is `sent`.
7. Click `Reintentar fallidas`.

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

## Flow 21: Dark Mode Toggle
1. Open `/`, `/login`, or any dashboard page.
2. Click `Alternar modo oscuro`.
3. Verify colors switch immediately.
4. Reload page and confirm selected mode persists.
5. Navigate between home/login/admin/applicant and confirm mode remains consistent.

## Flow 22: Applicant Browser Tampering Attempt
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

Expected:
- Toggle is always available (public pages + dashboard nav).
- Theme persists across reloads via local storage.
- No hydration or console errors when mode changes and page reloads.

## Flow 22: Privilege Escalation Attempts (Applicant)
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
