import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { AppError } from "@/lib/errors/app-error";
import { requireAuth } from "@/lib/server/auth";
import { assertApplicantCanEditCycle } from "@/lib/server/application-service";
import type { Json } from "@/types/supabase";

const schema = z.object({
  key: z.string().min(2),
  path: z.string().min(4),
  title: z.string().min(2).max(140).optional(),
  originalName: z.string().min(1).max(300).optional(),
  mimeType: z.string().max(120).optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  uploadedAt: z.string().datetime().optional(),
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
      .select("id, applicant_id, cycle_id, files")
      .eq("id", id)
      .maybeSingle();

    if (!app || app.applicant_id !== profile.id) {
      throw new AppError({
        message: "Application not owned by user",
        userMessage: "No tienes permisos para modificar estos archivos.",
        status: 403,
      });
    }

    await assertApplicantCanEditCycle({
      supabase,
      cycleId: app.cycle_id,
    });

    const currentFiles = (app.files as Record<string, unknown>) ?? {};
    const currentValue = currentFiles[parsed.data.key];
    const previousTitle =
      typeof currentValue === "object" &&
      currentValue !== null &&
      typeof (currentValue as Record<string, unknown>).title === "string"
        ? ((currentValue as Record<string, unknown>).title as string)
        : undefined;

    const updatedFiles = {
      ...currentFiles,
      [parsed.data.key]: {
        path: parsed.data.path,
        title: parsed.data.title?.trim() || previousTitle || parsed.data.originalName || parsed.data.path,
        original_name: parsed.data.originalName ?? parsed.data.path.split("/").at(-1) ?? parsed.data.path,
        mime_type: parsed.data.mimeType ?? "application/octet-stream",
        size_bytes: parsed.data.sizeBytes ?? 0,
        uploaded_at: parsed.data.uploadedAt ?? new Date().toISOString(),
      },
    } as Json;

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
  }, { operation: "applications.files.save" });
}
