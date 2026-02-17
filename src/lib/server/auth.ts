import type { AppRole } from "@/types/domain";
import { AppError } from "@/lib/errors/app-error";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

export async function requireAuth(allowedRoles?: AppRole[]) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new AppError({
      message: "Unauthorized",
      userMessage: "Tu sesión expiró. Inicia sesión nuevamente.",
      status: 401,
    });
  }

  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("id, email, full_name, role")
    .eq("id", user.id)
    .single();

  const profile = (profileData as ProfileRow | null) ?? null;

  if (profileError || !profile) {
    throw new AppError({
      message: "Profile not found",
      userMessage:
        "No encontramos tu perfil en el sistema. Contacta a un administrador.",
      status: 403,
      details: profileError,
    });
  }

  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    throw new AppError({
      message: "Forbidden",
      userMessage: "No tienes permisos para realizar esta acción.",
      status: 403,
    });
  }

  return { user, profile, supabase };
}
