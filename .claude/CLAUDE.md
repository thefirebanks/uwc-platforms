# UWC Peru Selection Platform

Next.js 15 App Router platform for UWC Peru scholarship applicant selection.
Stack: TypeScript, Supabase (PostgreSQL + Auth + Storage), MUI 7, Tailwind CSS 4, Bun.

## Package Manager

**ALWAYS use `bun`. Never use `npm`, `npx`, or `yarn`.**

- Install: `bun add <pkg>` or `bun add -d <pkg>` (dev)
- Install all: `bun install`
- Run scripts: `bun run <script>`
- Run binaries: `bunx <bin>`
- Lockfile: `bun.lock` (never `package-lock.json`)

## Project Structure

```
src/app/(dashboard)/admin/    — admin UI routes
src/app/(dashboard)/applicant/ — applicant UI routes
src/app/(dashboard)/reviewer/  — reviewer UI routes
src/app/api/                   — API route handlers (thin controllers)
src/lib/server/                — server-side services (business logic)
src/lib/rubric/                — rubric schema and evaluation logic
src/lib/stages/                — stage config, templates, form schema
src/lib/auth/                  — auth utilities and role resolution
src/lib/ocr/                   — OCR schema and parser config
src/lib/errors/                — AppError + withErrorHandling wrapper
src/lib/client/                — client-side utilities (fetchApi)
src/lib/supabase/              — Supabase client constructors
src/lib/utils/                 — shared utilities (dates, labels)
src/components/                — React components (mostly "use client")
src/types/domain.ts            — core domain types and enums
src/types/supabase.ts          — hand-maintained DB types (use this, NOT supabase.gen.ts)
tests/unit/                    — Vitest unit tests
tests/components/              — Vitest component tests (@testing-library/react)
tests/e2e/                     — Playwright E2E tests
tests/integration/             — integration tests
tests/security/                — access control regression tests
```

Each `src/lib/` subdirectory has an `AGENTS.md` describing the module for AI agents.

## Quality Gates (run before every commit)

```bash
bun run lint        # ESLint
bun run typecheck   # tsc --noEmit
bun run test        # Vitest unit + component tests
bun run build       # Next.js production build
```

All four must pass before pushing. CI runs these automatically on PR + main push.

## E2E Tests

```bash
bun run test:e2e    # Playwright (Chromium, port 3001)
```

- Requires `NEXT_PUBLIC_ENABLE_DEV_BYPASS=true` in `.env.local`
- Auto-starts dev server on port 3001
- E2E tests are NOT in CI (require live Supabase) — run locally before merge
- Test helpers in `tests/e2e/helpers.ts` (login, reset, sidebar navigation)

## Git & PR Workflow

- Branch from `main`. Prefixes: `feature/`, `fix/`, `clean/`, `codex/`
- Small, logical commits. Open PRs for all work.
- CI pipeline: lint → typecheck → test → build → deploy preview
- PR deploys get a Cloudflare preview URL posted as a comment
- Always verify CI passes before considering work done
- Include verification outputs in PR description

## Supabase CLI

- Always use the UWC profile: `sbu` (alias for `supabase --profile uwc`)
- Never run bare `supabase` commands in this repo
- Project ref: `lnuugnvwjyndvxhzbuib`
- Key commands: `sbu link`, `sbu migration list`, `sbu db push`

## API Route Pattern

Every API route follows this pattern:

```typescript
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { requireAuth } from "@/lib/server/auth";

export async function POST(request: Request) {
  return withErrorHandling(async (requestId) => {
    const { profile, supabase } = await requireAuth(["admin"]);
    // Validate input with Zod
    // Delegate to src/lib/server/*-service.ts
    // Return NextResponse.json(result)
  });
}
```

- Auth: `requireAuth(["admin"])` or `requireAuth(["admin", "applicant"])`
- Errors: `throw new AppError({ message, userMessage, status })`
- Error responses: `{ errorId, message }` with Spanish user-facing messages
- Business logic lives in `src/lib/server/*-service.ts`, never in route files

## Component Pattern

- Most components use `"use client"` — this is intentional (interactive UI)
- Server components only for page-level data fetching (`page.tsx` files)
- Client-side API calls use `fetchApi<T>()` from `src/lib/client/api-client.ts`
- State management: local useState/useEffect (no global store)

## Testing Pattern

- **Unit tests**: Vitest with mocked Supabase client. One test file per service.
- **Component tests**: @testing-library/react with jsdom. Mock API responses.
- **E2E tests**: Playwright with live Supabase. Use demo bypass login.
- **Security tests**: Verify `requireAuth()` on all API routes.
- Test files mirror source: `tests/unit/<name>.test.ts`, `tests/components/<name>.test.tsx`

## Key Constraints

- Demo cycle ID: `98b2f8e4-7266-44b0-acb2-566e2fb2d50e`
- Form field keys are lowercase (`firstname`, NOT `firstName`)
- Rubric `field_matches_ocr` criterion uses `fieldKey: "firstname"`
- Dev endpoints require `NEXT_PUBLIC_ENABLE_DEV_BYPASS=true`
- OCR provider: Gemini Flash via `src/lib/server/ocr.ts`
- Email provider: Gmail API via `src/lib/server/email-provider.ts`

## Documentation

- Operational specs: `docs/` directory (see `docs/README.md` for index)
- Module guides: `AGENTS.md` files in `src/lib/` subdirectories
- Archived planning docs: `docs/archived/`
- Update relevant docs in the same PR when behavior changes
