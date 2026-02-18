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
3. Fill required form fields.
4. Save draft.
5. Submit application.

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
3. Mark one application as `eligible`.
4. Move stage from `documents` to `exam_placeholder`.

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
2. Submit the application.
3. Verify form fields are disabled.
4. Click `Editar respuesta`.
5. Verify fields become editable again.

Expected:
- Applicant cannot accidentally edit right after submitting.
- Explicit edit action is required before any changes can be made.
