import Papa from "papaparse";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApplicationInput } from "@/lib/validation/application";
import { canTransition } from "@/lib/stages/transition";
import { AppError } from "@/lib/errors/app-error";
import type { Database } from "@/types/supabase";
import type { ApplicationStatus, StageCode } from "@/types/domain";

type ApplicationRow = Database["public"]["Tables"]["applications"]["Row"];
type RecommendationRow = Database["public"]["Tables"]["recommendation_requests"]["Row"];

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

export async function getApplicationsForAdmin(supabase: SupabaseClient<Database>) {
  const { data, error } = await supabase
    .from("applications")
    .select("id, applicant_id, stage_code, status, payload, validation_notes, updated_at")
    .order("updated_at", { ascending: false });

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
): Promise<ApplicationRow | null> {
  const { data, error } = await supabase
    .from("applications")
    .select("*")
    .eq("applicant_id", applicantId)
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
}: {
  supabase: SupabaseClient<Database>;
  applicantId: string;
  payload: ApplicationInput;
}): Promise<ApplicationRow> {
  const cycleId = await getActiveCycleId(supabase);

  const existing = await getApplicantApplication(supabase, applicantId);

  if (!existing) {
    const { data, error } = await supabase
      .from("applications")
      .insert({
        applicant_id: applicantId,
        cycle_id: cycleId,
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

export async function createRecommendationRequests({
  supabase,
  applicationId,
  requesterId,
  emails,
}: {
  supabase: SupabaseClient<Database>;
  applicationId: string;
  requesterId: string;
  emails: string[];
}): Promise<RecommendationRow[]> {
  const rows = emails.map((email) => ({
    application_id: applicationId,
    requester_id: requesterId,
    recommender_email: email.trim().toLowerCase(),
    token: crypto.randomUUID(),
  }));

  const { data, error } = await supabase
    .from("recommendation_requests")
    .insert(rows)
    .select("*");

  if (error || !data) {
    throw new AppError({
      message: "Recommendation creation failed",
      userMessage: "No se pudieron registrar los recomendadores.",
      status: 500,
      details: error,
    });
  }

  return data as RecommendationRow[];
}

export async function importExamCsv({
  supabase,
  csv,
  actorId,
}: {
  supabase: SupabaseClient<Database>;
  csv: string;
  actorId: string;
}) {
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

    if (!email) {
      results.skipped += 1;
      continue;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (!profile) {
      results.skipped += 1;
      continue;
    }

    const { data: app } = await supabase
      .from("applications")
      .select("id")
      .eq("applicant_id", profile.id)
      .maybeSingle();

    if (!app) {
      results.skipped += 1;
      continue;
    }

    const score = Number(row.score);
    const passed = row.passed?.trim().toLowerCase() === "true";

    const { error } = await supabase.from("exam_imports").insert({
      application_id: app.id,
      applicant_email: email,
      score,
      passed,
      imported_by: actorId,
    });

    if (error) {
      results.skipped += 1;
      continue;
    }

    results.imported += 1;
  }

  return results;
}
