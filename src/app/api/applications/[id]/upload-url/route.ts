import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { AppError } from "@/lib/errors/app-error";
import { requireAuth } from "@/lib/server/auth";
import { assertApplicantCanEditCycle } from "@/lib/server/application-service";

const schema = z.object({
  fileName: z.string().min(2),
  mimeType: z.string().min(3),
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
        message: "Invalid file metadata",
        userMessage: "No se pudo preparar la subida del archivo.",
        status: 400,
      });
    }

    const { data: app } = await supabase
      .from("applications")
      .select("id, applicant_id, cycle_id")
      .eq("id", id)
      .maybeSingle();

    if (!app || app.applicant_id !== profile.id) {
      throw new AppError({
        message: "Application not owned by user",
        userMessage: "No puedes subir archivos en esta postulación.",
        status: 403,
      });
    }

    await assertApplicantCanEditCycle({
      supabase,
      cycleId: app.cycle_id,
    });

    const safeName = parsed.data.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180) || "archivo";
    const objectPath = `${profile.id}/${id}/${Date.now()}-${safeName}`;
    const { data, error } = await supabase.storage
      .from("application-documents")
      .createSignedUploadUrl(objectPath);

    if (error || !data) {
      throw new AppError({
        message: "Failed generating signed upload url",
        userMessage: "No se pudo generar el enlace de subida.",
        status: 500,
        details: error,
      });
    }

    return NextResponse.json({
      path: objectPath,
      token: data.token,
      signedUrl: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/upload/sign/application-documents/${objectPath}?token=${data.token}`,
    });
  }, { operation: "applications.upload_url.create" });
}
