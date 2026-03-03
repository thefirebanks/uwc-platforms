import { redirect } from "next/navigation";
import { ApplicantApplicationForm } from "@/components/applicant-application-form";
import { getSessionProfileOrRedirect } from "@/lib/server/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolveDocumentStageFields } from "@/lib/stages/stage-field-fallback";
import { parseStageAdminConfig } from "@/lib/stages/stage-admin-config";
import type {
  Application,
  CycleStageField,
  CycleStageTemplate,
  RecommendationRequest,
  SelectionProcess,
  StageSection,
} from "@/types/domain";

export default async function ApplicantProcessPage({
  params,
}: {
  params: Promise<{ cycleId: string }>;
}) {
  const profile = await getSessionProfileOrRedirect();

  if (profile.role !== "applicant") {
    redirect("/admin");
  }

  const { cycleId } = await params;
  const supabase = await getSupabaseServerClient();

  // Load cycle + existing application first to determine current stage_code
  const [{ data: cycle }, { data: application }] = await Promise.all([
    supabase.from("cycles").select("*").eq("id", cycleId).maybeSingle(),
    supabase
      .from("applications")
      .select("*")
      .eq("applicant_id", profile.id)
      .eq("cycle_id", cycleId)
      .maybeSingle(),
  ]);

  if (!cycle) {
    redirect("/applicant");
  }

  const existingApplication = (application as Application | null) ?? null;
  const currentStageCode = existingApplication?.stage_code ?? "documents";

  // Load stage fields, sections, and template for the current stage
  const [{ data: stageFields }, { data: stageSections }, { data: stageTemplate }] =
    await Promise.all([
      supabase
        .from("cycle_stage_fields")
        .select("*")
        .eq("cycle_id", cycleId)
        .eq("stage_code", currentStageCode)
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      supabase
        .from("stage_sections")
        .select("*")
        .eq("cycle_id", cycleId)
        .eq("stage_code", currentStageCode)
        .order("sort_order", { ascending: true }),
      supabase
        .from("cycle_stage_templates")
        .select("stage_label, due_at, admin_config")
        .eq("cycle_id", cycleId)
        .eq("stage_code", currentStageCode)
        .maybeSingle(),
    ]);

  const { data: recommenderRows } =
    existingApplication?.id && currentStageCode === "documents"
      ? await getSupabaseAdminClient()
          .from("recommendation_requests")
          .select("*")
          .eq("application_id", existingApplication.id)
          .order("created_at", { ascending: false })
      : { data: [] as RecommendationRequest[] };

  const initialRecommenders = (
    (recommenderRows as RecommendationRequest[] | null) ?? []
  ).map((row) => ({
    id: row.id,
    role: row.role,
    email: row.recommender_email,
    status: row.status,
    submittedAt: row.submitted_at,
    inviteSentAt: row.invite_sent_at,
    openedAt: row.opened_at,
    startedAt: row.started_at,
    reminderCount: row.reminder_count,
    lastReminderAt: row.last_reminder_at,
    invalidatedAt: row.invalidated_at,
    createdAt: row.created_at,
  }));

  const resolvedStageFields =
    currentStageCode === "documents"
      ? resolveDocumentStageFields({
          cycleId,
          fields: (stageFields as CycleStageField[] | null) ?? [],
        })
      : (stageFields as CycleStageField[] | null) ?? [];

  const template = stageTemplate as Pick<CycleStageTemplate, "stage_label" | "due_at" | "admin_config"> | null;
  const parsedAdminConfig = parseStageAdminConfig(template?.admin_config ?? null);

  return (
    <ApplicantApplicationForm
      existingApplication={existingApplication}
      cycleId={cycleId}
      cycleName={(cycle as SelectionProcess).name}
      stageCode={currentStageCode}
      stageLabel={template?.stage_label ?? undefined}
      stageInstructions={parsedAdminConfig.description ?? undefined}
      stageFields={resolvedStageFields}
      stageCloseAt={template?.due_at ?? (cycle as SelectionProcess).stage1_close_at ?? null}
      initialRecommenders={initialRecommenders}
      sections={(stageSections as StageSection[] | null) ?? []}
    />
  );
}
