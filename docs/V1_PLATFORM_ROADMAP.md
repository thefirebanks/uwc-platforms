# V1 Platform Roadmap

> UWC Peru Selection Platform — from form builder to full admissions workflow.
> Created: 2026-03-01

---

## Where We Are

The form builder foundation is solid: DB-driven sections/fields, admin CRUD with drag-and-drop, a polished applicant wizard with auto-save, a full recommendation flow (OTP + session + Gmail API), email queue with automation triggers, basic stage transitions, CSV/JSON/Excel exports, and an OCR testbed. 38 test files with 206 tests.

**Phases complete: 1 ✅ 2 ✅ 3 ✅ 4 ✅ | All V1 phases complete.**

## What's Missing for V1

| Capability | Current State | V1 Target |
|---|---|---|
| Admin edits applicant data | View-only | Full edit + file upload on behalf of applicant |
| Applicant search | Client-side filter (loads all into memory) | Backend full-text search with pagination |
| Stage progression | Manual 1-by-1 transitions, hardcoded 2-stage rules | Bulk transitions, DB-driven rules, auto-reject |
| Email testing | No preview or test-send | Preview with sample data, test-send-to-self |
| In-app support | Nothing (applicants email separately) | Support tickets from within the app |
| Applicant comms dashboard | Email-only notifications | In-app message center |
| Applicant multi-stage UX | Status badge only | Congrats banner + new stage form + progress |
| Applicant dashboard | Multi-process list | Single-process focus |
| OCR testbed | No testing mode | Upload test doc, try prompt, see results |
| Excel exports | CSV only | Excel + custom column picker |
| Reviewer role | Not implemented | Architecture-ready (Phase 4) |

---

## Phase 1 — Admin Candidate Management

**Priority**: Highest. Unblocks the core admin daily workflow.
**Estimated**: 2-3 weeks.

### What We're Building

1. **Backend search API** with Postgres full-text search (`tsvector` + GIN index, `spanish` dictionary for accent/stem handling). Paginated results, sortable by date or name.

2. **Admin application viewer/editor** — a slide-out drawer (not a page navigation) showing the full application: form data (editable), files (viewable + admin upload), recommendations, OCR history, audit trail. Admins must provide a reason for every edit.

3. **Bulk stage transitions** — select eligible applicants, move them all to the next stage in one click. DB-driven transition rules (derived from `cycle_stage_templates.sort_order` — adding new stages requires zero code changes).

4. **Admin edit audit trail** — field-level logging of every change: who changed what, from what, to what, and why.

### New Database Objects

**`admin_edit_log` table** — tracks field-level changes with old/new values and reason.

**Indexes**: `tsvector` GIN index on `profiles(full_name, email)`, composite indexes on `applications(cycle_id, status)` and `applications(cycle_id, stage_code, status)`.

### New Files

| File | Purpose |
|------|---------|
| `src/lib/server/search-service.ts` | Backend search + pagination |
| `src/lib/server/admin-edit-service.ts` | Admin edits with audit trail |
| `src/app/api/applications/search/route.ts` | GET — paginated search |
| `src/app/api/applications/[id]/admin-edit/route.ts` | PATCH — edit application payload |
| `src/app/api/applications/[id]/admin-upload/route.ts` | POST — upload file for applicant |
| `src/app/api/applications/bulk-transition/route.ts` | POST — bulk stage transition |
| `src/components/admin-application-viewer.tsx` | Full application viewer/editor drawer |

### Modified Files

| File | Changes |
|------|---------|
| `src/components/admin-candidates-dashboard.tsx` | Rewrite: API-driven search, pagination, bulk selection, drawer viewer |
| `src/app/(dashboard)/admin/candidates/page.tsx` | Simplify: only fetch cycle options, remove full data load |
| `src/lib/server/application-service.ts` | Add `bulkTransitionApplications()` |
| `src/lib/stages/transition.ts` | DB-driven `deriveTransitionRules()` + `canTransitionWithRules()` |

### Key Decisions

- **Postgres tsvector over external search**: Dataset is small enough (~10k profiles max). Sub-10ms queries, zero operational overhead, Spanish dictionary built-in.
- **Admin edits logged separately from audit events**: `audit_events` = coarse actions. `admin_edit_log` = field-level diffs with reasons. Different query patterns, different audiences.
- **Bulk transitions iterate per-app, not batch SQL**: Each application needs individual `canTransition` validation. Slower but correct.
- **Viewer is a drawer, not a page**: Preserves admin's position in the candidate list. Quick navigation between applicants.

---

## Phase 2 — Communications, Support & Applicant Dashboard

**Priority**: High. Bridges the gap between email-only comms and in-app experience.
**Estimated**: ~2 weeks. Depends on Phase 1 (admin viewer provides context for support tickets).

### What We're Building

1. **Support tickets** — applicant submits a question from within the app → ticket created → email notification to admin with full applicant context → admin replies → applicant sees reply in-app + gets email.

2. **Email preview & test-send** — admins preview rendered emails with sample data before sending. "Send test to myself" button.

3. **Applicant communications dashboard** — in-app timeline of: mass emails received, stage updates, support ticket history. Uses `is_applicant_visible` flag on existing `communication_logs`.

4. **Applicant dashboard redesign** — single-process focus. If 1 active process, show it as the main view. Comms panel + support "Ayuda" button prominent. Old processes in a dropdown.

5. **Multi-stage applicant UX** — when advanced to a new stage:
   - Congratulations banner on dashboard
   - Stage result notification in comms panel
   - New stage's form/wizard loads automatically
   - Stage indicator updates ("Etapa 2 — En Progreso")

### New Database Objects

**`support_tickets` table** — `id, application_id, applicant_id, subject, body, status (open|replied|closed), admin_reply, replied_by, replied_at`. RLS: applicant sees own, admin sees all, only admin can update.

**`communication_logs.is_applicant_visible`** — boolean flag. When true, applicants can see the communication in their dashboard. Set automatically for stage result notifications.

### New Files

| File | Purpose |
|------|---------|
| `src/lib/server/support-service.ts` | Ticket CRUD + email notifications |
| `src/app/api/support/route.ts` | GET/POST — list/create tickets |
| `src/app/api/support/[id]/reply/route.ts` | POST — admin replies |
| `src/app/api/communications/preview/route.ts` | POST — render email preview |
| `src/app/api/communications/test-send/route.ts` | POST — test email to self |
| `src/app/api/applicant/communications/route.ts` | GET — applicant's visible comms |
| `src/components/applicant-support-form.tsx` | Floating "Ayuda" button + dialog |
| `src/components/applicant-communications-dashboard.tsx` | Comms timeline |
| `src/components/admin-support-dashboard.tsx` | Admin ticket management |

### Modified Files

| File | Changes |
|------|---------|
| `src/lib/server/communications-service.ts` | Add `previewEmail()`, `sendTestEmail()` |
| `src/lib/server/automation-service.ts` | Set `is_applicant_visible = true` for stage result emails |
| `src/components/admin-dashboard.tsx` | Email preview panel, "Send test to myself" button |
| `src/app/(dashboard)/applicant/page.tsx` | Redesign to single-process focus + comms panel |
| `src/components/applicant-application-form.tsx` | Multi-stage form loading (read `stage_code`, load correct fields) |

### Key Decisions

- **Simple tickets, not a chat system**: Submit question → admin replies → close. Matches the actual workflow. If real-time is needed later, add Supabase Realtime.
- **Reuse `communication_logs` for applicant visibility**: `is_applicant_visible` flag avoids data duplication. All communication history in one table.
- **Single-process dashboard**: Applicants rarely have >1 active process. Optimize for the common case; tuck old processes away.
- **Max 3 open tickets**: Prevents abuse, keeps support manageable.

---

## Phase 3 — Advanced Admin Tools ✅ COMPLETE

**Completed**: 2026-03-01

### What We're Building

1. **OCR testbed** — admin uploads a test document, selects model and prompt, runs OCR, sees results (summary, confidence, raw JSON, duration). Results stored in separate `ocr_test_runs` table (doesn't affect real application data).

2. **Excel exports** — via `exceljs` library, server-side. Custom column picker: admin selects which fields to include, previews 5 rows, downloads `.xlsx`.

3. **Model registry** — configurable in code (`ocr.ts`). Model ID → API URL mapping. Per-cycle model selection stored in `cycle_stage_templates`.

### New Database Objects

**`ocr_test_runs` table** — `cycle_id, stage_code, actor_id, file_name, file_path, prompt_template, model_id, summary, confidence, raw_response, duration_ms`. Admin-only RLS.

### New Files

| File | Purpose |
|------|---------|
| `src/lib/server/ocr-testbed-service.ts` | Run isolated OCR tests, list history |
| `src/app/api/ocr-testbed/route.ts` | POST — run test / GET — list history |
| `src/components/admin-ocr-testbed.tsx` | Upload zone, prompt editor, model picker, results panel |
| `src/components/admin-export-builder.tsx` | Column picker, format selector, preview, download |

### Modified Files

| File | Changes |
|------|---------|
| `src/lib/server/ocr.ts` | Model registry, accept `modelId` param, remove hardcoded URL |
| `src/lib/server/exports-service.ts` | Add Excel via `exceljs`, custom column selection |
| `src/app/api/exports/route.ts` | Add `format=xlsx` and `columns=...` params |

### Key Decisions

- **Separate `ocr_test_runs` table**: Test runs have different semantics (no application_id, includes prompt used, tracks duration). Don't pollute real OCR data.
- **Model registry in code, not DB**: Each model may need different API endpoints and request formats. Adding a model is a deliberate code change.
- **Excel generated server-side**: Avoids shipping a large Excel library to the browser. API returns binary `.xlsx` with proper content-disposition.
- **Test files in separate storage path**: `ocr-testbed/` prefix, auto-cleaned after 30 days.

---

## Phase 4 — Reviewer Architecture Prep ✅ COMPLETE

**Completed**: 2026-03-01

### What We're Building

1. **Permission matrix** — flat `role_permissions` table mapping roles → capabilities. `scope` column: `global` (admin sees everything) vs `assigned` (reviewer sees only assigned apps).

2. **Reviewer data model** — `reviewer_assignments` table linking reviewers to specific applications. `AppRole` expanded to include `"reviewer"`.

3. **Reviewer dashboard** — simplified admin view showing only assigned applications. View + validate + OCR.

4. **Admin reviewer management** — invite reviewers by email, assign/unassign applications.

### New Database Objects

**`role_permissions` table** — `role, permission, scope`. Seeded with defaults for admin/applicant/reviewer.

**`reviewer_assignments` table** — `reviewer_id, application_id, cycle_id, stage_code, assigned_by, assigned_at`. RLS: reviewer sees own, admin sees all.

**Modified `profiles` constraint** — `role IN ('admin', 'applicant', 'reviewer')`.

**Updated RLS on `applications`** — third branch for reviewer scope via `EXISTS reviewer_assignments`.

### New Files

| File | Purpose |
|------|---------|
| `src/lib/server/permissions-service.ts` | `hasPermission()`, `requirePermission()` |
| `src/lib/server/reviewer-service.ts` | Assignment CRUD |
| `src/app/(dashboard)/reviewer/page.tsx` | Reviewer dashboard |
| `src/components/admin-reviewer-management.tsx` | Invite + assign UI |
| `src/app/api/reviewer/assignments/route.ts` | GET — reviewer's assignments |
| `src/app/api/admin/reviewers/route.ts` | GET/POST — manage reviewers |
| `src/app/api/admin/reviewers/[id]/route.ts` | DELETE — demote reviewer |
| `src/app/api/admin/reviewers/[id]/assign/route.ts` | POST/DELETE — assign/unassign reviewer to application |
| `src/app/(dashboard)/admin/reviewers/page.tsx` | Admin reviewer management page |
| `src/middleware.ts` | Role-based redirect guard (reviewer → /reviewer, etc.) |

### Modified Files

| File | Changes |
|------|---------|
| `src/types/domain.ts` | `AppRole = "admin" \| "applicant" \| "reviewer"` |
| `src/lib/auth/role-resolution.ts` | Handle reviewer (DB-assigned, not env var) |
| `src/app/(dashboard)/layout.tsx` | Route reviewer role to reviewer dashboard |

### Key Decisions

- **Flat permissions, not RBAC hierarchy**: 3 roles don't need hierarchies. Simple is correct.
- **Reviewer is DB-assigned**: Unlike admins (env var), reviewers are assigned by admins through the UI. Dynamic.
- **Gradual migration**: Existing `requireAuth(["admin"])` calls keep working. New routes use `requirePermission()`. Migration happens over time.
- **Phase 4 is infrastructure-only**: The full reviewer workflow (rich review UI, rubrics, scoring) is post-V1.

---

## Implementation Sequence

```
Phase 1 ──────────────────────────► Ship (admin workflow)
          Phase 2 ────────────────► Ship (comms + applicant UX)
                    Phase 3 ──────► Ship (advanced tools)
                              Phase 4 ──────────► Ship (reviewer prep)
```

Each phase is independently shippable. Phase 2 depends on Phase 1 (admin viewer context). Phase 3 depends on Phase 2 (email preview endpoint). Phase 4 is additive with no breaking changes.

---

## What We're NOT Building for V1

- Full chat/messaging system (tickets are sufficient)
- External search engine (Postgres tsvector is sufficient)
- Real-time notifications (email bridges the gap)
- Full reviewer workflow with rubrics/scoring (Phase 4 is infrastructure only)
- Internationalization framework (hardcoded strings are acceptable for now)
- Mobile app or PWA
