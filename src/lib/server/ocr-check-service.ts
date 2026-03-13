import { Buffer } from "node:buffer";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors/app-error";
import { runOcrCheck } from "@/lib/server/ocr";
import { loadOcrReferenceDocuments } from "@/lib/server/ocr-reference-files";
import {
  buildSchemaTemplateFromExpectedOutputFields,
  buildStructuredOcrExtraction,
  normalizeExpectedOutputFields,
  parseExpectedOutputFieldsFromSchemaTemplate,
} from "@/lib/ocr/expected-output-schema";
import {
  fieldAiParserSchema,
  inferMimeTypeFromPath,
  normalizeFieldAiReferenceFiles,
  type ResolvedFieldAiParserConfig,
} from "@/lib/ocr/field-ai-parser";
import { resolveFilePath } from "@/lib/utils/resolve-path";
import type { Database, Json } from "@/types/supabase";

type OcrCheckRow =
  Database["public"]["Tables"]["application_ocr_checks"]["Row"];

/* -------------------------------------------------------------------------- */
/*  Parser config resolution (consolidates duplicated helpers)                 */
/* -------------------------------------------------------------------------- */

/**
 * Returns `true` when the raw `ai_parser_config` column value has
 * `{ enabled: true }`.  Used for quick checks without full parsing.
 */
export function isAiParserEnabled(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  return (value as { enabled?: unknown }).enabled === true;
}

/**
 * Parse and normalise a raw `ai_parser_config` JSON column into a fully
 * resolved config, or return `null` when the parser is not enabled.
 *
 * @param throwOnInvalid  When `true` (manual admin flow), throw an AppError
 *                        on malformed or incomplete config.  When `false`
 *                        (auto-upload flow), silently return `null`.
 */
export function resolveFieldAiParserConfig(
  value: unknown,
  { throwOnInvalid = false }: { throwOnInvalid?: boolean } = {},
): ResolvedFieldAiParserConfig | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const parsed = fieldAiParserSchema.safeParse(value);

  if (!parsed.success) {
    if (throwOnInvalid) {
      throw new AppError({
        message: "Malformed ai_parser_config in stage field",
        userMessage: "La configuración de parsing IA del campo es inválida.",
        status: 500,
        details: parsed.error.flatten(),
      });
    }
    return null;
  }

  if (!parsed.data.enabled) {
    return null;
  }

  const extractionInstructions =
    parsed.data.extractionInstructions?.trim() ?? "";
  const expectedSchemaTemplate =
    parsed.data.expectedSchemaTemplate?.trim() ?? "";
  const expectedOutputFields = normalizeExpectedOutputFields(
    parsed.data.expectedOutputFields ?? [],
  );
  const resolvedExpectedOutputFields =
    expectedOutputFields.length > 0
      ? expectedOutputFields
      : parseExpectedOutputFieldsFromSchemaTemplate(expectedSchemaTemplate);
  const resolvedExpectedSchemaTemplate =
    expectedSchemaTemplate ||
    (resolvedExpectedOutputFields.length > 0
      ? buildSchemaTemplateFromExpectedOutputFields(
          resolvedExpectedOutputFields,
        )
      : "");
  const referenceFiles = normalizeFieldAiReferenceFiles(
    parsed.data.referenceFiles,
  );

  if (!extractionInstructions || !resolvedExpectedSchemaTemplate) {
    if (throwOnInvalid) {
      throw new AppError({
        message: "Incomplete ai_parser_config in stage field",
        userMessage:
          "La configuración de parsing IA del campo está incompleta.",
        status: 500,
      });
    }
    return null;
  }

  return {
    ...parsed.data,
    extractionInstructions,
    expectedSchemaTemplate: resolvedExpectedSchemaTemplate,
    referenceFiles,
    expectedOutputFields: resolvedExpectedOutputFields,
  };
}

/* -------------------------------------------------------------------------- */
/*  OCR history                                                                */
/* -------------------------------------------------------------------------- */

export async function getOcrCheckHistory({
  supabase,
  applicationId,
  limit,
}: {
  supabase: SupabaseClient<Database>;
  applicationId: string;
  limit: number;
}): Promise<OcrCheckRow[]> {
  const { data: application } = await supabase
    .from("applications")
    .select("id")
    .eq("id", applicationId)
    .maybeSingle();

  if (!application) {
    throw new AppError({
      message: "Application not found for OCR history",
      userMessage: "No se encontró la postulación.",
      status: 404,
    });
  }

  const { data, error } = await supabase
    .from("application_ocr_checks")
    .select("*")
    .eq("application_id", applicationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new AppError({
      message: "Failed loading OCR history",
      userMessage: "No se pudo cargar el historial OCR.",
      status: 500,
      details: error,
    });
  }

  return (data as OcrCheckRow[] | null) ?? [];
}

/* -------------------------------------------------------------------------- */
/*  OCR check orchestration                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Internal helper shared by both the manual admin check and the auto-upload
 * trigger.  Downloads the file, resolves parser config, calls the Gemini OCR
 * provider, builds structured extraction, and persists the check record.
 */
async function performOcrCheck({
  supabase,
  applicationId,
  fileKey,
  filePath,
  cycleId,
  stageCode,
  actorId,
  trigger,
  failOnInjectionSignals,
  throwOnInvalidConfig,
}: {
  supabase: SupabaseClient<Database>;
  applicationId: string;
  fileKey: string;
  filePath: string;
  cycleId: string;
  stageCode: string;
  actorId: string;
  trigger: "manual_admin" | "upload_auto";
  failOnInjectionSignals: boolean;
  throwOnInvalidConfig: boolean;
}): Promise<{
  check: OcrCheckRow;
  summary: string;
  confidence: number;
  rawResponse: Record<string, unknown>;
} | null> {
  /* ---- Load field parser config ---- */
  const { data: fieldData, error: fieldError } = await supabase
    .from("cycle_stage_fields")
    .select("field_type, ai_parser_config")
    .eq("cycle_id", cycleId)
    .eq("stage_code", stageCode)
    .eq("field_key", fileKey)
    .maybeSingle();

  if (fieldError) {
    if (throwOnInvalidConfig) {
      throw new AppError({
        message: "Failed loading field parser config",
        userMessage:
          "No se pudo cargar la configuración de parsing IA del archivo.",
        status: 500,
        details: fieldError,
      });
    }
    return null;
  }

  if (!fieldData || fieldData.field_type !== "file") {
    if (throwOnInvalidConfig) {
      throw new AppError({
        message: "OCR requested for non-file field",
        userMessage: "Este campo no es de tipo archivo.",
        status: 400,
      });
    }
    return null;
  }

  const parserConfig = resolveFieldAiParserConfig(
    (fieldData as { ai_parser_config: unknown }).ai_parser_config,
    { throwOnInvalid: throwOnInvalidConfig },
  );

  if (!parserConfig) {
    if (throwOnInvalidConfig) {
      throw new AppError({
        message: "AI parser is not configured for file field",
        userMessage:
          "Este archivo no tiene parsing IA habilitado en el editor de formulario.",
        status: 400,
      });
    }
    return null;
  }

  /* ---- Validate schema template JSON (manual flow) ---- */
  if (throwOnInvalidConfig) {
    try {
      JSON.parse(parserConfig.expectedSchemaTemplate);
    } catch (error) {
      throw new AppError({
        message: "Invalid parser schema template in field config",
        userMessage:
          "El esquema JSON de parsing IA no es válido para este archivo.",
        status: 500,
        details: error instanceof Error ? error.message : error,
      });
    }
  }

  /* ---- Download file ---- */
  const { data: fileBlob, error: downloadError } = await supabase.storage
    .from("application-documents")
    .download(filePath);

  if (downloadError || !fileBlob) {
    if (throwOnInvalidConfig) {
      throw new AppError({
        message: "Could not download file for OCR",
        userMessage: "No se pudo preparar el archivo para OCR.",
        status: 500,
        details: downloadError,
      });
    }
    return null;
  }

  /* ---- Resolve prompt template ---- */
  const { data: templateData } = await supabase
    .from("cycle_stage_templates")
    .select("ocr_prompt_template")
    .eq("cycle_id", cycleId)
    .eq("stage_code", stageCode)
    .maybeSingle();

  /* ---- Run OCR ---- */
  const fileBuffer = Buffer.from(await fileBlob.arrayBuffer());

  const result = await runOcrCheck({
    document: {
      fileName: fileKey,
      mimeType: fileBlob.type || inferMimeTypeFromPath(filePath),
      dataBase64: fileBuffer.toString("base64"),
    },
    referenceDocuments: await loadOcrReferenceDocuments(
      parserConfig.referenceFiles,
    ),
    modelId: parserConfig.modelId ?? null,
    promptTemplate:
      parserConfig.promptTemplate ??
      (templateData as { ocr_prompt_template: string | null } | null)
        ?.ocr_prompt_template ??
      null,
    systemPrompt: parserConfig.systemPrompt ?? null,
    extractionInstructions: parserConfig.extractionInstructions,
    expectedSchemaTemplate: parserConfig.expectedSchemaTemplate,
    strictSchema: parserConfig.strictSchema ?? true,
    failOnInjectionSignals,
  });

  /* ---- Build structured extraction ---- */
  const parsedPayload =
    result.rawResponse &&
    typeof result.rawResponse === "object" &&
    result.rawResponse.parsed &&
    typeof result.rawResponse.parsed === "object"
      ? (result.rawResponse.parsed as Record<string, unknown>)
      : null;

  const structuredExtraction = buildStructuredOcrExtraction({
    formFieldKey: fileKey,
    parsedPayload,
    expectedOutputFields: parserConfig.expectedOutputFields,
  });

  /* ---- Persist check record ---- */
  const { data: insertedData, error: insertError } = await supabase
    .from("application_ocr_checks")
    .insert({
      application_id: applicationId,
      actor_id: actorId,
      file_key: fileKey,
      summary: result.summary,
      confidence: result.confidence,
      raw_response: {
        ...(result.rawResponse as Record<string, unknown>),
        trigger,
        expectedOutputFields: parserConfig.expectedOutputFields,
        structuredExtraction,
      } as Json,
    })
    .select("*")
    .single();

  const insertedCheck =
    (insertedData as OcrCheckRow | null) ?? null;

  if (insertError || !insertedCheck) {
    if (throwOnInvalidConfig) {
      throw new AppError({
        message: "Failed saving OCR check",
        userMessage: "No se pudo guardar el resultado OCR.",
        status: 500,
        details: insertError,
      });
    }
    return null;
  }

  return {
    check: insertedCheck,
    summary: result.summary,
    confidence: result.confidence,
    rawResponse: result.rawResponse,
  };
}

/* -------------------------------------------------------------------------- */
/*  Public API                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Run OCR check on an application file (admin-triggered, manual flow).
 * Throws on any error.
 */
export async function executeOcrCheck({
  supabase,
  applicationId,
  fileKey,
  actorId,
}: {
  supabase: SupabaseClient<Database>;
  applicationId: string;
  fileKey: string;
  actorId: string;
}): Promise<{
  check: OcrCheckRow;
  summary: string;
  confidence: number;
  rawResponse: Record<string, unknown>;
}> {
  const { data: application } = await supabase
    .from("applications")
    .select("files, cycle_id, stage_code")
    .eq("id", applicationId)
    .maybeSingle();

  if (!application) {
    throw new AppError({
      message: "Application not found",
      userMessage: "No se encontró la postulación.",
      status: 404,
    });
  }

  const files = application.files as Record<string, unknown>;
  const filePath = resolveFilePath(files[fileKey]);

  if (!filePath) {
    throw new AppError({
      message: "File missing",
      userMessage: "No existe archivo para la clave indicada.",
      status: 404,
    });
  }

  const result = await performOcrCheck({
    supabase,
    applicationId,
    fileKey,
    filePath,
    cycleId: application.cycle_id,
    stageCode: application.stage_code,
    actorId,
    trigger: "manual_admin",
    failOnInjectionSignals: true,
    throwOnInvalidConfig: true,
  });

  // performOcrCheck only returns null when throwOnInvalidConfig is false
  return result!;
}

/**
 * Auto-trigger OCR after a file upload (applicant flow).
 * Returns `true` if OCR was successfully triggered, `false` otherwise.
 * Never throws — upload must succeed even if OCR auto-processing fails.
 */
export async function autoTriggerOcrAfterUpload({
  supabase,
  applicationId,
  fileKey,
  filePath,
  cycleId,
  stageCode,
  actorId,
}: {
  supabase: SupabaseClient<Database>;
  applicationId: string;
  fileKey: string;
  filePath: string;
  cycleId: string;
  stageCode: string;
  actorId: string;
}): Promise<boolean> {
  try {
    const result = await performOcrCheck({
      supabase,
      applicationId,
      fileKey,
      filePath,
      cycleId,
      stageCode,
      actorId,
      trigger: "upload_auto",
      failOnInjectionSignals: false,
      throwOnInvalidConfig: false,
    });
    return result !== null;
  } catch {
    // Upload should succeed even if OCR auto-processing fails.
    return false;
  }
}
