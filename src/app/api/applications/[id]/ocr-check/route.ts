import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { AppError } from "@/lib/errors/app-error";
import { requireAuth } from "@/lib/server/auth";
import { runOcrCheck } from "@/lib/server/ocr";
import { recordAuditEvent } from "@/lib/logging/audit";

const schema = z.object({
  fileKey: z.string().min(2),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return withErrorHandling(async (requestId) => {
    const { profile, supabase } = await requireAuth(["admin"]);
    const { id } = await context.params;
    const body = await request.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      throw new AppError({
        message: "Invalid OCR payload",
        userMessage: "No se pudo ejecutar la validación OCR.",
        status: 400,
      });
    }

    const { data: application } = await supabase
      .from("applications")
      .select("files")
      .eq("id", id)
      .maybeSingle();

    if (!application) {
      throw new AppError({
        message: "Application not found",
        userMessage: "No se encontró la postulación.",
        status: 404,
      });
    }

    const files = application.files as Record<string, string>;
    const filePath = files[parsed.data.fileKey];

    if (!filePath) {
      throw new AppError({
        message: "File missing",
        userMessage: "No existe archivo para la clave indicada.",
        status: 404,
      });
    }

    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from("application-documents")
      .createSignedUrl(filePath, 60);

    if (signedUrlError || !signedUrlData?.signedUrl) {
      throw new AppError({
        message: "Could not create signed URL for OCR",
        userMessage: "No se pudo preparar el archivo para OCR.",
        status: 500,
      });
    }

    const result = await runOcrCheck({ fileUrl: signedUrlData.signedUrl });

    await recordAuditEvent({
      supabase,
      actorId: profile.id,
      applicationId: id,
      action: "application.ocr_checked",
      metadata: result,
      requestId,
    });

    return NextResponse.json(result);
  }, { operation: "applications.ocr_check" });
}
