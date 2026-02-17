import { AppError } from "@/lib/errors/app-error";

export function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new AppError({
      message: "Supabase env vars missing",
      userMessage:
        "Falta configuración del servidor. Contacta al administrador con este error.",
      status: 500,
    });
  }

  return { url, anonKey };
}

export function getServiceRoleKey() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new AppError({
      message: "SUPABASE_SERVICE_ROLE_KEY missing",
      userMessage: "No se pudo ejecutar esta operación administrativa.",
      status: 500,
    });
  }

  return serviceRoleKey;
}
