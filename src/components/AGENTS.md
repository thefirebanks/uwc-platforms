# Components

## What this module does
All React UI components. Most use `"use client"` for interactive forms and
dashboards. Server components are only used in `page.tsx` files.

## Component areas

### Admin
| Component | Purpose | Size |
|-----------|---------|------|
| stage-config-editor.tsx | Stage field builder, rubric, automations | Large (monolithic) |
| admin-candidates-dashboard.tsx | Applicant search, filter, status grid | Medium |
| admin-application-viewer.tsx | Single application detail (files, OCR, rubric) | Large |
| admin-communications-center.tsx | Email campaign management | Medium |
| admin-export-builder.tsx | Export configuration UI | Medium |
| admin-ocr-testbed.tsx | OCR prompt testing interface | Medium |
| admin-processes-dashboard.tsx | Process/cycle list and management | Small |
| admin-home-dashboard.tsx | Overview of active cycles | Small |
| admin-reviewer-management.tsx | Create, edit, assign reviewers | Small |
| admin-support-dashboard.tsx | Support ticket list and replies | Small |
| admin-audit-log.tsx | Audit event history | Small |
| admin-stage-sidebar.tsx | Stage navigation sidebar | Small |
| admin-stage-form-preview.tsx | Preview form as applicant sees it | Small |

### Applicant
| Component | Purpose | Size |
|-----------|---------|------|
| applicant-application-form.tsx | Multi-section wizard form | Large (monolithic) |
| applicant-processes-dashboard.tsx | List of open selection cycles | Small |
| applicant-sidebar.tsx | Navigation sidebar with progress | Small |
| applicant-top-nav.tsx | Top nav with progress and language toggle | Small |
| applicant-action-bar.tsx | Action buttons (save, submit) | Small |
| applicant-mobile-progress.tsx | Mobile progress indicator | Small |
| applicant-support-center.tsx | Create/view support tickets | Small |
| applicant-support-form.tsx | Support ticket form | Small |
| applicant-communications-dashboard.tsx | View received communications | Small |

### Shared
| Component | Purpose |
|-----------|---------|
| recommender-form.tsx | Public recommendation form (OTP-based) |
| upload-zone.tsx | Drag-drop file upload widget |
| grades-table.tsx | Structured grades display |
| shared-form-ui.tsx | Shared form field renderers |
| error-callout.tsx | Error message display |
| field-hint.tsx | Inline help for form fields |
| stage-badge.tsx | Visual stage indicator |
| toggle-pill.tsx | Toggle button UI |
| top-nav.tsx | Global navigation bar |
| profile-settings-dialog.tsx | User profile settings modal |
| language-provider.tsx | i18n context provider |
| language-toggle.tsx | Language selector |
| app-theme-provider.tsx | MUI theme provider |
| theme-mode-toggle.tsx | Dark/light mode toggle |
| email-template-variable-guide.tsx | Help for email template variables |

## Patterns
- Client-side API calls use `fetchApi<T>()` from `src/lib/client/api-client.ts`
- State management: local useState/useEffect (no global store)
- Component tests in `tests/components/<name>.test.tsx`

## Decomposed components
- `stage-config-editor.tsx` — split into: types, utils, `StageSettingsPanel`, `StageFieldEditor`
- `applicant-application-form.tsx` — split into: `applicant-form-helpers.ts`, `ApplicantFormFields`, `ApplicantRecommendersSection`, `ApplicantDocumentUploadSection`
- `admin-application-viewer.tsx` — split into: types, `ViewerDatosTab`, `ViewerArchivosTab`, `ViewerRecomendacionesTab`, `ViewerDictamenTab`, `ViewerHistorialTab`
