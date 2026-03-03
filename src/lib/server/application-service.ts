import Papa from "papaparse";
import type { SupabaseClient } from "@supabase/supabase-js";
import { canTransition, canTransitionWithRules, deriveTransitionRules } from "@/lib/stages/transition";
import { AppError } from "@/lib/errors/app-error";
import type { Database } from "@/types/supabase";
import type { Application, ApplicationStatus, StageCode } from "@/types/domain";
import type { StagePayload } from "@/lib/stages/form-schema";

type ApplicationRow = Database["public"]["Tables"]["applications"]["Row"];

function pickString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function getApplicationName(application: Application, fallback = "Postulante"): string {
  const payload = application.payload as Record<string, unknown>;
  const explicit = pickString(payload.fullName);
  if (explicit) return explicit;

  const combined = [
    pickString(payload.firstName),
    pickString(payload.paternalLastName),
    pickString(payload.maternalLastName),
  ]
    .filter(Boolean)
    .join(" ");

  return combined || fallback;
}

function isPast(dateLike: string | null | undefined) {
  if (!dateLike) {
    return false;
  }

  const parsed = Date.parse(dateLike);
  return Number.isFinite(parsed) && parsed < Date.now();
}

async function getActiveCycleId(supabase: SupabaseClient<Database>) {
  const { data, error } = await supabase
    .from("cycles")
    .select("id")
    .eq("is_active", true)
    .single();

  if (error || !data) {
    throw new AppError({
      message: "No active cycle",
      userMessage: "No existe un ciclo activo. Configúralo desde el panel de admin.",
      status: 400,
      details: error,
    });
  }

  return data.id;
}

export async function assertApplicantCanEditCycle({
  supabase,
  cycleId,
}: {
  supabase: SupabaseClient<Database>;
  cycleId: string;
}) {
  const { data: cycle, error } = await supabase
    .from("cycles")
    .select("id, stage1_close_at")
    .eq("id", cycleId)
    .maybeSingle();

  if (error || !cycle) {
    throw new AppError({
      message: "Cycle missing for applicant edit policy",
      userMessage: "No se encontró el proceso de selección.",
      status: 404,
      details: error,
    });
  }

  if (isPast(cycle.stage1_close_at)) {
    throw new AppError({
      message: "Applicant edit window closed",
      userMessage:
        "La etapa ya cerró y no puedes editar esta postulación. Contacta al comité si necesitas soporte.",
      status: 422,
    });
  }
}

export async function getApplicationsForAdmin(
  supabase: SupabaseClient<Database>,
  cycleId?: string,
) {
  let query = supabase
    .from("applications")
    .select("id, applicant_id, cycle_id, stage_code, status, payload, files, validation_notes, updated_at")
    .order("updated_at", { ascending: false });

  if (cycleId) {
    query = query.eq("cycle_id", cycleId);
  }

  const { data, error } = await query;

  if (error) {
    throw new AppError({
      message: "Failed to fetch applications",
      userMessage: "No se pudo cargar la lista de postulaciones.",
      status: 500,
      details: error,
    });
  }

  return (data ?? []) as ApplicationRow[];
}

export async function getApplicantApplication(
  supabase: SupabaseClient<Database>,
  applicantId: string,
  cycleId?: string,
): Promise<ApplicationRow | null> {
  const targetCycleId = cycleId ?? (await getActiveCycleId(supabase));

  const { data, error } = await supabase
    .from("applications")
    .select("*")
    .eq("applicant_id", applicantId)
    .eq("cycle_id", targetCycleId)
    .maybeSingle();

  if (error) {
    throw new AppError({
      message: "Failed to fetch applicant application",
      userMessage: "No pudimos cargar tu postulación en este momento.",
      status: 500,
      details: error,
    });
  }

  return (data as ApplicationRow | null) ?? null;
}

export async function upsertApplicantApplication({
  supabase,
  applicantId,
  payload,
  cycleId,
}: {
  supabase: SupabaseClient<Database>;
  applicantId: string;
  payload: StagePayload;
  cycleId?: string;
}): Promise<ApplicationRow> {
  const targetCycleId = cycleId ?? (await getActiveCycleId(supabase));

  const { data: cycleExists, error: cycleError } = await supabase
    .from("cycles")
    .select("id, stage1_close_at")
    .eq("id", targetCycleId)
    .maybeSingle();

  if (cycleError || !cycleExists) {
    throw new AppError({
      message: "Cycle not found",
      userMessage: "No se encontró el proceso de selección elegido.",
      status: 404,
      details: cycleError,
    });
  }

  if (isPast(cycleExists.stage1_close_at)) {
    throw new AppError({
      message: "Applicant attempted draft save after stage close",
      userMessage:
        "La etapa ya cerró y no puedes editar esta postulación. Contacta al comité si necesitas soporte.",
      status: 422,
    });
  }

  const existing = await getApplicantApplication(supabase, applicantId, targetCycleId);

  if (!existing) {
    const { count, error: countError } = await supabase
      .from("applications")
      .select("id", { count: "exact", head: true })
      .eq("applicant_id", applicantId);

    if (countError) {
      throw new AppError({
        message: "Failed to check applicant application limit",
        userMessage: "No se pudo validar tu límite de postulaciones.",
        status: 500,
        details: countError,
      });
    }

    if ((count ?? 0) >= 3) {
      throw new AppError({
        message: "Applicant application limit reached",
        userMessage: "Solo puedes tener hasta 3 postulaciones en distintos procesos.",
        status: 422,
      });
    }

    const { data, error } = await supabase
      .from("applications")
      .insert({
        applicant_id: applicantId,
        cycle_id: targetCycleId,
        payload,
      })
      .select("*")
      .single();

    if (error || !data) {
      throw new AppError({
        message: "Failed to create application",
        userMessage: "No se pudo guardar tu borrador.",
        status: 500,
        details: error,
      });
    }

    return data as ApplicationRow;
  }

  const { data, error } = await supabase
    .from("applications")
    .update({ payload, updated_at: new Date().toISOString() })
    .eq("id", existing.id)
    .select("*")
    .single();

  if (error || !data) {
    throw new AppError({
      message: "Failed to update application",
      userMessage: "No se pudo actualizar tu borrador.",
      status: 500,
      details: error,
    });
  }

  return data as ApplicationRow;
}

export async function submitApplication({
  supabase,
  applicationId,
}: {
  supabase: SupabaseClient<Database>;
  applicationId: string;
}): Promise<ApplicationRow> {
  const { data, error } = await supabase
    .from("applications")
    .update({ status: "submitted", updated_at: new Date().toISOString() })
    .eq("id", applicationId)
    .select("*")
    .single();

  if (error || !data) {
    throw new AppError({
      message: "Submit failed",
      userMessage: "No se pudo enviar tu postulación.",
      status: 500,
      details: error,
    });
  }

  return data as ApplicationRow;
}

export async function validateApplication({
  supabase,
  applicationId,
  status,
  notes,
}: {
  supabase: SupabaseClient<Database>;
  applicationId: string;
  status: Extract<ApplicationStatus, "eligible" | "ineligible">;
  notes: string;
}): Promise<ApplicationRow> {
  const { data, error } = await supabase
    .from("applications")
    .update({
      status,
      validation_notes: notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", applicationId)
    .select("*")
    .single();

  if (error || !data) {
    throw new AppError({
      message: "Validation failed",
      userMessage: "No se pudo registrar la validación.",
      status: 500,
      details: error,
    });
  }

  return data as ApplicationRow;
}

export async function transitionApplication({
  supabase,
  applicationId,
  toStage,
  reason,
  actorId,
}: {
  supabase: SupabaseClient<Database>;
  applicationId: string;
  toStage: StageCode;
  reason: string;
  actorId: string;
}): Promise<ApplicationRow> {
  const { data: application, error: loadError } = await supabase
    .from("applications")
    .select("id, stage_code, status")
    .eq("id", applicationId)
    .single();

  if (loadError || !application) {
    throw new AppError({
      message: "Application missing",
      userMessage: "No se encontró la postulación seleccionada.",
      status: 404,
      details: loadError,
    });
  }

  const canMove = canTransition({
    fromStage: application.stage_code,
    toStage,
    status: application.status,
  });

  if (!canMove) {
    throw new AppError({
      message: "Invalid transition",
      userMessage:
        "La postulación no cumple condiciones para este cambio de etapa.",
      status: 422,
      details: {
        from: application.stage_code,
        to: toStage,
        status: application.status,
      },
    });
  }

  const now = new Date().toISOString();
  const { data: updated, error: updateError } = await supabase
    .from("applications")
    .update({ stage_code: toStage, updated_at: now })
    .eq("id", applicationId)
    .select("*")
    .single();

  if (updateError || !updated) {
    throw new AppError({
      message: "Failed updating stage",
      userMessage: "No se pudo cambiar la etapa de la postulación.",
      status: 500,
      details: updateError,
    });
  }

  const { error: transitionError } = await supabase.from("stage_transitions").insert({
    application_id: applicationId,
    from_stage: application.stage_code,
    to_stage: toStage,
    reason,
    actor_id: actorId,
  });

  if (transitionError) {
    throw new AppError({
      message: "Failed saving transition",
      userMessage: "Se cambió la etapa, pero no se pudo registrar el historial.",
      status: 500,
      details: transitionError,
    });
  }

  return updated as ApplicationRow;
}

/* -------------------------------------------------------------------------- */
/*  Bulk stage transitions                                                    */
/* -------------------------------------------------------------------------- */

export type BulkTransitionInput = {
  cycleId: string;
  fromStage: StageCode;
  toStage: StageCode;
  statusFilter: ApplicationStatus[];
  reason: string;
};

export type BulkTransitionResult = {
  transitioned: number;
  skipped: number;
  errors: Array<{ applicationId: string; error: string }>;
};

/**
 * Move all applications matching the filter from one stage to another.
 * Each application is validated individually against DB-driven transition rules.
 * Uses Promise.allSettled so one failure doesn't block the rest.
 */
export async function bulkTransitionApplications({
  supabase,
  input,
  actorId,
}: {
  supabase: SupabaseClient<Database>;
  input: BulkTransitionInput;
  actorId: string;
}): Promise<BulkTransitionResult> {
  /* ---- Load transition rules from cycle stage templates ---- */
  const { data: templates, error: templateError } = await supabase
    .from("cycle_stage_templates")
    .select("stage_code, sort_order")
    .eq("cycle_id", input.cycleId)
    .order("sort_order", { ascending: true });

  if (templateError) {
    throw new AppError({
      message: "Failed to load stage templates for bulk transition",
      userMessage: "No se pudieron cargar las etapas del proceso.",
      status: 500,
      details: templateError,
    });
  }

  const rules = deriveTransitionRules(templates ?? []);

  /* ---- Fetch matching applications ---- */
  const { data: applications, error: fetchError } = await supabase
    .from("applications")
    .select("id, stage_code, status")
    .eq("cycle_id", input.cycleId)
    .eq("stage_code", input.fromStage)
    .in("status", input.statusFilter);

  if (fetchError) {
    throw new AppError({
      message: "Failed to fetch applications for bulk transition",
      userMessage: "No se pudieron cargar las postulaciones.",
      status: 500,
      details: fetchError,
    });
  }

  if (!applications || applications.length === 0) {
    return { transitioned: 0, skipped: 0, errors: [] };
  }

  /* ---- Transition each application individually ---- */
  const now = new Date().toISOString();
  const result: BulkTransitionResult = { transitioned: 0, skipped: 0, errors: [] };

  const outcomes = await Promise.allSettled(
    applications.map(async (app) => {
      const canMove = canTransitionWithRules({
        fromStage: app.stage_code,
        toStage: input.toStage,
        status: app.status as ApplicationStatus,
        rules,
      });

      if (!canMove) {
        return { type: "skipped" as const, applicationId: app.id };
      }

      // Update stage
      const { error: updateError } = await supabase
        .from("applications")
        .update({ stage_code: input.toStage, updated_at: now })
        .eq("id", app.id);

      if (updateError) {
        return {
          type: "error" as const,
          applicationId: app.id,
          error: updateError.message,
        };
      }

      // Record transition
      const { error: transitionError } = await supabase
        .from("stage_transitions")
        .insert({
          application_id: app.id,
          from_stage: app.stage_code,
          to_stage: input.toStage,
          reason: input.reason,
          actor_id: actorId,
        });

      if (transitionError) {
        return {
          type: "error" as const,
          applicationId: app.id,
          error: `Stage updated but transition record failed: ${transitionError.message}`,
        };
      }

      return { type: "transitioned" as const, applicationId: app.id };
    }),
  );

  for (const outcome of outcomes) {
    if (outcome.status === "rejected") {
      result.errors.push({
        applicationId: "unknown",
        error: String(outcome.reason),
      });
      continue;
    }

    const value = outcome.value;
    if (value.type === "transitioned") {
      result.transitioned += 1;
    } else if (value.type === "skipped") {
      result.skipped += 1;
    } else {
      result.errors.push({
        applicationId: value.applicationId,
        error: value.error,
      });
    }
  }

  return result;
}

export async function importExamCsv({
  supabase: _supabase,
  csv,
  actorId: _actorId,
}: {
  supabase: SupabaseClient<Database>;
  csv: string;
  actorId: string;
}) {
  void _supabase;
  void _actorId;

  const parsed = Papa.parse<{ applicant_email: string; score: string; passed: string }>(csv, {
    header: true,
    skipEmptyLines: true,
  });

  if (parsed.errors.length > 0) {
    throw new AppError({
      message: "CSV parse failed",
      userMessage: "El CSV tiene un formato inválido.",
      status: 400,
      details: parsed.errors,
    });
  }

  const rows = parsed.data;
  const results: { imported: number; skipped: number } = { imported: 0, skipped: 0 };

  for (const row of rows) {
    const email = row.applicant_email?.trim().toLowerCase();
    const score = Number(row.score);
    const passedRaw = row.passed?.trim().toLowerCase();
    const hasValidPassedFlag = passedRaw === "true" || passedRaw === "false";

    if (!email || !Number.isFinite(score) || !hasValidPassedFlag) {
      results.skipped += 1;
      continue;
    }

    results.imported += 1;
  }

  return results;
}
