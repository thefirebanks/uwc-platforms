import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors/app-error";
import { assertApplicantCanEditCycle } from "@/lib/server/application-service";
import {
  listApplicationFilesForAdmin,
} from "@/lib/server/admin-edit-service";
import {
  isAiParserEnabled,
  autoTriggerOcrAfterUpload,
} from "@/lib/server/ocr-check-service";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/types/supabase";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

export type ApplicantFilePayload = {
  key: string;
  path: string;
  title?: string;
  originalName?: string;
  mimeType?: string;
  sizeBytes?: number;
  uploadedAt?: string;
};

export type AdminFileWithStatus = {
  key: string;
  path: string;
  title: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number | null;
  uploadedAt: string | null;
  category: string | null;
  notes: string | null;
  downloadUrl: string | null;
  aiParserEnabled: boolean;
};

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

export async function buildSignedDownloadUrl(
  path: string,
): Promise<string | null> {
  const adminSupabase = getSupabaseAdminClient();
  const { data, error } = await adminSupabase.storage
    .from("application-documents")
    .createSignedUrl(path, 60 * 60);

  if (error || !data?.signedUrl) {
    return null;
  }

  return data.signedUrl;
}

/* -------------------------------------------------------------------------- */
/*  Admin: list files with parser status + signed URLs                         */
/* -------------------------------------------------------------------------- */

export async function listAdminFilesWithParserStatus({
  supabase,
  applicationId,
}: {
  supabase: SupabaseClient<Database>;
  applicationId: string;
}): Promise<AdminFileWithStatus[]> {
  /* Fetch application context for cycle/stage lookup */
  const { data: applicationContext, error: applicationContextError } =
    await supabase
      .from("applications")
      .select("cycle_id, stage_code")
      .eq("id", applicationId)
      .maybeSingle();

  if (applicationContextError || !applicationContext) {
    throw new AppError({
      message: "Application not found while listing files",
      userMessage: "No se encontró la postulación.",
      status: 404,
      details: applicationContextError,
    });
  }

  /* List raw files via admin-edit-service */
  const files = await listApplicationFilesForAdmin({
    supabase,
    applicationId,
  });

  /* Load stage field parser configs */
  const { data: stageFieldsData, error: stageFieldsError } = await supabase
    .from("cycle_stage_fields")
    .select("field_key, ai_parser_config")
    .eq("cycle_id", applicationContext.cycle_id)
    .eq("stage_code", applicationContext.stage_code)
    .eq("field_type", "file");

  if (stageFieldsError) {
    throw new AppError({
      message: "Failed loading stage field parser config",
      userMessage: "No se pudo cargar la configuración de archivos.",
      status: 500,
      details: stageFieldsError,
    });
  }

  const parserEnabledByFileKey = new Set(
    (
      (stageFieldsData as Array<{
        field_key: string;
        ai_parser_config: unknown;
      }> | null) ?? []
    )
      .filter((row) => isAiParserEnabled(row.ai_parser_config))
      .map((row) => row.field_key),
  );

  /* Enrich with signed URLs and parser status */
  return Promise.all(
    files.map(async (file) => ({
      ...file,
      downloadUrl: await buildSignedDownloadUrl(file.path),
      aiParserEnabled: parserEnabledByFileKey.has(file.key),
    })),
  );
}

/* -------------------------------------------------------------------------- */
/*  Applicant: save file metadata + auto-trigger OCR                           */
/* -------------------------------------------------------------------------- */

export async function saveApplicantFile({
  supabase,
  applicationId,
  applicantId,
  fileData,
}: {
  supabase: SupabaseClient<Database>;
  applicationId: string;
  applicantId: string;
  fileData: ApplicantFilePayload;
}): Promise<{
  application: Database["public"]["Tables"]["applications"]["Row"];
  autoOcrTriggered: boolean;
}> {
  /* Fetch application and verify ownership */
  const { data: app } = await supabase
    .from("applications")
    .select("id, applicant_id, cycle_id, stage_code, files")
    .eq("id", applicationId)
    .maybeSingle();

  if (!app || app.applicant_id !== applicantId) {
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

  /* Build updated files JSON */
  const currentFiles = (app.files as Record<string, unknown>) ?? {};
  const currentValue = currentFiles[fileData.key];
  const previousTitle =
    typeof currentValue === "object" &&
    currentValue !== null &&
    typeof (currentValue as Record<string, unknown>).title === "string"
      ? ((currentValue as Record<string, unknown>).title as string)
      : undefined;

  const updatedFiles = {
    ...currentFiles,
    [fileData.key]: {
      path: fileData.path,
      title:
        fileData.title?.trim() ||
        previousTitle ||
        fileData.originalName ||
        fileData.path,
      original_name:
        fileData.originalName ??
        fileData.path.split("/").at(-1) ??
        fileData.path,
      mime_type: fileData.mimeType ?? "application/octet-stream",
      size_bytes: fileData.sizeBytes ?? 0,
      uploaded_at: fileData.uploadedAt ?? new Date().toISOString(),
    },
  } as Json;

  /* Persist update */
  const { data, error } = await supabase
    .from("applications")
    .update({ files: updatedFiles, updated_at: new Date().toISOString() })
    .eq("id", applicationId)
    .select("*")
    .single();

  if (error || !data) {
    throw new AppError({
      message: "Failed saving file metadata",
      userMessage: "No se pudo asociar el archivo a tu postulación.",
      status: 500,
    });
  }

  const application =
    data as Database["public"]["Tables"]["applications"]["Row"];

  /* Auto-trigger OCR if parser is configured */
  const autoOcrTriggered = await autoTriggerOcrAfterUpload({
    supabase,
    applicationId,
    fileKey: fileData.key,
    filePath: fileData.path,
    cycleId: app.cycle_id,
    stageCode: app.stage_code,
    actorId: applicantId,
  });

  return { application, autoOcrTriggered };
}
