import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors/app-error";
import { getSupabaseAdminEnv } from "@/lib/supabase/env";

describe("getSupabaseAdminEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("throws a user-safe configuration error when the admin key is missing", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "");

    expect(() => getSupabaseAdminEnv()).toThrowError(AppError);

    try {
      getSupabaseAdminEnv();
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).userMessage).toBe(
        "Falta configuración del servidor. Contacta al administrador con este error.",
      );
    }
  });
});
