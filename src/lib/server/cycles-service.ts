import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors/app-error";
import type { Database } from "@/types/supabase";
import {
  buildDefaultCycleStageFields,
  buildDefaultCycleStageTemplates,
  buildDefaultStageAutomationTemplates,
} from "@/lib/stages/templates";

type CycleRow = Database["public"]["Tables"]["cycles"]["Row"];
type ApplicationCycleRow = Pick<
  Database["public"]["Tables"]["applications"]["Row"],
  "cycle_id"
>;
type ApplicationSummaryRow = Pick<
  Database["public"]["Tables"]["applications"]["Row"],
  "id" | "cycle_id" | "status" | "stage_code" | "updated_at"
>;

// ---------------------------------------------------------------------------
// LIST
// ---------------------------------------------------------------------------

export async function listCyclesForAdmin(supabase: SupabaseClient<Database>) {
  const [cyclesResult, applicationsResult] = await Promise.all([
    supabase
      .from("cycles")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase
      .from("applications")
      .select("cycle_id"),
  ]);

  if (cyclesResult.error) {
    throw new AppError({
      message: "Failed loading cycles",
      userMessage: "No se pudieron cargar los procesos de selección.",
      status: 500,
      details: cyclesResult.error,
    });
  }

  if (applicationsResult.error) {
    throw new AppError({
      message: "Failed loading applications for cycles summary",
      userMessage: "No se pudieron cargar los procesos de selección.",
      status: 500,
      details: applicationsResult.error,
    });
  }

  const cycles = (cyclesResult.data as CycleRow[] | null) ?? [];
  const applications = (applicationsResult.data as ApplicationCycleRow[] | null) ?? [];
  const cycleCounts = new Map<string, number>();
  for (const row of applications) {
    cycleCounts.set(row.cycle_id, (cycleCounts.get(row.cycle_id) ?? 0) + 1);
  }

  return {
    cycles: cycles.map((cycle) => ({
      ...cycle,
      applicationCount: cycleCounts.get(cycle.id) ?? 0,
    })),
  };
}

export async function listCyclesForApplicant(
  supabase: SupabaseClient<Database>,
  applicantId: string,
) {
  const [cyclesResult, applicationsResult] = await Promise.all([
    supabase
      .from("cycles")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase
      .from("applications")
      .select("id, cycle_id, status, stage_code, updated_at")
      .eq("applicant_id", applicantId),
  ]);

  if (cyclesResult.error) {
    throw new AppError({
      message: "Failed loading cycles",
      userMessage: "No se pudieron cargar los procesos de selección.",
      status: 500,
      details: cyclesResult.error,
    });
  }

  if (applicationsResult.error) {
    throw new AppError({
      message: "Failed loading applicant applications summary",
      userMessage: "No se pudieron cargar tus procesos de selección.",
      status: 500,
      details: applicationsResult.error,
    });
  }

  return {
    cycles: (cyclesResult.data as CycleRow[] | null) ?? [],
    applications: (applicationsResult.data as ApplicationSummaryRow[] | null) ?? [],
  };
}

// ---------------------------------------------------------------------------
// CREATE
// ---------------------------------------------------------------------------

export interface CreateCycleParams {
  name: string;
  year: number;
  isActive: boolean;
  maxApplicationsPerUser: number;
}

function defaultDatesForYear(year: number) {
  return {
    stage1OpenAt: new Date(Date.UTC(year, 0, 1, 0, 0, 0)).toISOString(),
    stage1CloseAt: new Date(Date.UTC(year, 4, 31, 23, 59, 59)).toISOString(),
    stage2OpenAt: new Date(Date.UTC(year, 5, 1, 0, 0, 0)).toISOString(),
    stage2CloseAt: new Date(Date.UTC(year, 11, 31, 23, 59, 59)).toISOString(),
  };
}

export async function createCycle(
  supabase: SupabaseClient<Database>,
  params: CreateCycleParams,
) {
  const defaultDates = defaultDatesForYear(params.year);

  const { data: cycleData, error } = await supabase
    .from("cycles")
    .insert({
      name: params.name,
      is_active: false,
      stage1_open_at: defaultDates.stage1OpenAt,
      stage1_close_at: defaultDates.stage1CloseAt,
      stage2_open_at: defaultDates.stage2OpenAt,
      stage2_close_at: defaultDates.stage2CloseAt,
      max_applications_per_user: params.maxApplicationsPerUser,
    })
    .select("*")
    .single();
  const cycle = (cycleData as CycleRow | null) ?? null;

  if (error || !cycle) {
    throw new AppError({
      message: "Failed creating cycle",
      userMessage: "No se pudo crear el proceso de selección.",
      status: 500,
      details: error,
    });
  }

  // Bootstrap default templates
  const defaultTemplates = buildDefaultCycleStageTemplates({
    cycleId: cycle.id,
    stage1CloseAt: cycle.stage1_close_at,
    stage2CloseAt: cycle.stage2_close_at,
  });
  const { error: templatesError } = await supabase
    .from("cycle_stage_templates")
    .insert(defaultTemplates);

  if (templatesError) {
    throw new AppError({
      message: "Failed creating default stage templates",
      userMessage:
        "El proceso se creó sin plantilla de etapas. Intenta nuevamente.",
      status: 500,
      details: templatesError,
    });
  }

  // Bootstrap default fields
  const defaultFields = buildDefaultCycleStageFields({ cycleId: cycle.id });
  const { error: fieldsError } = await supabase
    .from("cycle_stage_fields")
    .insert(defaultFields);

  if (fieldsError) {
    throw new AppError({
      message: "Failed creating default stage fields",
      userMessage:
        "El proceso se creó sin campos base. Intenta nuevamente.",
      status: 500,
      details: fieldsError,
    });
  }

  // Bootstrap default automations
  const defaultAutomations = buildDefaultStageAutomationTemplates({ cycleId: cycle.id });
  const { error: automationsError } = await supabase
    .from("stage_automation_templates")
    .insert(defaultAutomations);

  if (automationsError) {
    throw new AppError({
      message: "Failed creating default stage automations",
      userMessage:
        "El proceso se creó sin automatizaciones base. Intenta nuevamente.",
      status: 500,
      details: automationsError,
    });
  }

  // Activate if requested (deactivate others first)
  if (params.isActive) {
    await supabase
      .from("cycles")
      .update({ is_active: false })
      .neq("id", cycle.id);
    await supabase
      .from("cycles")
      .update({ is_active: true })
      .eq("id", cycle.id);
  }

  return {
    cycle,
    templatesCreated: defaultTemplates.length,
    fieldsCreated: defaultFields.length,
    automationsCreated: defaultAutomations.length,
  };
}
