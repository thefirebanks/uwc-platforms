import { NextRequest, NextResponse } from "next/server";
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

    const { data: templateData } = await supabase
      .from("cycle_stage_templates")
      .select("ocr_prompt_template")
      .eq("cycle_id", application.cycle_id)
      .eq("stage_code", application.stage_code)
      .maybeSingle();

    const result = await runOcrCheck({
      fileUrl: signedUrlData.signedUrl,
      promptTemplate:
        (templateData as { ocr_prompt_template: string | null } | null)?.ocr_prompt_template ?? null,
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
