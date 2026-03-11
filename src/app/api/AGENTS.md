# API Routes

## What this module does
Next.js App Router API route handlers. Thin controllers that validate input,
check auth, delegate to services, and return JSON responses.

## Pattern
Every route file follows this structure:

```typescript
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { requireAuth } from "@/lib/server/auth";

export async function POST(request: Request) {
  return withErrorHandling(async (requestId) => {
    const { profile, supabase } = await requireAuth(["admin"]);
    const body = SomeSchema.parse(await request.json());
    const result = await someService(supabase, body);
    return NextResponse.json(result);
  });
}
```

## Route groups
| Path | Purpose | Auth |
|------|---------|------|
| /api/cycles/ | Process/cycle CRUD, stage config, templates | admin |
| /api/applications/ | Application CRUD, submit, validate, transition, OCR | admin or applicant |
| /api/applications/rubric-evaluate | Run eligibility rubric | admin |
| /api/applications/bulk-transition | Bulk stage transitions | admin |
| /api/recommendations/ | Recommendation management (authenticated) | admin or applicant |
| /api/recommendations/public/[token]/ | Public recommender form (token-based) | none |
| /api/communications/ | Email queue, broadcast, preview, send | admin |
| /api/exports/ | Excel/CSV/JSON export | admin |
| /api/audit/ | Audit log listing and export | admin |
| /api/support/ | Support ticket CRUD | admin or applicant |
| /api/admin/reviewers/ | Reviewer management | admin |
| /api/reviewer/assignments/ | Reviewer's assigned applications | reviewer |
| /api/me/ | Current user profile | any authenticated |
| /api/dev/ | Dev-only endpoints (seeding, reset) | dev bypass |

## How to extend
1. Create `route.ts` in `src/app/api/<domain>/`
2. Use `withErrorHandling` + `requireAuth` + Zod validation
3. Put business logic in `src/lib/server/<domain>-service.ts`
4. Add tests in `tests/unit/<domain>-service.test.ts`

## Error responses
```json
{ "errorId": "<requestId>", "message": "<Spanish user-facing message>" }
```
