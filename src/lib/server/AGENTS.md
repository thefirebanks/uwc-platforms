# Server Services

## What this module does
Business logic layer for all API routes. Each service file owns DB queries
and domain logic for one capability area. Services never import from
components or route files.

## Key files
| File | Purpose |
|------|---------|
| application-service.ts | Application CRUD, draft save, submit, file listing |
| eligibility-rubric-service.ts | Run rubric criteria against applications, determine outcomes |
| recommendations-service.ts | Invite recommenders, OTP, draft/submit, reminders |
| communications-service.ts | Email queue, broadcast campaigns, delivery lifecycle |
| exports-service.ts | Excel/CSV/JSON export with filters and styling |
| ocr.ts | Gemini OCR provider — parse documents, extract fields |
| ocr-testbed-service.ts | OCR prompt studio / testing without persisting |
| ocr-reference-files.ts | Upload/manage reference files for OCR prompts |
| automation-service.ts | Stage automation triggers + email queue |
| admin-edit-service.ts | Admin edits to applicant payloads |
| email-provider.ts | Gmail API wrapper (send emails) |
| search-service.ts | Full-text search with pagination |
| stage-config-persistence.ts | Save/load stage field and section config |
| stage1-funnel-service.ts | Stage 1 analytics funnel (submissions → outcomes) |
| reviewer-service.ts | Reviewer assignment and dashboard data |
| permissions-service.ts | Role-based permission checks |
| support-service.ts | Support ticket CRUD and email integration |
| audit-service.ts | Audit event queries |
| auth.ts | requireAuth() guard — validates session + role |
| session.ts | Session helpers |

## Public API pattern
Every service exports named functions that accept `{ supabase, ...params }`
or use `getSupabaseServerClient()` internally. Return typed results.

```typescript
export async function doSomething(supabase: SupabaseClient, params: Params): Promise<Result> { ... }
```

## How to extend
1. Create `<domain>-service.ts` in this directory
2. Export functions following the `(supabase, params) → result` pattern
3. Wire up from the corresponding API route in `src/app/api/`
4. Add unit tests in `tests/unit/<domain>-service.test.ts`

## Known gap
Cycle operations are still inline in `src/app/api/cycles/route.ts`.
Should be extracted to `cycles-service.ts`.
