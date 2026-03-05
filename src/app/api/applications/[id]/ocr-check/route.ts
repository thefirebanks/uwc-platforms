import { NextRequest, NextResponse } from "next/server";
import { Buffer } from "node:buffer";
import { z } from "zod";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { AppError } from "@/lib/errors/app-error";
import { requireAuth } from "@/lib/server/auth";
import { runOcrCheck } from "@/lib/server/ocr";
import { recordAuditEvent } from "@/lib/logging/audit";
import type { Database, Json } from "@/types/supabase";

const schema = z.object({
  fileKey: z.string().min(2),
});

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(30).default(10),
});

const fieldAiParserSchema = z
  .object({
    enabled: z.boolean().optional().default(false),
    modelId: z.string().trim().min(1).max(120).nullable().optional(),
    promptTemplate: z.string().trim().max(5000).nullable().optional(),
    systemPrompt: z.string().trim().max(2000).nullable().optional(),
    extractionInstructions: z.string().trim().max(6000).nullable().optional(),
    expectedSchemaTemplate: z.string().trim().max(8000).nullable().optional(),
    strictSchema: z.boolean().optional().default(true),
  })
  .strict();

type FieldAiParserConfig = z.infer<typeof fieldAiParserSchema>;
type ResolvedFieldAiParserConfig = FieldAiParserConfig & {
  extractionInstructions: string;
  expectedSchemaTemplate: string;
};

function resolveFilePath(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (
    value &&
    typeof value === "object" &&
    typeof (value as Record<string, unknown>).path === "string"
  ) {
    return (value as Record<string, unknown>).path as string;
  }

  return null;
}

function inferMimeTypeFromPath(path: string) {
  const normalized = path.toLowerCase();
  if (normalized.endsWith(".pdf")) return "application/pdf";
  if (normalized.endsWith(".png")) return "image/png";
  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) return "image/jpeg";
  if (normalized.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

function parseFieldAiParserConfigOrNull(value: unknown): ResolvedFieldAiParserConfig | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const parsed = fieldAiParserSchema.safeParse(value);
  if (!parsed.success) {
    throw new AppError({
      message: "Malformed ai_parser_config in stage field",
      userMessage: "La configuración de parsing IA del campo es inválida.",
      status: 500,
      details: parsed.error.flatten(),
    });
  }

  if (!parsed.data.enabled) {
    return null;
  }

  const extractionInstructions = parsed.data.extractionInstructions?.trim();
  const expectedSchemaTemplate = parsed.data.expectedSchemaTemplate?.trim();

  if (!extractionInstructions || !expectedSchemaTemplate) {
    throw new AppError({
      message: "Incomplete ai_parser_config in stage field",
      userMessage: "La configuración de parsing IA del campo está incompleta.",
      status: 500,
    });
  }

  return {
    ...parsed.data,
    extractionInstructions,
    expectedSchemaTemplate,
  };
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return withErrorHandling(async () => {
    const { supabase } = await requireAuth(["admin"]);
    const { id } = await context.params;

    const parsed = querySchema.safeParse({
      limit: request.nextUrl.searchParams.get("limit") ?? undefined,
    });

    if (!parsed.success) {
      throw new AppError({
        message: "Invalid OCR history query",
        userMessage: "No se pudo cargar el historial OCR.",
        status: 400,
        details: parsed.error.flatten(),
      });
    }

    const { data: application } = await supabase
      .from("applications")
      .select("id")
      .eq("id", id)
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
      .eq("application_id", id)
      .order("created_at", { ascending: false })
      .limit(parsed.data.limit);

    if (error) {
      throw new AppError({
        message: "Failed loading OCR history",
        userMessage: "No se pudo cargar el historial OCR.",
        status: 500,
        details: error,
      });
    }

    return NextResponse.json({
      checks: data ?? [],
    });
  }, { operation: "applications.ocr_history" });
}

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
      .select("files, cycle_id, stage_code")
      .eq("id", id)
      .maybeSingle();

    if (!application) {
      throw new AppError({
        message: "Application not found",
        userMessage: "No se encontró la postulación.",
        status: 404,
      });
    }

    const files = application.files as Record<string, unknown>;
    const filePath = resolveFilePath(files[parsed.data.fileKey]);

    if (!filePath) {
      throw new AppError({
        message: "File missing",
        userMessage: "No existe archivo para la clave indicada.",
        status: 404,
      });
    }

    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from("application-documents")
      .download(filePath);

    if (downloadError || !fileBlob) {
      throw new AppError({
        message: "Could not download file for OCR",
        userMessage: "No se pudo preparar el archivo para OCR.",
        status: 500,
        details: downloadError,
      });
    }

    const fileBuffer = Buffer.from(await fileBlob.arrayBuffer());

    const { data: fieldData, error: fieldError } = await supabase
      .from("cycle_stage_fields")
      .select("field_type, ai_parser_config")
      .eq("cycle_id", application.cycle_id)
      .eq("stage_code", application.stage_code)
      .eq("field_key", parsed.data.fileKey)
      .maybeSingle();

    if (fieldError) {
      throw new AppError({
        message: "Failed loading field parser config",
        userMessage: "No se pudo cargar la configuración de parsing IA del archivo.",
        status: 500,
        details: fieldError,
      });
    }

    if (!fieldData || fieldData.field_type !== "file") {
      throw new AppError({
        message: "OCR requested for non-file field",
        userMessage: "Este campo no es de tipo archivo.",
        status: 400,
      });
    }

    const parserConfig = parseFieldAiParserConfigOrNull(
      (fieldData as { ai_parser_config: unknown }).ai_parser_config,
    );

    if (!parserConfig) {
      throw new AppError({
        message: "AI parser is not configured for file field",
        userMessage: "Este archivo no tiene parsing IA habilitado en el editor de formulario.",
        status: 400,
      });
    }

    const extractionInstructions = parserConfig.extractionInstructions;
    const expectedSchemaTemplate = parserConfig.expectedSchemaTemplate;

    try {
      JSON.parse(expectedSchemaTemplate);
    } catch (error) {
      throw new AppError({
        message: "Invalid parser schema template in field config",
        userMessage: "El esquema JSON de parsing IA no es válido para este archivo.",
        status: 500,
        details: error instanceof Error ? error.message : error,
      });
    }

    const { data: templateData } = await supabase
      .from("cycle_stage_templates")
      .select("ocr_prompt_template")
      .eq("cycle_id", application.cycle_id)
      .eq("stage_code", application.stage_code)
      .maybeSingle();

    const result = await runOcrCheck({
      document: {
        fileName: parsed.data.fileKey,
        mimeType: fileBlob.type || inferMimeTypeFromPath(filePath),
        dataBase64: fileBuffer.toString("base64"),
      },
      modelId: parserConfig.modelId ?? null,
      promptTemplate:
        parserConfig.promptTemplate ??
        (templateData as { ocr_prompt_template: string | null } | null)?.ocr_prompt_template ??
        null,
      systemPrompt: parserConfig.systemPrompt ?? null,
      extractionInstructions,
      expectedSchemaTemplate,
      strictSchema: parserConfig.strictSchema ?? true,
      failOnInjectionSignals: true,
    });

    const { data: insertedData, error: insertError } = await supabase
      .from("application_ocr_checks")
      .insert({
        application_id: id,
        actor_id: profile.id,
        file_key: parsed.data.fileKey,
        summary: result.summary,
        confidence: result.confidence,
        raw_response: result.rawResponse as Json,
      })
      .select("*")
      .single();
    const insertedCheck =
      (insertedData as Database["public"]["Tables"]["application_ocr_checks"]["Row"] | null) ?? null;

    if (insertError || !insertedCheck) {
      throw new AppError({
        message: "Failed saving OCR check",
        userMessage: "No se pudo guardar el resultado OCR.",
        status: 500,
        details: insertError,
      });
    }

    await recordAuditEvent({
      supabase,
      actorId: profile.id,
      applicationId: id,
      action: "application.ocr_checked",
      metadata: {
        fileKey: parsed.data.fileKey,
        confidence: result.confidence,
        checkId: insertedCheck.id,
      },
      requestId,
    });

    return NextResponse.json({
      ...result,
      checkId: insertedCheck.id,
      createdAt: insertedCheck.created_at,
    });
  }, { operation: "applications.ocr_check" });
}
