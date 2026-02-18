import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { resolveRoleFromEmail } from "@/lib/auth/role-resolution";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") ?? "/applicant";

  const supabase = await getSupabaseServerClient();

  if (code) {
    await supabase.auth.exchangeCodeForSession(code);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (!existingProfile) {
    await supabase.from("profiles").insert({
      id: user.id,
      email: user.email ?? "",
      full_name:
        (user.user_metadata.full_name as string | undefined) ??
        (user.user_metadata.name as string | undefined) ??
        "Usuario UWC",
      role: resolveRoleFromEmail({
        email: user.email,
        allowlist: process.env.ADMIN_EMAIL_ALLOWLIST ?? "",
      }),
    });
  }

  const { data: freshProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const destination = freshProfile?.role === "admin" ? "/admin" : next;

  return NextResponse.redirect(new URL(destination, request.url));
}
