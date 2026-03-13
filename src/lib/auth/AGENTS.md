# Auth System

## What this module does
Role resolution, session management, and access control for Supabase
Google OAuth authentication.

## Key files
| File | Purpose |
|------|---------|
| role-resolution.ts | Determines admin vs applicant from ADMIN_EMAIL_ALLOWLIST |
| ../server/auth.ts | `requireAuth()` guard used by all API routes |
| ../server/session.ts | Session helpers |
| ../supabase/server.ts | Server-side Supabase client constructor |
| ../supabase/browser.ts | Browser-side Supabase client constructor |
| ../supabase/admin.ts | Admin/service-role Supabase client |
| ../supabase/env.ts | Environment variable loading for Supabase config |

## Auth flow
1. User clicks Google login → Supabase OAuth redirect
2. Callback at `src/app/auth/callback/route.ts` exchanges code for session
3. Profile auto-created if new user (via Supabase trigger)
4. Role assigned: email in ADMIN_EMAIL_ALLOWLIST → admin, otherwise → applicant
5. Proxy (`src/proxy.ts`) redirects users to role-appropriate dashboard
6. Every API call validates session via `requireAuth(["admin"])` etc.

## Roles
- `admin` — full access to all routes and data
- `applicant` — access to own application data only
- `reviewer` — access to assigned applications only

## How to extend
- **New role**: update `role-resolution.ts`, add to `requireAuth()` role arrays,
  add RLS policies in Supabase, add proxy redirect in `src/proxy.ts`
- **New permission**: update `src/lib/server/permissions-service.ts`
