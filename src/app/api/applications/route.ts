import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { AppError } from "@/lib/errors/app-error";
import { requireAuth } from "@/lib/server/auth";
import {
  getApplicantApplication,
  getApplicationsForAdmin,
  upsertApplicantApplication,
} from "@/lib/server/application-service";
import { recordAuditEvent } from "@/lib/logging/audit";
import { validateStagePayload } from "@/lib/stages/form-schema";
import type { CycleStageField } from "@/types/domain";
import { buildFallbackStageFields, resolveDocumentStageFields } from "@/lib/stages/stage-field-fallback";

const cycleIdSchema = z.string().uuid();

export async function GET(request: NextRequest) {
  return withErrorHandling(async () => {
    const { profile, supabase } = await requireAuth(["admin", "applicant"]);
    const rawCycleId = request.nextUrl.searchParams.get("cycleId");
    let cycleId: string | undefined;

    if (rawCycleId) {
      const parsed = cycleIdSchema.safeParse(rawCycleId);
      if (!parsed.success) {
        throw new AppError({
          message: "Invalid cycle id filter",
          userMessage: "El proceso seleccionado no es válido.",
          status: 400,
        });
      }
      cycleId = parsed.data;
    }

    if (profile.role === "admin") {
      const applications = await getApplicationsForAdmin(supabase, cycleId);
      return NextResponse.json({ applications });
    }

    const application = await getApplicantApplication(supabase, profile.id, cycleId);
    return NextResponse.json({ application });
  }, { operation: "applications.get" });
}

export async function POST(request: NextRequest) {
  return withErrorHandling(async (requestId) => {
    const { profile, supabase } = await requireAuth(["applicant"]);
    const body = await request.json();
    const cycleId =
      typeof body.cycleId === "string" && body.cycleId.trim().length > 0 ? body.cycleId : undefined;

    if (cycleId) {
      const cycleIdParsed = cycleIdSchema.safeParse(cycleId);
      if (!cycleIdParsed.success) {
        throw new AppError({
          message: "Invalid cycle id payload",
          userMessage: "El proceso seleccionado no es válido.",
          status: 400,
        });
      }
    }

    const targetCycleId = cycleId;
    let stageFields: CycleStageField[] = buildFallbackStageFields(targetCycleId ?? "fallback-cycle");

    if (targetCycleId) {
      const { data: stageFieldsData, error: stageFieldsError } = await supabase
        .from("cycle_stage_fields")
        .select("*")
        .eq("cycle_id", targetCycleId)
        .eq("stage_code", "documents")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (stageFieldsError) {
        throw new AppError({
          message: "Failed loading stage fields",
          userMessage: "No se pudo validar la configuración de la etapa.",
          status: 500,
          details: stageFieldsError,
        });
      }

      const configured = (stageFieldsData as CycleStageField[] | null) ?? [];
      if (configured.length > 0) {
        stageFields = resolveDocumentStageFields({
          cycleId: targetCycleId,
          fields: configured,
        });
      }
    }

    const rawPayload =
      body && typeof body.payload === "object" && body.payload !== null
        ? (body.payload as Record<string, unknown>)
        : (body as Record<string, unknown>);

    const validation = validateStagePayload({
      fields: stageFields.filter((field) => field.field_type !== "file"),
      payload: rawPayload,
      skipFileValidation: true,
    });

    if (!validation.isValid) {
      throw new AppError({
        message: "Invalid application payload",
        userMessage: "Hay campos inválidos en tu postulación. Revisa el formulario.",
        status: 400,
        details: validation.errors,
      });
    }

    const application = await upsertApplicantApplication({
      supabase,
      applicantId: profile.id,
      payload: validation.normalizedPayload,
      cycleId,
    });

    await recordAuditEvent({
      supabase,
      actorId: profile.id,
      applicationId: application.id,
      action: "application.upserted",
      metadata: { stage: application.stage_code, status: application.status },
      requestId,
    });

    return NextResponse.json({ application });
  }, { operation: "applications.upsert" });
}
