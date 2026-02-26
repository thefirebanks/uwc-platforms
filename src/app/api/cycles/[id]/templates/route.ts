import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/errors/with-error-handling";
import { AppError } from "@/lib/errors/app-error";
import { requireAuth } from "@/lib/server/auth";
import type { Database } from "@/types/supabase";
import { recordAuditEvent } from "@/lib/logging/audit";

type CycleTemplateRow = Database["public"]["Tables"]["cycle_stage_templates"]["Row"];
type CycleTemplateInsert = Database["public"]["Tables"]["cycle_stage_templates"]["Insert"];

const patchTemplatesSchema = z.object({
  templates: z
    .array(
      z.object({
        id: z.string().uuid(),
        stageLabel: z.string().min(3).max(120),
        milestoneLabel: z.string().min(3).max(180),
        dueAt: z.string().datetime().nullable().optional(),
        sortOrder: z.number().int().min(0).max(99).optional(),
      }),
    )
    .min(1),
});
const cycleIdSchema = z.string().uuid();
const createTemplateSchema = z
  .object({
    stageLabel: z.string().min(3).max(120).optional(),
    milestoneLabel: z.string().min(3).max(180).optional(),
  })
  .optional();

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
  context: { params: Promise<{ id: string }> },
) {
  return withErrorHandling(async () => {
    const { supabase } = await requireAuth(["admin", "applicant"]);
    const { id: rawId } = await context.params;
    const idParsed = cycleIdSchema.safeParse(rawId);

    if (!idParsed.success) {
      throw new AppError({
        message: "Invalid cycle id",
        userMessage: "El proceso seleccionado no es válido.",
        status: 400,
      });
    }
    const id = idParsed.data;

    await ensureCycleExists({ cycleId: id, supabase });

    const { data, error } = await supabase
      .from("cycle_stage_templates")
      .select("*")
      .eq("cycle_id", id)
      .order("sort_order", { ascending: true });

    if (error) {
      throw new AppError({
        message: "Failed loading cycle templates",
        userMessage: "No se pudieron cargar las etapas del proceso.",
        status: 500,
        details: error,
      });
    }

    return NextResponse.json({
      templates: ((data as CycleTemplateRow[] | null) ?? []).sort(
        (a, b) => a.sort_order - b.sort_order,
      ),
    });
  }, { operation: "cycles.templates.list" });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return withErrorHandling(async (requestId) => {
    const { profile, supabase } = await requireAuth(["admin"]);
    const { id: rawId } = await context.params;
    const idParsed = cycleIdSchema.safeParse(rawId);

    if (!idParsed.success) {
      throw new AppError({
        message: "Invalid cycle id",
        userMessage: "El proceso seleccionado no es válido.",
        status: 400,
      });
    }
    const id = idParsed.data;
    const body = await request.json();
    const parsed = patchTemplatesSchema.safeParse(body);

    if (!parsed.success) {
      throw new AppError({
        message: "Invalid cycle templates patch payload",
        userMessage: "No se pudieron guardar las plantillas de etapa.",
        status: 400,
        details: parsed.error.flatten(),
      });
    }

    await ensureCycleExists({ cycleId: id, supabase });

    const updatedTemplates: CycleTemplateRow[] = [];

    for (const template of parsed.data.templates) {
      const { data, error } = await supabase
        .from("cycle_stage_templates")
        .update({
          stage_label: template.stageLabel,
          milestone_label: template.milestoneLabel,
          due_at: template.dueAt ?? null,
          sort_order: template.sortOrder,
        })
        .eq("id", template.id)
        .eq("cycle_id", id)
        .select("*")
        .single();

      const updated = (data as CycleTemplateRow | null) ?? null;

      if (error || !updated) {
        throw new AppError({
          message: "Failed updating cycle stage template",
          userMessage: "No se pudieron guardar las plantillas de etapa.",
          status: 500,
          details: error,
        });
      }

      updatedTemplates.push(updated);
    }

    await recordAuditEvent({
      supabase,
      actorId: profile.id,
      action: "cycle.templates_updated",
      metadata: {
        cycleId: id,
        updatedCount: updatedTemplates.length,
      },
      requestId,
    });

    return NextResponse.json({
      templates: updatedTemplates.sort((a, b) => a.sort_order - b.sort_order),
    });
  }, { operation: "cycles.templates.update" });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return withErrorHandling(async (requestId) => {
    const { profile, supabase } = await requireAuth(["admin"]);
    const { id: rawId } = await context.params;
    const idParsed = cycleIdSchema.safeParse(rawId);

    if (!idParsed.success) {
      throw new AppError({
        message: "Invalid cycle id",
        userMessage: "El proceso seleccionado no es válido.",
        status: 400,
      });
    }

    const cycleId = idParsed.data;
    await ensureCycleExists({ cycleId, supabase });

    const body = request.headers.get("content-length")
      ? await request.json().catch(() => ({}))
      : {};
    const parsedBody = createTemplateSchema.safeParse(body);

    if (!parsedBody.success) {
      throw new AppError({
        message: "Invalid cycle template create payload",
        userMessage: "No se pudo crear la nueva etapa.",
        status: 400,
        details: parsedBody.error.flatten(),
      });
    }

    const { data: existingRows, error: existingRowsError } = await supabase
      .from("cycle_stage_templates")
      .select("sort_order, stage_code")
      .eq("cycle_id", cycleId)
      .order("sort_order", { ascending: true });

    if (existingRowsError) {
      throw new AppError({
        message: "Failed loading existing templates before create",
        userMessage: "No se pudo crear la nueva etapa.",
        status: 500,
        details: existingRowsError,
      });
    }

    const existingTemplates = (existingRows as Pick<CycleTemplateRow, "sort_order" | "stage_code">[] | null) ?? [];
    const nextTemplateOrdinal = existingTemplates.length + 1;
    const nextDisplayStageNumber = existingTemplates.length + 1;
    const nextSortOrder =
      existingTemplates.length === 0
        ? 1
        : Math.max(...existingTemplates.map((row) => row.sort_order)) + 1;

    const existingCodes = new Set(existingTemplates.map((row) => row.stage_code));
    let candidateCode = `custom_stage_${nextTemplateOrdinal}`;
    while (existingCodes.has(candidateCode)) {
      candidateCode = `custom_stage_${nextTemplateOrdinal}_${Math.random().toString(36).slice(2, 6)}`;
    }

    const insertRow: CycleTemplateInsert = {
      cycle_id: cycleId,
      stage_code: candidateCode,
      stage_label: parsedBody.data?.stageLabel ?? `Stage ${nextDisplayStageNumber}: Nueva etapa`,
      milestone_label:
        parsedBody.data?.milestoneLabel ?? "Configura objetivo y criterios de esta etapa",
      due_at: null,
      ocr_prompt_template: null,
      sort_order: nextSortOrder,
    };

    const { data: createdData, error: createError } = await supabase
      .from("cycle_stage_templates")
      .insert(insertRow)
      .select("*")
      .single();

    const createdTemplate = (createdData as CycleTemplateRow | null) ?? null;

    if (createError || !createdTemplate) {
      throw new AppError({
        message: "Failed creating cycle stage template",
        userMessage: "No se pudo crear la nueva etapa.",
        status: 500,
        details: createError,
      });
    }

    await recordAuditEvent({
      supabase,
      actorId: profile.id,
      action: "cycle.template_created",
      metadata: {
        cycleId,
        templateId: createdTemplate.id,
        stageCode: createdTemplate.stage_code,
      },
      requestId,
    });

    return NextResponse.json({ template: createdTemplate }, { status: 201 });
  }, { operation: "cycles.templates.create" });
}
