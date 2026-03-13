import { NextRequest, NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { AppError } from "@/lib/errors/app-error";
import { requireAuth } from "@/lib/server/auth";
import { adminUploadFileForApplication } from "@/lib/server/admin-edit-service";
import { recordAuditEvent } from "@/lib/logging/audit";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return withErrorHandling(
    async (requestId) => {
      const { profile, supabase } = await requireAuth(["admin"]);
      const { id: applicationId } = await context.params;

      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      const fileKey = formData.get("fileKey") as string | null;
      const reason = formData.get("reason") as string | null;

      if (!file || !fileKey || !reason) {
        throw new AppError({
          message: "Missing required fields for admin upload",
          userMessage: "Faltan campos requeridos: archivo, clave y motivo.",
          status: 400,
          details: {
            file: !file ? "missing" : "ok",
            fileKey: !fileKey ? "missing" : "ok",
            reason: !reason ? "missing" : "ok",
          },
        });
      }

      if (reason.length < 4) {
        throw new AppError({
          message: "Reason too short",
          userMessage: "El motivo debe tener al menos 4 caracteres.",
          status: 400,
        });
      }

      /* ---- Upload file to Supabase storage ---- */
      const sanitizedName = file.name
        .replace(/[^a-zA-Z0-9._-]/g, "_")
        .slice(0, 180);
      const storagePath = `${applicationId}/${fileKey}/${sanitizedName}`;
      const fileBuffer = await file.arrayBuffer();

      const { error: uploadError } = await supabase.storage
        .from("application-documents")
        .upload(storagePath, fileBuffer, {
          contentType: file.type,
          upsert: true,
        });

      if (uploadError) {
        throw new AppError({
          message: "Storage upload failed",
          userMessage: "No se pudo subir el archivo al almacenamiento.",
          status: 500,
          details: uploadError,
        });
      }

      /* ---- Update application record ---- */
      const application = await adminUploadFileForApplication({
        supabase,
        applicationId,
        fileKey,
        filePath: storagePath,
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        reason,
        actorId: profile.id,
      });

      await recordAuditEvent({
        supabase,
        actorId: profile.id,
        applicationId,
        action: "application.admin_file_uploaded",
        metadata: {
          fileKey,
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          reason,
        },
        requestId,
      });

      return NextResponse.json({ application });
    },
    { operation: "applications.admin-upload" },
  );
}
