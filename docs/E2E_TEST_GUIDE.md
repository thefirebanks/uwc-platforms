# E2E Test Guide

End-to-end tests for the UWC Peru Selection Platform use [Playwright](https://playwright.dev/) and run against the real development server with the dev bypass feature enabled.

---

## Quick Start

```bash
# Run all E2E tests
bun run test:e2e

# Run a specific spec file
bun run test:e2e tests/e2e/admin-section-crud.spec.ts

# Run with browser UI visible (headed mode)
bun run test:e2e --headed

# Run with Playwright's interactive trace viewer
bun run test:e2e --trace on
```

---

## Prerequisites

### 1. Environment Variables

E2E tests require the dev bypass feature and demo credentials. Add these to your `.env.local`:

```env
NEXT_PUBLIC_ENABLE_DEV_BYPASS=true
NEXT_PUBLIC_DEMO_ADMIN_EMAIL=admin.demo@uwcperu.org
NEXT_PUBLIC_DEMO_APPLICANT_EMAIL=applicant.demo@uwcperu.org
NEXT_PUBLIC_DEMO_PASSWORD=ChangeMe123!
```

Without `NEXT_PUBLIC_ENABLE_DEV_BYPASS=true`, all bypass-dependent tests are automatically **skipped** (not failed).

### 2. Dev Server

The Playwright config (`playwright.config.ts`) automatically starts the dev server on port 3001 when you run `bun run test:e2e`. You can also pre-start it:

```bash
bun run dev -- --port 3001
```

If a server is already running on port 3001, it will be reused (`reuseExistingServer: true`).

### 3. Demo Supabase Data

The tests assume the following demo data exists in the connected Supabase project:
- **Demo admin**: email `admin.demo@uwcperu.org` with `role = "admin"`
- **Demo applicant**: email `applicant.demo@uwcperu.org` with `role = "applicant"`
- **Demo cycle**: ID `98b2f8e4-7266-44b0-acb2-566e2fb2d50e` with at least the `documents` stage configured

---

## Test Specs

### `home.spec.ts` — Root redirect

| Test | What it verifies |
|------|-----------------|
| Unauthenticated root redirects to login | Visiting `/` without a session redirects to `/login` and shows the "Iniciar sesión" heading |

### `applicant-form.spec.ts` — Applicant form UI

| Test | What it verifies |
|------|-----------------|
| Desktop sidebar renders with progress and navigation | Sidebar (`<aside>`) is visible with progress label and ≥3 step buttons |
| Sidebar navigation switches form sections | Clicking "Datos personales" shows "Paso 2 de N"; clicking "Revisión" shows progress summary |
| Mobile progress panel visible on small viewports | At 375px, sidebar hidden; mobile step header and % shown in `<main>` |
| Action bar renders with navigation buttons | "Guardar borrador" and "Siguiente" on first section; "Anterior" appears after moving forward |
| Section eyebrow headers show step count | "Paso 1 de N" on first section, "Paso 2 de N" on second |
| Filling a field shows pending changes status | After editing an input, "Cambios pendientes" indicator appears |

### `access-control.spec.ts` — API access control

| Test | What it verifies |
|------|-----------------|
| Demo applicant cannot invoke admin APIs | Calls to `/api/audit`, `/api/communications/process`, and `/api/applications/.../validate` return 403 when authenticated as applicant |

### `admin-section-crud.spec.ts` — Admin section CRUD (reversible)

All tests in this file restore the database to its original state via `afterEach` cleanup.

| Test | What it verifies |
|------|-----------------|
| Admin can add, rename, and delete a custom section | Clicking "Añadir nueva sección" creates a section; renaming and saving persists after reload; deleting and saving removes it |
| Admin can reorder sections and restore original order | "Subir sección" swaps order in UI; "Bajar sección" restores it; saving persists |
| Admin can collapse and expand a section | Collapse/expand toggle hides/shows section content |

**Reversibility**: After each test, `cleanupTestSection()` checks for the test section by its title ("Sección E2E Test – borrar") and removes it if found. This protects the demo DB even if a test fails mid-run.

### `admin-field-crud.spec.ts` — Admin field CRUD (reversible)

All tests in this file restore the database to its original state via `afterEach` cleanup.

| Test | What it verifies |
|------|-----------------|
| Admin can add, verify, and delete a custom field | Adding a field with label + key; saves; reloads to verify; deletes; reloads to confirm gone |
| Stage config editor loads with all expected tabs | All four tabs (Editor, Ajustes, Automatizaciones, Estadísticas) and the Preview button are visible |

**Reversibility**: After each test, `cleanupTestField()` searches for the test field by its label ("Campo E2E Test – borrar") and deletes it if found.

### `applicant-application-lifecycle.spec.ts` — Full applicant lifecycle (reversible)

All tests in this file call `resetDemoApplicant()` in both `beforeEach` and `afterEach`. This hits the `/api/dev/reset-demo-applicant` endpoint (admin-only) to delete and clean the demo applicant's application data.

| Test | What it verifies |
|------|-----------------|
| Applicant can start a draft, navigate sections, and autosave | Navigates to "Datos personales", fills a field, sees "Cambios pendientes", waits for autosave "Guardado" |
| Applicant can manually save draft and see progress summary | Clicks "Guardar borrador", navigates to "Revisión", sees "Progreso por secciones" |
| Action bar shows correct navigation buttons per section | On first section: no Previous; after Next: Previous appears |
| Sidebar shows step count and progress badge | Progress label "N de M completado" and ≥3 step buttons visible |
| Mobile progress panel visible on small viewport | 375px viewport: sidebar hidden, step header and % shown in `<main>` |
| Applicant cannot access admin routes | After applicant login, navigating to `/admin` does not land on `/admin/process/...` |

---

## Reversibility Pattern

All mutating tests follow this pattern:

```
beforeEach → reset to clean state
  → test runs (may add/modify data)
afterEach → cleanup: remove any test data
```

The `afterEach` cleanup is **always** run, even when the test fails. This means:
- A failed test will still clean up after itself
- Multiple failed test runs won't accumulate stale data
- The demo database stays usable for committee members

---

## Shared Helpers (`helpers.ts`)

```typescript
loginAsAdmin(page)          // Logs in as demo admin via bypass button
loginAndOpenForm(page)      // Logs in as demo applicant and opens the first process form
clickSidebarStepByLabel(page, /pattern/)  // Clicks a sidebar step by text
resetDemoApplicant(page)    // Resets demo applicant's application (via admin API)
bypassReady                 // Boolean: true when all bypass env vars are set
```

---

## Running in CI

E2E tests are NOT run in the standard `ci.yml` workflow because they require a live Supabase connection and demo credentials. They are intended to be run:
- Locally during development
- On dedicated staging environments with the bypass enabled

To add E2E to CI for a staging environment, set the required secrets and add:

```yaml
- name: Run E2E tests
  run: bun run test:e2e
  env:
    E2E_BASE_URL: https://staging.uwcperu.org
    NEXT_PUBLIC_ENABLE_DEV_BYPASS: true
    NEXT_PUBLIC_DEMO_ADMIN_EMAIL: ${{ secrets.DEMO_ADMIN_EMAIL }}
    NEXT_PUBLIC_DEMO_APPLICANT_EMAIL: ${{ secrets.DEMO_APPLICANT_EMAIL }}
    NEXT_PUBLIC_DEMO_PASSWORD: ${{ secrets.DEMO_PASSWORD }}
```
