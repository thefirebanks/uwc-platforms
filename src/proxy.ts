import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/supabase";
import { getSupabaseEnv } from "@/lib/supabase/env";

export const runtime = "edge";

/**
 * Proxy: redirect users who land on a path that doesn't match their role.
 *
 * Roles → home paths:
 *   admin     → /admin
 *   reviewer  → /reviewer
 *   applicant → /applicant
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only guard dashboard paths
  const isDashboard =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/reviewer") ||
    pathname.startsWith("/applicant");

  if (!isDashboard) {
    return NextResponse.next();
  }

  // Build a Supabase client that works in middleware (edge-compatible cookie handling)
  const response = NextResponse.next();
  const { url, anonKey } = getSupabaseEnv();

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Let the page-level session guard handle the redirect to /login
    return response;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = profile?.role as "admin" | "applicant" | "reviewer" | undefined;
  if (!role) return response;

  const homeByRole = { admin: "/admin", reviewer: "/reviewer", applicant: "/applicant" } as const;
  const home = homeByRole[role];

  // Reviewer trying to access /admin or /applicant → redirect to /reviewer
  // Admin trying to access /reviewer or /applicant → redirect to /admin
  // Applicant trying to access /admin or /reviewer → redirect to /applicant
  if (!pathname.startsWith(home)) {
    return NextResponse.redirect(new URL(home, request.url));
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/reviewer/:path*", "/applicant/:path*"],
};
