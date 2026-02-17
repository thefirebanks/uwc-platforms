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
