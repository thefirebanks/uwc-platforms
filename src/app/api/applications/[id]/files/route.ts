import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { AppError } from "@/lib/errors/app-error";
import { requireAuth } from "@/lib/server/auth";

const schema = z.object({
  key: z.string().min(2),
  path: z.string().min(4),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return withErrorHandling(async () => {
    const { profile, supabase } = await requireAuth(["applicant"]);
    const { id } = await context.params;
    const body = await request.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      throw new AppError({
        message: "Invalid file payload",
        userMessage: "No se pudo guardar el archivo en tu postulación.",
        status: 400,
      });
    }

    const { data: app } = await supabase
      .from("applications")
      .select("id, applicant_id, files")
      .eq("id", id)
      .maybeSingle();

    if (!app || app.applicant_id !== profile.id) {
      throw new AppError({
        message: "Application not owned by user",
        userMessage: "No tienes permisos para modificar estos archivos.",
        status: 403,
      });
    }

    const updatedFiles = {
      ...(app.files as Record<string, string>),
      [parsed.data.key]: parsed.data.path,
    };

    const { data, error } = await supabase
      .from("applications")
      .update({ files: updatedFiles, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();

    if (error || !data) {
      throw new AppError({
        message: "Failed saving file metadata",
        userMessage: "No se pudo asociar el archivo a tu postulación.",
        status: 500,
      });
    }

    return NextResponse.json({ application: data });
  });
}
