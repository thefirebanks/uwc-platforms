import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors/app-error";
import type { Database } from "@/types/supabase";

type CycleTemplateRow =
  Database["public"]["Tables"]["cycle_stage_templates"]["Row"];
type CycleTemplateInsert =
  Database["public"]["Tables"]["cycle_stage_templates"]["Insert"];

// ---------------------------------------------------------------------------
// LIST
// ---------------------------------------------------------------------------

export async function listCycleTemplates(
  supabase: SupabaseClient<Database>,
  cycleId: string,
) {
  const { data, error } = await supabase
    .from("cycle_stage_templates")
    .select("*")
    .eq("cycle_id", cycleId)
    .order("sort_order", { ascending: true });

  if (error) {
    throw new AppError({
      message: "Failed loading cycle templates",
      userMessage: "No se pudieron cargar las etapas del proceso.",
      status: 500,
      details: error,
    });
  }

  return ((data as CycleTemplateRow[] | null) ?? []).sort(
    (a, b) => a.sort_order - b.sort_order,
  );
}

// ---------------------------------------------------------------------------
// UPDATE (bulk patch)
// ---------------------------------------------------------------------------

export interface UpdateTemplateItem {
  id: string;
  stageLabel: string;
  milestoneLabel: string;
  dueAt?: string | null;
  sortOrder?: number;
}

export async function updateCycleTemplates(
  supabase: SupabaseClient<Database>,
  cycleId: string,
  templates: UpdateTemplateItem[],
) {
  const updatedTemplates: CycleTemplateRow[] = [];

  for (const template of templates) {
    const { data, error } = await supabase
      .from("cycle_stage_templates")
      .update({
        stage_label: template.stageLabel,
        milestone_label: template.milestoneLabel,
        due_at: template.dueAt ?? null,
        sort_order: template.sortOrder,
      })
      .eq("id", template.id)
      .eq("cycle_id", cycleId)
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

  return updatedTemplates.sort((a, b) => a.sort_order - b.sort_order);
}

// ---------------------------------------------------------------------------
// CREATE
// ---------------------------------------------------------------------------

export interface CreateTemplateParams {
  stageLabel?: string;
  milestoneLabel?: string;
}

export async function createCycleTemplate(
  supabase: SupabaseClient<Database>,
  cycleId: string,
  params?: CreateTemplateParams,
) {
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

  const existingTemplates =
    (existingRows as Pick<CycleTemplateRow, "sort_order" | "stage_code">[] | null) ?? [];
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
    stage_label:
      params?.stageLabel ?? `Stage ${nextDisplayStageNumber}: Nueva etapa`,
    milestone_label:
      params?.milestoneLabel ??
      "Configura objetivo y criterios de esta etapa",
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

  return createdTemplate;
}
