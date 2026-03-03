import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors/app-error";
import { buildFallbackStageFields, resolveDocumentStageFields } from "@/lib/stages/stage-field-fallback";
import { validateRequiredFiles, validateStagePayload } from "@/lib/stages/form-schema";
import type { Database } from "@/types/supabase";
import type { ApplicationStatus, CycleStageField } from "@/types/domain";

type ApplicationRow = Database["public"]["Tables"]["applications"]["Row"];
type RecommendationRow = Database["public"]["Tables"]["recommendation_requests"]["Row"];
type StageSectionRow = Database["public"]["Tables"]["stage_sections"]["Row"];

export type Stage1BlockerCode =
  | "missing_required_fields"
  | "missing_required_files"
  | "recommendations_not_requested"
  | "recommendations_pending"
  | "not_submitted";

export type Stage1Blocker = {
  code: Stage1BlockerCode;
  label: string;
  detail: string;
  count: number;
};

export type Stage1FunnelApplication = {
  applicationId: string;
  status: ApplicationStatus;
  blockers: Stage1Blocker[];
  blockerCodes: Stage1BlockerCode[];
  isReadyForReview: boolean;
};

export type Stage1FunnelSummary = {
  totalApplications: number;
  readyForReview: number;
  blocked: number;
  notSubmitted: number;
  missingRequiredFields: number;
  missingRequiredFiles: number;
  recommendationsNotRequested: number;
  recommendationsPending: number;
};

function getVisibleRecommenderSectionIds(sections: StageSectionRow[]) {
  return new Set(
    sections
      .filter((section) => section.section_key === "recommenders" && section.is_visible)
      .map((section) => section.id),
  );
}

function areRecommendationsRequired(fields: CycleStageField[], sections: StageSectionRow[]) {
  const recommenderSectionIds = getVisibleRecommenderSectionIds(sections);
  if (recommenderSectionIds.size === 0) {
    return false;
  }

  return fields.some((field) => {
    const sectionId = field.section_id ?? null;
    return field.is_required && typeof sectionId === "string" && recommenderSectionIds.has(sectionId);
  });
}

function summarizeFieldLabels(labels: string[]) {
  if (labels.length === 0) {
    return "Sin detalle.";
  }

  const visible = labels.slice(0, 3);
  const suffix = labels.length > 3 ? ` y ${labels.length - 3} más` : "";
  return `${visible.join(", ")}${suffix}`;
}

export function deriveStage1Blockers({
  application,
  fields,
  sections,
  recommendations,
}: {
  application: Pick<ApplicationRow, "id" | "status" | "payload" | "files">;
  fields: CycleStageField[];
  sections: Array<Pick<StageSectionRow, "id" | "section_key" | "is_visible">>;
  recommendations: Array<
    Pick<RecommendationRow, "role" | "status" | "submitted_at" | "admin_received_at">
  >;
}): Stage1Blocker[] {
  const blockers: Stage1Blocker[] = [];
  const activeFields = fields.filter((field) => field.is_active);

  const payloadValidation = validateStagePayload({
    fields: activeFields.filter((field) => field.field_type !== "file"),
    payload: (application.payload as Record<string, unknown>) ?? {},
    skipFileValidation: true,
  });

  const missingFieldKeys = Object.keys(payloadValidation.errors);
  if (missingFieldKeys.length > 0) {
    const missingFieldLabels = activeFields
      .filter((field) => missingFieldKeys.includes(field.field_key))
      .map((field) => field.field_label);

    blockers.push({
      code: "missing_required_fields",
      label: "Campos obligatorios incompletos",
      detail: summarizeFieldLabels(missingFieldLabels),
      count: missingFieldLabels.length,
    });
  }

  const fileValidation = validateRequiredFiles({
    fields: activeFields,
    files: (application.files as Record<string, string | { path?: string }>) ?? {},
  });

  if (!fileValidation.isValid) {
    blockers.push({
      code: "missing_required_files",
      label: "Documentos obligatorios faltantes",
      detail: summarizeFieldLabels(fileValidation.missingFields.map((field) => field.field_label)),
      count: fileValidation.missingFields.length,
    });
  }

  if (areRecommendationsRequired(activeFields, sections as StageSectionRow[])) {
    const mentorRequested = recommendations.some((row) => row.role === "mentor");
    const friendRequested = recommendations.some((row) => row.role === "friend");
    const mentorComplete = recommendations.some(
      (row) =>
        row.role === "mentor" &&
        (row.status === "submitted" || Boolean(row.submitted_at) || Boolean(row.admin_received_at)),
    );
    const friendComplete = recommendations.some(
      (row) =>
        row.role === "friend" &&
        (row.status === "submitted" || Boolean(row.submitted_at) || Boolean(row.admin_received_at)),
    );

    if (!mentorRequested || !friendRequested) {
      const missingRoles = [
        !mentorRequested ? "mentor" : null,
        !friendRequested ? "amigo" : null,
      ].filter((value): value is string => Boolean(value));

      blockers.push({
        code: "recommendations_not_requested",
        label: "Recomendaciones no solicitadas",
        detail: `Falta solicitar: ${missingRoles.join(", ")}`,
        count: missingRoles.length,
      });
    } else if (!mentorComplete || !friendComplete) {
      const pendingRoles = [
        !mentorComplete ? "mentor" : null,
        !friendComplete ? "amigo" : null,
      ].filter((value): value is string => Boolean(value));

      blockers.push({
        code: "recommendations_pending",
        label: "Recomendaciones pendientes",
        detail: `Pendiente de recibir: ${pendingRoles.join(", ")}`,
        count: pendingRoles.length,
      });
    }
  }

  if (application.status === "draft") {
    blockers.push({
      code: "not_submitted",
      label: "Postulación no enviada",
      detail: "La postulacion sigue en borrador.",
      count: 1,
    });
  }

  return blockers;
}

export function buildStage1FunnelSummary(entries: Stage1FunnelApplication[]): Stage1FunnelSummary {
  return entries.reduce<Stage1FunnelSummary>(
    (summary, entry) => {
      summary.totalApplications += 1;
      if (entry.isReadyForReview) {
        summary.readyForReview += 1;
      } else {
        summary.blocked += 1;
      }
      if (entry.blockerCodes.includes("not_submitted")) {
        summary.notSubmitted += 1;
      }
      if (entry.blockerCodes.includes("missing_required_fields")) {
        summary.missingRequiredFields += 1;
      }
      if (entry.blockerCodes.includes("missing_required_files")) {
        summary.missingRequiredFiles += 1;
      }
      if (entry.blockerCodes.includes("recommendations_not_requested")) {
        summary.recommendationsNotRequested += 1;
      }
      if (entry.blockerCodes.includes("recommendations_pending")) {
        summary.recommendationsPending += 1;
      }
      return summary;
    },
    {
      totalApplications: 0,
      readyForReview: 0,
      blocked: 0,
      notSubmitted: 0,
      missingRequiredFields: 0,
      missingRequiredFiles: 0,
      recommendationsNotRequested: 0,
      recommendationsPending: 0,
    },
  );
}

async function loadDocumentStageFields({
  supabase,
  cycleId,
}: {
  supabase: SupabaseClient<Database>;
  cycleId: string;
}) {
  const { data, error } = await supabase
    .from("cycle_stage_fields")
    .select("*")
    .eq("cycle_id", cycleId)
    .eq("stage_code", "documents")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    throw new AppError({
      message: "Failed loading Stage 1 fields for funnel tracking",
      userMessage: "No se pudo calcular el funnel de Stage 1.",
      status: 500,
      details: error,
    });
  }

  const rows = ((data as CycleStageField[] | null) ?? []).map((row) => ({
    ...row,
    section_id: row.section_id ?? null,
  }));

  if (rows.length === 0) {
    return buildFallbackStageFields(cycleId);
  }

  return resolveDocumentStageFields({
    cycleId,
    fields: rows,
  });
}

export async function getStage1Funnel({
  supabase,
  cycleId,
}: {
  supabase: SupabaseClient<Database>;
  cycleId: string;
}) {
  const [fields, sectionsResult, applicationsResult] = await Promise.all([
    loadDocumentStageFields({ supabase, cycleId }),
    supabase
      .from("stage_sections")
      .select("id, section_key, is_visible")
      .eq("cycle_id", cycleId)
      .eq("stage_code", "documents"),
    supabase
      .from("applications")
      .select("id, status, payload, files")
      .eq("cycle_id", cycleId)
      .eq("stage_code", "documents"),
  ]);

  if (sectionsResult.error || applicationsResult.error) {
    throw new AppError({
      message: "Failed loading Stage 1 funnel data",
      userMessage: "No se pudo cargar el resumen de Stage 1.",
      status: 500,
      details: {
        sectionsError: sectionsResult.error,
        applicationsError: applicationsResult.error,
      },
    });
  }

  const sections = (sectionsResult.data ?? []) as StageSectionRow[];
  const applications = (applicationsResult.data ?? []) as Array<
    Pick<ApplicationRow, "id" | "status" | "payload" | "files">
  >;

  if (applications.length === 0) {
    return {
      summary: buildStage1FunnelSummary([]),
      applications: [] as Stage1FunnelApplication[],
    };
  }

  const applicationIds = applications.map((application) => application.id);
  const { data: recommendationRows, error: recommendationError } = await supabase
    .from("recommendation_requests")
    .select("application_id, role, status, submitted_at, admin_received_at, invalidated_at")
    .in("application_id", applicationIds)
    .is("invalidated_at", null);

  if (recommendationError) {
    throw new AppError({
      message: "Failed loading Stage 1 recommendations for funnel tracking",
      userMessage: "No se pudo calcular el estado de recomendaciones.",
      status: 500,
      details: recommendationError,
    });
  }

  const recommendationMap = new Map<
    string,
    Array<Pick<RecommendationRow, "role" | "status" | "submitted_at" | "admin_received_at">>
  >();

  for (const row of recommendationRows ?? []) {
    const current = recommendationMap.get(row.application_id) ?? [];
    current.push({
      role: row.role,
      status: row.status,
      submitted_at: row.submitted_at,
      admin_received_at: row.admin_received_at,
    });
    recommendationMap.set(row.application_id, current);
  }

  const funnelApplications = applications.map((application) => {
    const blockers = deriveStage1Blockers({
      application,
      fields,
      sections,
      recommendations: recommendationMap.get(application.id) ?? [],
    });

    return {
      applicationId: application.id,
      status: application.status as ApplicationStatus,
      blockers,
      blockerCodes: blockers.map((blocker) => blocker.code),
      isReadyForReview: blockers.length === 0 && application.status !== "draft",
    };
  });

  return {
    summary: buildStage1FunnelSummary(funnelApplications),
    applications: funnelApplications,
  };
}
