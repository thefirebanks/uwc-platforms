import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors/app-error";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { requireAuth } from "@/lib/server/auth";

const updateProfileSchema = z.object({
  fullName: z.string().trim().min(1).max(120),
});

export async function GET() {
  return withErrorHandling(async () => {
    const { profile } = await requireAuth();
    return NextResponse.json({
      id: profile.id,
      email: profile.email,
      role: profile.role,
      fullName: profile.full_name,
    });
  }, { operation: "me.get" });
}

export async function PATCH(request: NextRequest) {
  return withErrorHandling(async () => {
    const { profile, supabase } = await requireAuth();
    const body = await request.json().catch(() => null);
    const parsed = updateProfileSchema.safeParse(body);

    if (!parsed.success) {
      throw new AppError({
        message: "Invalid profile update payload",
        userMessage: "El nombre no es válido.",
        status: 400,
        details: parsed.error.flatten(),
      });
    }

    const { data, error } = await supabase
      .from("profiles")
      .update({
        full_name: parsed.data.fullName,
      })
      .eq("id", profile.id)
      .select("id, email, role, full_name")
      .single();

    if (error || !data) {
      throw new AppError({
        message: "Failed to update profile",
        userMessage: "No se pudo actualizar el perfil.",
        status: 500,
        details: error ?? undefined,
      });
    }

    return NextResponse.json({
      id: data.id,
      email: data.email,
      role: data.role,
      fullName: data.full_name,
    });
  }, { operation: "me.patch" });
}
