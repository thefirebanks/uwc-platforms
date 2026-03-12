# V1 Improvements Part 2

Date: 2026-03-02  
Status: Approved planning scope (implementation next)  
Decision lock: Bulk export is payload-driven, with an admin-friendly field picker UI (no raw payload path typing).

## Goal

Close the V1 polish gaps reported in admin/applicant workflows, with special focus on:
- real mass communications (send now, not only templates),
- stronger LLM prompt controls and injection resilience,
- reliable real-time UX updates,
- complete admin editing for files and recommendations,
- and export/search correctness.

## Scope Map (Feedback -> Workstream)

| Feedback Item | Workstream | Priority |
|---|---|---|
| Mass email sending beyond templates, immediate send | WS1 Communications | P0 |
| Gemini prompt controls in separate tab + richer testbed + prompt injection resilience | WS2 Prompt Studio | P0 |
| Remove redundant intro instructions vs rules; keep single instructions in settings; markdown support | WS3 Stage Config UX | P1 |
| Stage name edits reflect immediately in admin sidebar | WS3 Stage Config UX | P1 |
| Add one more demo applicant for dev only | WS6 Dev Safety + Seed Data | P2 |
| Export includes applicant form fields, not only metadata | WS5 Export Builder | P0 |
| Fix admin applicant search | WS4 Admin Candidate Ops | P0 |
| Allow admin editing of applicant files and recommendations | WS4 Admin Candidate Ops | P0 |
| Track where applicants are stuck in Stage 1 | WS7 Funnel Tracking | P1 |
| Fix real-time applicant sidebar + revision/submission tracker updates | WS8 Applicant Realtime UX | P1 |
| Remove duplicate save/submit buttons in final review | WS8 Applicant Realtime UX | P1 |
| Fix admin file view NaN Kb + missing file/download; test admin tracking thoroughly | WS4 Admin Candidate Ops | P0 |
| Finish real email + recommendation infrastructure and list user setup actions | WS1 + WS9 | P0 |

## WS1 - Communications: Real Broadcast Email Sending

### Current Gap

Existing communications support automation/template queueing, preview, and test-send, but admin lacks a true compose-and-send broadcast flow with recipient targeting and immediate execution.

### Plan

1. Add a new `Broadcasts` panel under admin communications.
2. Support recipient targeting by cycle, stage, status, and optional search filter.
3. Support custom subject/body compose with merge variables and markdown preview.
4. Add `Send now` (queue + immediate processor trigger) and `Schedule` (optional phase 2).
5. Track campaign-level metadata for auditability and deduplication.

### Backend Changes

- Extend communications send API to accept broadcast payload and recipient query filters.
- Introduce `communication_campaigns` table (proposed):
  - `id`, `created_by`, `cycle_id`, `name`, `subject`, `body_template`, `recipient_filter`, `status`, `created_at`, `sent_at`.
- Link `communication_queue`/`communication_logs` records to `campaign_id`.
- Add idempotency key to prevent accidental duplicate sends.

### UI Changes

- `src/components/admin-dashboard.tsx`
  - Add `Broadcasts` tab.
  - Add recipient selector, selected count preview, compose editor, dry-run preview.
  - Add `Send now` action with confirmation modal showing final recipient count.

### Acceptance Criteria

- Admin can send a custom email (non-template) to filtered recipients in one action.
- Send is auditable by campaign and per-recipient delivery status.
- No duplicate sends when admin retries same request quickly.
- Preview and test-send continue to work for both templates and broadcasts.

### Tests

- Unit: campaign creation, recipient resolution, idempotency, status transitions.
- Integration: broadcast API -> queue -> process -> log chain.
- E2E: admin sends broadcast to stage-filtered applicants and sees final statuses.

## WS2 - Prompt Studio: Better Controls + Prompt Injection Resilience

### Current Gap

OCR testbed exists but prompt controls are basic and mixed into current dashboard flow; hardening against hostile document instructions is minimal.

### Plan

1. Create separate `Prompt Studio` admin tab (distinct from regular OCR checks).
2. Add richer controls:
   - model,
   - system prompt,
   - extraction instructions,
   - expected JSON schema template,
   - temperature/top-p/max tokens,
   - test file upload and side-by-side runs.
3. Add explicit guardrail layer for prompt-injection resilience.

### Injection Resilience Controls

- Immutable system preamble (not editable by admins) with strict extraction contract.
- Delimited untrusted document region (`BEGIN_UNTRUSTED_DOC` / `END_UNTRUSTED_DOC`).
- Explicit policy: ignore instructions found inside applicant files; treat as data only.
- Strict output validation against expected schema (fail closed, no partial unsafe parse).
- Malicious instruction detection markers for observability and QA.

### UI and API Touch Points

- `src/components/admin-dashboard.tsx` (new tab wiring)
- `src/components/admin-ocr-testbed.tsx` (split/reuse where possible)
- `src/app/api/ocr-testbed/route.ts` (extended request shape)
- `src/lib/server/ocr.ts` (prompt assembly, guardrails, validation)

### Acceptance Criteria

- Admin can run controlled prompt experiments without touching production extraction config accidentally.
- Malicious instructions embedded in test documents do not alter extraction behavior.
- Failures return explicit structured errors, not silent parser fallback.

### Tests

- Unit: prompt assembler preserves immutable preamble and delimiters.
- Unit: schema validator rejects off-schema responses.
- Integration: known injection test corpus returns safe behavior.

## WS3 - Stage Config UX Cleanup (Instructions + Live Stage Names)

### Current Gap

- Intro instructions are conceptually duplicated between stage intro and settings text.
- Stage label updates do not reflect immediately in sidebar due to hardcoded labels for some stage types.

### Plan

1. Consolidate to a single instructions source in stage settings.
2. Rename field to a clear admin label, for example: `Instrucciones de la etapa (Markdown)`.
3. Render these instructions first in applicant intro step.
4. Support markdown rendering safely in applicant UI.
5. Remove hardcoded sidebar labels and always respect editable `stage_label`.

### Technical Notes

- Update `admin_config.description` semantics to stage instructions markdown.
- Sanitize markdown rendering to avoid script injection.
- Update sidebar mapping in `src/components/admin-stage-sidebar.tsx` so `documents` and `exam_placeholder` use configured label.
- Trigger immediate UI refresh after stage config save (optimistic local update + refresh fallback).

### Acceptance Criteria

- One source of truth for stage instructions.
- Applicant intro shows markdown instructions correctly and first.
- Editing stage name updates admin sidebar immediately without reload.

### Tests

- Unit: markdown render sanitation.
- Component: stage label update propagation.
- E2E: edit stage name and confirm sidebar reflects new name instantly.

## WS4 - Admin Candidate Ops Reliability (Search, Files, Recommendations)

### Current Gap

- Search appears unreliable in some scenarios.
- Admin viewer file tab has shape mismatch (`NaN Kb`) and no robust download/edit path.
- Recommendations are visible but not fully editable operationally.

### Plan

1. Search hardening:
   - normalize query input,
   - ensure `search_vector` fallback behavior,
   - add graceful fallback `ILIKE` path if FTS returns empty.
2. File tab fix:
   - normalize API response shape consumed by admin viewer,
   - reliable size formatter,
   - add signed download URL action,
   - optional metadata edit (title/category/notes).
3. Recommendation admin actions:
   - edit recommender name/email (with audit),
   - re-send invite/reminder,
   - allow admin file attach/manual mark-received (with reason).

### Technical Touch Points

- `src/components/admin-application-viewer.tsx`
- `src/lib/server/search-service.ts`
- `src/app/api/applications/search/route.ts`
- `src/app/api/applications/[id]/files/route.ts`
- `src/app/api/applications/[id]/admin-upload/route.ts`
- `src/lib/server/recommendations-service.ts`

### Acceptance Criteria

- Search reliably returns expected applicants for common name/email queries.
- File tab never shows `NaN Kb`; each file supports download.
- Admin can operationally manage recommendation corrections without DB/manual intervention.

### Tests

- Unit: search normalization and fallback.
- Integration: file payload shape contract tests.
- E2E: admin edits recommendation contact, triggers reminder, and sees audit events.

## WS5 - Export Builder: Payload-Driven Fields with Admin-Friendly Picker

### Product Decision

Use payload-driven export columns, but with a no-code configuration UI:
- Admin selects fields from a checkbox list grouped by section.
- Admin never types raw paths like `academics.classRank` manually.

### Plan

1. Build a field catalog for the selected cycle from stage form schemas and known payload keys.
2. Show grouped checkbox picker in export builder:
   - group by stage/section,
   - human-readable labels,
   - optional technical path shown as helper text.
3. Persist selected field set as saved export presets.
4. Generate CSV/XLSX columns from selected field paths.
5. Keep stable core metadata columns always available (app id, status, stage, timestamps) and let admin toggle payload columns.

### UI Behavior

- `src/components/admin-export-builder.tsx`
  - left panel: available fields (checkbox list)
  - right panel: selected fields + column order
  - preview first N rows before download

### Backend Changes

- `src/lib/server/exports-service.ts`
  - accept selected payload field paths,
  - resolve nested values safely,
  - stringify arrays/objects in readable format.
- `src/app/api/exports/route.ts`
  - validate selected fields against catalog to prevent arbitrary path abuse.

### Acceptance Criteria

- Admin can include applicant form fields in bulk export without developer help.
- Export includes selected payload fields for CSV and XLSX.
- Invalid/nonexistent fields are blocked with clear validation messages.

### Tests

- Unit: path resolver for nested payload values.
- Integration: export API with selected fields.
- E2E: admin selects checkboxes and downloads expected columns.

## WS6 - Dev-Only Demo Applicant Expansion

### Plan

1. Add one additional fake applicant in `scripts/create-fake-users.ts`.
2. Keep seeding behind explicit dev guardrails.
3. Confirm demo login/reset tools remain hidden unless dev bypass is enabled.

### Acceptance Criteria

- Two demo applicants are available in dev/test environments.
- No demo credentials/features are exposed in production.

## WS7 - Stage 1 Funnel Tracking (Where Applicants Are Stuck)

### Plan

1. Define completion checkpoints for Stage 1:
   - profile basics,
   - required form sections,
   - required files,
   - recommendations requested/received,
   - final submission state.
2. Build admin summary metrics (counts and percentages by missing item).
3. Add per-applicant blockers list in admin candidate detail.

### Acceptance Criteria

- Admin can see exactly where applicants are blocked in Stage 1.
- Metrics update after applicant edits/uploads/submits.

### Tests

- Unit: blocker derivation from payload/files/recommendations.
- Integration: summary endpoint aggregation correctness.

## WS8 - Applicant Realtime UX and Final Review Cleanup

### Current Gap

- Sidebar/revision tracker can become stale after edits.
- Final review section has duplicate save/submit controls.

### Plan

1. Remove duplicate review buttons in section body; keep action bar as single source.
2. Recompute progress state after every save/upload/recommendation update.
3. Add lightweight refresh/subscription strategy for consistency:
   - optimistic local updates first,
   - server revalidation after mutation,
   - optional realtime subscription where available.

### Acceptance Criteria

- Only one save/submit control set is visible in final review.
- Sidebar and revision/submission tracker reflect latest state immediately after edits.

### Tests

- Component: review section button presence.
- E2E: applicant edits data/uploads file and sees immediate tracker updates.

## WS9 - Real Email + Recommendations Infrastructure Completion

### What Is Already Implemented

- Email queue and processing with Gmail API integration.
- Communications logs/status lifecycle.
- Email preview and test-send endpoints.
- Full recommendation flow (invite, OTP/session, remind, submit).

### Remaining Engineering Completion Items

1. Broadcast compose/send UX (WS1).
2. Recommendation admin operational controls (WS4).
3. Setup/runbook updates and smoke-test checklist in docs.

### Required Actions On Your Side

1. Create/confirm Gmail API OAuth access for each environment owner.
2. Verify the selected sender inbox and refresh-token flow are healthy.
3. Configure environment variables in each environment (local, staging, production):
   - `GOOGLE_GMAIL_CLIENT_ID`
   - `GOOGLE_GMAIL_CLIENT_SECRET`
   - `GOOGLE_GMAIL_REFRESH_TOKEN`
   - `GOOGLE_GMAIL_SENDER_EMAIL`
   - `RECOMMENDER_TOKEN_SALT` (strongly recommended for production)
4. Ensure the sender mailbox and reply handling policy are correct for production use.
5. Run smoke tests after deploy:
   - communication test-send,
   - stage-result/ broadcast send to test inbox,
   - recommendation invite -> OTP/session -> submission,
   - reminder re-send.
6. Define operational inbox policy (who monitors bounces/replies and response SLA).

## Delivery Order and Estimates

| Order | Workstream | Estimate | Risk |
|---|---|---|---|
| 1 | WS4 Admin Candidate Ops Reliability | 2-3 days | Medium |
| 2 | WS8 Applicant Realtime UX + duplicate controls | 1-2 days | Low |
| 3 | WS5 Export Builder payload-driven picker | 2-3 days | Medium |
| 4 | WS1 Broadcast communications | 2-3 days | Medium |
| 5 | WS3 Stage config cleanup + live labels | 1-2 days | Low |
| 6 | WS2 Prompt Studio + injection hardening | 3-4 days | Medium-High |
| 7 | WS7 Stage 1 funnel tracking | 1-2 days | Medium |
| 8 | WS6 Dev-only demo applicant | <1 day | Low |

Total estimate: ~12-19 working days, depending on QA cycles and migration complexity.

## Definition of Done

This part is done when:
- every feedback item in Scope Map is accepted by QA,
- real email/recommendation flows pass smoke tests in staging,
- bulk exports include admin-selected payload fields via checkbox configuration,
- and regression tests pass for admin/applicant core workflows.

## QA and Verification Matrix

- Unit tests: search, export path resolver, prompt guardrails, blocker derivation.
- Integration tests: communications pipeline, recommendation admin ops, export validation.
- E2E tests: applicant lifecycle + admin candidate operations + broadcast flow.
- Manual script: admin tracking walk-through (search -> open candidate -> edit data/files/recommendation -> verify logs/export).

## Notes

- Keep changes incremental and shippable per workstream.
- Prefer backward-compatible DB changes (additive migrations first, cleanup later).
- Preserve existing design system patterns in admin/applicant interfaces.
