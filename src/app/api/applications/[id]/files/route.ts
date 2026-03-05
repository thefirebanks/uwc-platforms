import { NextRequest, NextResponse } from "next/server";
import { Buffer } from "node:buffer";
import { z } from "zod";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { AppError } from "@/lib/errors/app-error";
import { requireAuth } from "@/lib/server/auth";
import { assertApplicantCanEditCycle } from "@/lib/server/application-service";
import {
  listApplicationFilesForAdmin,
  updateApplicationFileMetadata,
} from "@/lib/server/admin-edit-service";
import { runOcrCheck } from "@/lib/server/ocr";
import {
  buildSchemaTemplateFromExpectedOutputFields,
  buildStructuredOcrExtraction,
  normalizeExpectedOutputFields,
  parseExpectedOutputFieldsFromSchemaTemplate,
} from "@/lib/ocr/expected-output-schema";
import { recordAuditEvent } from "@/lib/logging/audit";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/supabase";

const applicantSchema = z.object({
  key: z.string().min(2),
  path: z.string().min(4),
  title: z.string().min(2).max(140).optional(),
  originalName: z.string().min(1).max(300).optional(),
  mimeType: z.string().max(120).optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  uploadedAt: z.string().datetime().optional(),
});

const adminSchema = z.object({
  fileKey: z.string().min(2),
  title: z.string().min(2).max(140).optional(),
  category: z.string().max(120).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  reason: z.string().min(4).max(300),
});

const fieldAiParserSchema = z
  .object({
    enabled: z.boolean().optional().default(false),
    modelId: z.string().trim().min(1).max(120).nullable().optional(),
    promptTemplate: z.string().trim().max(5000).nullable().optional(),
    systemPrompt: z.string().trim().max(2000).nullable().optional(),
    extractionInstructions: z.string().trim().max(6000).nullable().optional(),
    expectedSchemaTemplate: z.string().trim().max(8000).nullable().optional(),
    expectedOutputFields: z
      .array(
        z.object({
          key: z.string().trim().min(1).max(120),
          type: z.enum(["text", "number", "decimal", "date", "boolean"]),
        }),
      )
      .max(40)
      .optional(),
    strictSchema: z.boolean().optional().default(true),
  })
  .strict();

type ResolvedFieldAiParserConfig = z.infer<typeof fieldAiParserSchema> & {
  extractionInstructions: string;
  expectedSchemaTemplate: string;
  expectedOutputFields: Array<{ key: string; type: "text" | "number" | "decimal" | "date" | "boolean" }>;
};

function isAiParserEnabled(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return (value as { enabled?: unknown }).enabled === true;
}

function parseFieldAiParserConfigOrNull(value: unknown): ResolvedFieldAiParserConfig | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const parsed = fieldAiParserSchema.safeParse(value);
  if (!parsed.success || !parsed.data.enabled) {
    return null;
  }

  const extractionInstructions = parsed.data.extractionInstructions?.trim() ?? "";
  const expectedSchemaTemplate = parsed.data.expectedSchemaTemplate?.trim() ?? "";
  const expectedOutputFields = normalizeExpectedOutputFields(parsed.data.expectedOutputFields ?? []);
  const resolvedExpectedOutputFields =
    expectedOutputFields.length > 0
      ? expectedOutputFields
      : parseExpectedOutputFieldsFromSchemaTemplate(expectedSchemaTemplate);
  const resolvedExpectedSchemaTemplate =
    expectedSchemaTemplate ||
    (resolvedExpectedOutputFields.length > 0
      ? buildSchemaTemplateFromExpectedOutputFields(resolvedExpectedOutputFields)
      : "");

  if (!extractionInstructions || !resolvedExpectedSchemaTemplate) {
    return null;
  }

  return {
    ...parsed.data,
    extractionInstructions,
    expectedSchemaTemplate: resolvedExpectedSchemaTemplate,
    expectedOutputFields: resolvedExpectedOutputFields,
  };
}

function inferMimeTypeFromPath(path: string) {
  const normalized = path.toLowerCase();
  if (normalized.endsWith(".pdf")) return "application/pdf";
  if (normalized.endsWith(".png")) return "image/png";
  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) return "image/jpeg";
  if (normalized.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

async function buildSignedDownloadUrl(path: string) {
  const adminSupabase = getSupabaseAdminClient();
  const { data, error } = await adminSupabase.storage
    .from("application-documents")
    .createSignedUrl(path, 60 * 60);

  if (error || !data?.signedUrl) {
    return null;
  }

  return data.signedUrl;
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return withErrorHandling(async () => {
    const { supabase } = await requireAuth(["admin"]);
    const { id } = await context.params;

    const { data: applicationContext, error: applicationContextError } = await supabase
      .from("applications")
      .select("cycle_id, stage_code")
      .eq("id", id)
      .maybeSingle();

    if (applicationContextError || !applicationContext) {
      throw new AppError({
        message: "Application not found while listing files",
        userMessage: "No se encontró la postulación.",
        status: 404,
        details: applicationContextError,
      });
    }

    const files = await listApplicationFilesForAdmin({
      supabase,
      applicationId: id,
    });

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
      ((stageFieldsData as Array<{ field_key: string; ai_parser_config: unknown }> | null) ?? [])
        .filter((row) => isAiParserEnabled(row.ai_parser_config))
        .map((row) => row.field_key),
    );

    const filesWithUrls = await Promise.all(
      files.map(async (file) => ({
        ...file,
        downloadUrl: await buildSignedDownloadUrl(file.path),
        aiParserEnabled: parserEnabledByFileKey.has(file.key),
      })),
    );

    return NextResponse.json({
      files: filesWithUrls,
    });
  }, { operation: "applications.files.list_admin" });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return withErrorHandling(async () => {
    const { profile, supabase } = await requireAuth(["applicant"]);
    const { id } = await context.params;
    const body = await request.json();
    const parsed = applicantSchema.safeParse(body);

    if (!parsed.success) {
      throw new AppError({
        message: "Invalid file payload",
        userMessage: "No se pudo guardar el archivo en tu postulación.",
        status: 400,
      });
    }

    const { data: app } = await supabase
      .from("applications")
      .select("id, applicant_id, cycle_id, stage_code, files")
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

    let autoOcrTriggered = false;

    try {
      const { data: fieldData, error: fieldError } = await supabase
        .from("cycle_stage_fields")
        .select("field_type, ai_parser_config")
        .eq("cycle_id", app.cycle_id)
        .eq("stage_code", app.stage_code)
        .eq("field_key", parsed.data.key)
        .maybeSingle();

      if (!fieldError && fieldData?.field_type === "file") {
        const parserConfig = parseFieldAiParserConfigOrNull(
          (fieldData as { ai_parser_config: unknown }).ai_parser_config,
        );

        if (parserConfig) {
          const { data: fileBlob, error: downloadError } = await supabase.storage
            .from("application-documents")
            .download(parsed.data.path);

          if (!downloadError && fileBlob) {
            const fileBuffer = Buffer.from(await fileBlob.arrayBuffer());
            const { data: templateData } = await supabase
              .from("cycle_stage_templates")
              .select("ocr_prompt_template")
              .eq("cycle_id", app.cycle_id)
              .eq("stage_code", app.stage_code)
              .maybeSingle();

            const result = await runOcrCheck({
              document: {
                fileName: parsed.data.key,
                mimeType: fileBlob.type || inferMimeTypeFromPath(parsed.data.path),
                dataBase64: fileBuffer.toString("base64"),
              },
              modelId: parserConfig.modelId ?? null,
              promptTemplate:
                parserConfig.promptTemplate ??
                (templateData as { ocr_prompt_template: string | null } | null)?.ocr_prompt_template ??
                null,
              systemPrompt: parserConfig.systemPrompt ?? null,
              extractionInstructions: parserConfig.extractionInstructions,
              expectedSchemaTemplate: parserConfig.expectedSchemaTemplate,
              strictSchema: parserConfig.strictSchema ?? true,
              failOnInjectionSignals: false,
            });

            const parsedPayload =
              result.rawResponse &&
              typeof result.rawResponse === "object" &&
              result.rawResponse.parsed &&
              typeof result.rawResponse.parsed === "object"
                ? (result.rawResponse.parsed as Record<string, unknown>)
                : null;
            const structuredExtraction = buildStructuredOcrExtraction({
              formFieldKey: parsed.data.key,
              parsedPayload,
              expectedOutputFields: parserConfig.expectedOutputFields,
            });

            await supabase.from("application_ocr_checks").insert({
              application_id: id,
              actor_id: profile.id,
              file_key: parsed.data.key,
              summary: result.summary,
              confidence: result.confidence,
              raw_response: {
                ...(result.rawResponse as Record<string, unknown>),
                trigger: "upload_auto",
                expectedOutputFields: parserConfig.expectedOutputFields,
                structuredExtraction,
              } as Json,
            });
            autoOcrTriggered = true;
          }
        }
      }
    } catch {
      // Upload should succeed even if OCR auto-processing fails.
    }

    return NextResponse.json({ application: data, autoOcrTriggered });
  }, { operation: "applications.files.save" });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return withErrorHandling(async (requestId) => {
    const { profile, supabase } = await requireAuth(["admin"]);
    const { id } = await context.params;
    const body = await request.json();
    const parsed = adminSchema.safeParse(body);

    if (!parsed.success) {
      throw new AppError({
        message: "Invalid admin file metadata payload",
        userMessage: "No se pudo actualizar la metadata del archivo.",
        status: 400,
        details: parsed.error.flatten(),
      });
    }

    const application = await updateApplicationFileMetadata({
      supabase,
      applicationId: id,
      fileKey: parsed.data.fileKey,
      updates: {
        title: parsed.data.title,
        category: parsed.data.category,
        notes: parsed.data.notes,
      },
      reason: parsed.data.reason,
      actorId: profile.id,
    });

    await recordAuditEvent({
      supabase,
      actorId: profile.id,
      applicationId: id,
      action: "application.file_metadata_updated",
      metadata: {
        fileKey: parsed.data.fileKey,
        reason: parsed.data.reason,
      },
      requestId,
    });

    return NextResponse.json({ application });
  }, { operation: "applications.files.update_admin" });
}
