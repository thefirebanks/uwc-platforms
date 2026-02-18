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
4. Edit `Nombre de etapa`, `Hito`, and `Fecha objetivo`.
5. Click `Guardar plantillas`.

Expected:
- New processes auto-generate two stage templates.
- Edited template fields persist after page refresh.
- Audit log records `cycle.templates_updated`.

## Flow 15: Applicant Process Timeline View
1. Login as applicant and open `/applicant/process/:cycleId`.
2. Locate card `Ruta del proceso`.
3. Confirm stage labels, milestones, and target dates match admin edits.

Expected:
- Applicant can view process milestones without admin access.
- Timeline reflects latest admin template configuration.
