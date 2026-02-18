import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { AppError } from "@/lib/errors/app-error";
import { requireAuth } from "@/lib/server/auth";
import { recordAuditEvent } from "@/lib/logging/audit";
import type { Database } from "@/types/supabase";

type StageFieldRow = Database["public"]["Tables"]["cycle_stage_fields"]["Row"];
type StageAutomationRow = Database["public"]["Tables"]["stage_automation_templates"]["Row"];

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

    const { data: automationsData, error: automationsError } = await supabase
      .from("stage_automation_templates")
      .select("*")
      .eq("cycle_id", cycleId)
      .eq("stage_code", stageCode)
      .order("created_at", { ascending: true });

    if (automationsError) {
      throw new AppError({
        message: "Failed loading stage automations",
        userMessage: "No se pudieron cargar las automatizaciones de la etapa.",
        status: 500,
        details: automationsError,
      });
    }

    return NextResponse.json({
      fields: (fieldsData as StageFieldRow[] | null) ?? [],
      automations: (automationsData as StageAutomationRow[] | null) ?? [],
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

    const { data: existingFieldsData } = await supabase
      .from("cycle_stage_fields")
      .select("id")
      .eq("cycle_id", cycleId)
      .eq("stage_code", stageCode);
    const existingFieldIds = new Set((existingFieldsData ?? []).map((row) => row.id));

    const savedFields: StageFieldRow[] = [];
    for (const field of parsed.data.fields) {
      if (field.id) {
        const { data, error } = await supabase
          .from("cycle_stage_fields")
          .update({
            field_key: field.fieldKey.trim(),
            field_label: field.fieldLabel.trim(),
            field_type: field.fieldType,
            is_required: field.isRequired,
            placeholder: field.placeholder ?? null,
            help_text: field.helpText ?? null,
            sort_order: field.sortOrder,
            is_active: field.isActive,
          })
          .eq("id", field.id)
          .eq("cycle_id", cycleId)
          .eq("stage_code", stageCode)
          .select("*")
          .single();

        const saved = (data as StageFieldRow | null) ?? null;
        if (error || !saved) {
          throw new AppError({
            message: "Failed updating stage field",
            userMessage: "No se pudieron guardar los campos de la etapa.",
            status: 500,
            details: error,
          });
        }
        savedFields.push(saved);
        existingFieldIds.delete(field.id);
      } else {
        const { data, error } = await supabase
          .from("cycle_stage_fields")
          .insert({
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
          })
          .select("*")
          .single();

        const saved = (data as StageFieldRow | null) ?? null;
        if (error || !saved) {
          throw new AppError({
            message: "Failed creating stage field",
            userMessage: "No se pudieron guardar los campos de la etapa.",
            status: 500,
            details: error,
          });
        }
        savedFields.push(saved);
      }
    }

    if (existingFieldIds.size > 0) {
      await supabase.from("cycle_stage_fields").delete().in("id", [...existingFieldIds]);
    }

    const { data: existingAutomationsData } = await supabase
      .from("stage_automation_templates")
      .select("id")
      .eq("cycle_id", cycleId)
      .eq("stage_code", stageCode);
    const existingAutomationIds = new Set((existingAutomationsData ?? []).map((row) => row.id));

    const savedAutomations: StageAutomationRow[] = [];
    for (const automation of parsed.data.automations) {
      if (automation.id) {
        const { data, error } = await supabase
          .from("stage_automation_templates")
          .update({
            trigger_event: automation.triggerEvent,
            channel: automation.channel,
            is_enabled: automation.isEnabled,
            template_subject: automation.templateSubject,
            template_body: automation.templateBody,
            updated_at: new Date().toISOString(),
          })
          .eq("id", automation.id)
          .eq("cycle_id", cycleId)
          .eq("stage_code", stageCode)
          .select("*")
          .single();

        const saved = (data as StageAutomationRow | null) ?? null;
        if (error || !saved) {
          throw new AppError({
            message: "Failed updating stage automation",
            userMessage: "No se pudieron guardar las automatizaciones de la etapa.",
            status: 500,
            details: error,
          });
        }
        savedAutomations.push(saved);
        existingAutomationIds.delete(automation.id);
      } else {
        const { data, error } = await supabase
          .from("stage_automation_templates")
          .insert({
            cycle_id: cycleId,
            stage_code: stageCode,
            trigger_event: automation.triggerEvent,
            channel: automation.channel,
            is_enabled: automation.isEnabled,
            template_subject: automation.templateSubject,
            template_body: automation.templateBody,
          })
          .select("*")
          .single();

        const saved = (data as StageAutomationRow | null) ?? null;
        if (error || !saved) {
          throw new AppError({
            message: "Failed creating stage automation",
            userMessage: "No se pudieron guardar las automatizaciones de la etapa.",
            status: 500,
            details: error,
          });
        }
        savedAutomations.push(saved);
      }
    }

    if (existingAutomationIds.size > 0) {
      await supabase.from("stage_automation_templates").delete().in("id", [...existingAutomationIds]);
    }

    await recordAuditEvent({
      supabase,
      actorId: profile.id,
      action: "cycle.stage_config_updated",
      metadata: {
        cycleId,
        stageCode,
        fieldsSaved: savedFields.length,
        automationsSaved: savedAutomations.length,
      },
      requestId,
    });

    return NextResponse.json({
      fields: savedFields.sort((a, b) => a.sort_order - b.sort_order),
      automations: savedAutomations,
    });
  }, { operation: "cycles.stage_config.patch" });
}
