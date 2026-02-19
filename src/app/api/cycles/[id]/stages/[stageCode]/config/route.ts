import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { AppError } from "@/lib/errors/app-error";
import { requireAuth } from "@/lib/server/auth";
import { recordAuditEvent } from "@/lib/logging/audit";
import type { Database } from "@/types/supabase";

type StageFieldRow = Database["public"]["Tables"]["cycle_stage_fields"]["Row"];
type StageAutomationRow = Database["public"]["Tables"]["stage_automation_templates"]["Row"];
type StageTemplateRow = Database["public"]["Tables"]["cycle_stage_templates"]["Row"];

const stageCodeSchema = z.enum(["documents", "exam_placeholder"]);

const fieldSchema = z.object({
  id: z.string().uuid().optional(),
  fieldKey: z.string().min(2).max(60),
  fieldLabel: z.string().min(2).max(120),
  fieldType: z.enum(["short_text", "long_text", "number", "date", "email", "file"]),
  isRequired: z.boolean(),
  placeholder: z.string().max(180).nullable().optional(),
  helpText: z.string().max(220).nullable().optional(),
  sortOrder: z.number().int().min(1).max(200),
  isActive: z.boolean().optional().default(true),
});

const automationSchema = z.object({
  id: z.string().uuid().optional(),
  triggerEvent: z.enum(["application_submitted", "stage_result"]),
  channel: z.literal("email").optional().default("email"),
  isEnabled: z.boolean(),
  templateSubject: z.string().min(3).max(180),
  templateBody: z.string().min(10).max(4000),
});

const patchSchema = z.object({
  fields: z.array(fieldSchema),
  automations: z.array(automationSchema),
  ocrPromptTemplate: z.string().max(5000).nullable().optional(),
});

const cycleIdSchema = z.string().uuid();

async function ensureCycleExists({
  cycleId,
  supabase,
}: {
  cycleId: string;
  supabase: Awaited<ReturnType<typeof requireAuth>>["supabase"];
}) {
  const { data, error } = await supabase.from("cycles").select("id").eq("id", cycleId).maybeSingle();

  if (error || !data) {
    throw new AppError({
      message: "Cycle not found",
      userMessage: "No se encontró el proceso de selección.",
      status: 404,
      details: error,
    });
  }
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string; stageCode: string }> },
) {
  return withErrorHandling(async () => {
    const { supabase } = await requireAuth(["admin"]);
    const { id: rawCycleId, stageCode: rawStageCode } = await context.params;
    const cycleIdParsed = cycleIdSchema.safeParse(rawCycleId);
    const stageCodeParsed = stageCodeSchema.safeParse(rawStageCode);

    if (!cycleIdParsed.success || !stageCodeParsed.success) {
      throw new AppError({
        message: "Invalid cycle stage config context",
        userMessage: "La etapa o proceso seleccionado no es válido.",
        status: 400,
      });
    }

    const cycleId = cycleIdParsed.data;
    const stageCode = stageCodeParsed.data;

    await ensureCycleExists({ cycleId, supabase });

    const { data: fieldsData, error: fieldsError } = await supabase
      .from("cycle_stage_fields")
      .select("*")
      .eq("cycle_id", cycleId)
      .eq("stage_code", stageCode)
      .order("sort_order", { ascending: true });

    if (fieldsError) {
      throw new AppError({
        message: "Failed loading stage fields",
        userMessage: "No se pudieron cargar los campos de la etapa.",
        status: 500,
        details: fieldsError,
      });
    }

    const [{ data: automationsData, error: automationsError }, { data: templateData, error: templateError }] =
      await Promise.all([
        supabase
          .from("stage_automation_templates")
          .select("*")
          .eq("cycle_id", cycleId)
          .eq("stage_code", stageCode)
          .order("created_at", { ascending: true }),
        supabase
          .from("cycle_stage_templates")
          .select("id, ocr_prompt_template")
          .eq("cycle_id", cycleId)
          .eq("stage_code", stageCode)
          .maybeSingle(),
      ]);

    if (automationsError) {
      throw new AppError({
        message: "Failed loading stage automations",
        userMessage: "No se pudieron cargar las automatizaciones de la etapa.",
        status: 500,
        details: automationsError,
      });
    }

    if (templateError) {
      throw new AppError({
        message: "Failed loading stage template metadata",
        userMessage: "No se pudo cargar la configuración OCR de la etapa.",
        status: 500,
        details: templateError,
      });
    }

    return NextResponse.json({
      fields: (fieldsData as StageFieldRow[] | null) ?? [],
      automations: (automationsData as StageAutomationRow[] | null) ?? [],
      ocrPromptTemplate:
        ((templateData as Pick<StageTemplateRow, "ocr_prompt_template"> | null)?.ocr_prompt_template ?? null),
    });
  }, { operation: "cycles.stage_config.get" });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; stageCode: string }> },
) {
  return withErrorHandling(async (requestId) => {
    const { profile, supabase } = await requireAuth(["admin"]);
    const { id: rawCycleId, stageCode: rawStageCode } = await context.params;
    const cycleIdParsed = cycleIdSchema.safeParse(rawCycleId);
    const stageCodeParsed = stageCodeSchema.safeParse(rawStageCode);

    if (!cycleIdParsed.success || !stageCodeParsed.success) {
      throw new AppError({
        message: "Invalid cycle stage config context",
        userMessage: "La etapa o proceso seleccionado no es válido.",
        status: 400,
      });
    }

    const cycleId = cycleIdParsed.data;
    const stageCode = stageCodeParsed.data;
    const body = await request.json();
    const parsed = patchSchema.safeParse(body);

    if (!parsed.success) {
      throw new AppError({
        message: "Invalid stage config payload",
        userMessage: "No se pudo guardar la configuración de etapa.",
        status: 400,
        details: parsed.error.flatten(),
      });
    }

    await ensureCycleExists({ cycleId, supabase });

    const normalizedKeys = parsed.data.fields.map((field) => field.fieldKey.trim());
    if (new Set(normalizedKeys).size !== normalizedKeys.length) {
      throw new AppError({
        message: "Duplicate field keys",
        userMessage: "No puedes repetir claves técnicas de campos.",
        status: 400,
      });
    }

    const automationKeys = parsed.data.automations.map(
      (automation) => `${automation.triggerEvent}:${automation.channel}`,
    );
    if (new Set(automationKeys).size !== automationKeys.length) {
      throw new AppError({
        message: "Duplicate automation trigger/channel",
        userMessage: "No puedes repetir automatizaciones para el mismo evento.",
        status: 400,
      });
    }

    const [{ data: existingFieldsData }, { data: existingAutomationsData }] = await Promise.all([
      supabase
        .from("cycle_stage_fields")
        .select("id")
        .eq("cycle_id", cycleId)
        .eq("stage_code", stageCode),
      supabase
        .from("stage_automation_templates")
        .select("id")
        .eq("cycle_id", cycleId)
        .eq("stage_code", stageCode),
    ]);

    const incomingFieldIds = new Set(parsed.data.fields.map((field) => field.id).filter(Boolean));
    const incomingAutomationIds = new Set(
      parsed.data.automations.map((automation) => automation.id).filter(Boolean),
    );

    const fieldIdsToDelete = (existingFieldsData ?? [])
      .map((row) => row.id)
      .filter((id) => !incomingFieldIds.has(id));
    const automationIdsToDelete = (existingAutomationsData ?? [])
      .map((row) => row.id)
      .filter((id) => !incomingAutomationIds.has(id));

    const [deleteFieldsResult, deleteAutomationsResult] = await Promise.all([
      fieldIdsToDelete.length > 0
        ? supabase
            .from("cycle_stage_fields")
            .delete()
            .in("id", fieldIdsToDelete)
        : Promise.resolve({ error: null }),
      automationIdsToDelete.length > 0
        ? supabase
            .from("stage_automation_templates")
            .delete()
            .in("id", automationIdsToDelete)
        : Promise.resolve({ error: null }),
    ]);

    if (deleteFieldsResult.error) {
      throw new AppError({
        message: "Failed deleting removed stage fields",
        userMessage: "No se pudieron guardar los campos de la etapa.",
        status: 500,
        details: deleteFieldsResult.error,
      });
    }

    if (deleteAutomationsResult.error) {
      throw new AppError({
        message: "Failed deleting removed stage automations",
        userMessage: "No se pudieron guardar las automatizaciones de la etapa.",
        status: 500,
        details: deleteAutomationsResult.error,
      });
    }

    const fieldRows = parsed.data.fields.map((field) => ({
      ...(field.id ? { id: field.id } : {}),
      cycle_id: cycleId,
      stage_code: stageCode,
      field_key: field.fieldKey.trim(),
      field_label: field.fieldLabel.trim(),
      field_type: field.fieldType,
      is_required: field.isRequired,
      placeholder: field.placeholder ?? null,
      help_text: field.helpText ?? null,
      sort_order: field.sortOrder,
      is_active: field.isActive,
    }));

    const automationRows = parsed.data.automations.map((automation) => ({
      ...(automation.id ? { id: automation.id } : {}),
      cycle_id: cycleId,
      stage_code: stageCode,
      trigger_event: automation.triggerEvent,
      channel: automation.channel,
      is_enabled: automation.isEnabled,
      template_subject: automation.templateSubject,
      template_body: automation.templateBody,
      updated_at: new Date().toISOString(),
    }));

    const [upsertFieldsResult, upsertAutomationsResult] = await Promise.all([
      fieldRows.length > 0
        ? supabase
            .from("cycle_stage_fields")
            .upsert(fieldRows, { onConflict: "id" })
        : Promise.resolve({ error: null }),
      automationRows.length > 0
        ? supabase
            .from("stage_automation_templates")
            .upsert(automationRows, { onConflict: "id" })
        : Promise.resolve({ error: null }),
    ]);

    if (upsertFieldsResult.error) {
      throw new AppError({
        message: "Failed upserting stage fields",
        userMessage: "No se pudieron guardar los campos de la etapa.",
        status: 500,
        details: upsertFieldsResult.error,
      });
    }

    if (upsertAutomationsResult.error) {
      throw new AppError({
        message: "Failed upserting stage automations",
        userMessage: "No se pudieron guardar las automatizaciones de la etapa.",
        status: 500,
        details: upsertAutomationsResult.error,
      });
    }

    const [{ data: savedFieldsData, error: savedFieldsError }, { data: savedAutomationsData, error: savedAutomationsError }] =
      await Promise.all([
        supabase
          .from("cycle_stage_fields")
          .select("*")
          .eq("cycle_id", cycleId)
          .eq("stage_code", stageCode)
          .order("sort_order", { ascending: true }),
        supabase
          .from("stage_automation_templates")
          .select("*")
          .eq("cycle_id", cycleId)
          .eq("stage_code", stageCode)
          .order("created_at", { ascending: true }),
      ]);

    const { data: savedTemplateData, error: savedTemplateError } = await supabase
      .from("cycle_stage_templates")
      .update({
        ocr_prompt_template:
          parsed.data.ocrPromptTemplate && parsed.data.ocrPromptTemplate.trim().length > 0
            ? parsed.data.ocrPromptTemplate.trim()
            : null,
      })
      .eq("cycle_id", cycleId)
      .eq("stage_code", stageCode)
      .select("id, ocr_prompt_template")
      .maybeSingle();

    if (savedFieldsError) {
      throw new AppError({
        message: "Failed loading saved stage fields",
        userMessage: "No se pudieron guardar los campos de la etapa.",
        status: 500,
        details: savedFieldsError,
      });
    }

    if (savedAutomationsError) {
      throw new AppError({
        message: "Failed loading saved stage automations",
        userMessage: "No se pudieron guardar las automatizaciones de la etapa.",
        status: 500,
        details: savedAutomationsError,
      });
    }

    if (savedTemplateError) {
      throw new AppError({
        message: "Failed saving OCR prompt template",
        userMessage: "No se pudo guardar el prompt OCR de la etapa.",
        status: 500,
        details: savedTemplateError,
      });
    }

    const savedFields = (savedFieldsData as StageFieldRow[] | null) ?? [];
    const savedAutomations = (savedAutomationsData as StageAutomationRow[] | null) ?? [];
    const savedTemplate = (savedTemplateData as Pick<StageTemplateRow, "ocr_prompt_template"> | null) ?? null;

    await recordAuditEvent({
      supabase,
      actorId: profile.id,
      action: "cycle.stage_config_updated",
      metadata: {
        cycleId,
        stageCode,
        fieldsSaved: savedFields.length,
        automationsSaved: savedAutomations.length,
        hasOcrPromptTemplate: Boolean(savedTemplate?.ocr_prompt_template),
      },
      requestId,
    });

    return NextResponse.json({
      fields: savedFields.sort((a, b) => a.sort_order - b.sort_order),
      automations: savedAutomations,
      ocrPromptTemplate: savedTemplate?.ocr_prompt_template ?? null,
    });
  }, { operation: "cycles.stage_config.patch" });
}
