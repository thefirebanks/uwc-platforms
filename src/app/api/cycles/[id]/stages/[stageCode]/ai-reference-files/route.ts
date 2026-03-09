import { NextRequest, NextResponse } from "next/server";
import { AppError } from "@/lib/errors/app-error";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { OCR_REFERENCE_FILE_LIMIT } from "@/lib/ocr/field-ai-parser";
import { recordAuditEvent } from "@/lib/logging/audit";
import { requireAuth } from "@/lib/server/auth";
import { uploadStageAiReferenceFiles } from "@/lib/server/ocr-reference-files";

async function resolveStageCode({
  cycleId,
  stageIdentifier,
  supabase,
}: {
  cycleId: string;
  stageIdentifier: string;
  supabase: Awaited<ReturnType<typeof requireAuth>>["supabase"];
}) {
  const byId = await supabase
    .from("cycle_stage_templates")
    .select("stage_code")
    .eq("cycle_id", cycleId)
    .eq("id", stageIdentifier)
    .maybeSingle();

  if (byId.error) {
    throw new AppError({
      message: "Failed resolving stage template for OCR reference upload",
      userMessage: "No se pudo identificar la etapa para subir referencias.",
      status: 500,
      details: byId.error,
    });
  }

  if (byId.data?.stage_code) {
    return byId.data.stage_code;
  }

  const byCode = await supabase
    .from("cycle_stage_templates")
    .select("stage_code")
    .eq("cycle_id", cycleId)
    .eq("stage_code", stageIdentifier)
    .maybeSingle();

  if (byCode.error || !byCode.data?.stage_code) {
    throw new AppError({
      message: "Stage template not found for OCR reference upload",
      userMessage: "No se encontró la etapa para subir referencias.",
      status: 404,
      details: byCode.error,
    });
  }

  return byCode.data.stage_code;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; stageCode: string }> },
) {
  return withErrorHandling(
    async (requestId) => {
      const { profile, supabase } = await requireAuth(["admin"]);
      const { id: cycleId, stageCode: stageIdentifier } = await context.params;
      const formData = await request.formData();
      const files = formData
        .getAll("files")
        .filter(
          (entry: FormDataEntryValue): entry is File => entry instanceof File,
        );

      if (files.length === 0) {
        throw new AppError({
          message: "Missing OCR reference files",
          userMessage: "Debes seleccionar al menos un archivo de referencia.",
          status: 400,
        });
      }

      if (files.length > OCR_REFERENCE_FILE_LIMIT) {
        throw new AppError({
          message: `Too many OCR reference files: ${files.length}`,
          userMessage: `Solo puedes subir hasta ${OCR_REFERENCE_FILE_LIMIT} archivos de referencia a la vez.`,
          status: 400,
        });
      }

      const resolvedStageCode = await resolveStageCode({
        cycleId,
        stageIdentifier,
        supabase,
      });
      const referenceFiles = await uploadStageAiReferenceFiles({
        supabase,
        cycleId,
        stageKey: resolvedStageCode,
        files,
      });

      await recordAuditEvent({
        supabase,
        actorId: profile.id,
        action: "stage.ai_reference_uploaded",
        metadata: {
          cycleId,
          stageCode: resolvedStageCode,
          fileNames: referenceFiles.map(
            (referenceFile: { fileName: string }) => referenceFile.fileName,
          ),
          fileCount: referenceFiles.length,
        },
        requestId,
      });

      return NextResponse.json({ referenceFiles }, { status: 201 });
    },
    { operation: "cycles.stage.ai_reference_upload" },
  );
}
