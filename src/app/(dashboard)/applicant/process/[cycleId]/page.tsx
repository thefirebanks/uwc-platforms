import { redirect } from "next/navigation";
import { ApplicantApplicationForm } from "@/components/applicant-application-form";
import { getSessionProfileOrRedirect } from "@/lib/server/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolveDocumentStageFields } from "@/lib/stages/stage-field-fallback";
import type {
  Application,
  CycleStageField,
  RecommendationRequest,
  SelectionProcess,
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
  const [{ data: cycle }, { data: application }, { data: stageFields }] = await Promise.all([
    supabase.from("cycles").select("*").eq("id", cycleId).maybeSingle(),
    supabase
      .from("applications")
      .select("*")
      .eq("applicant_id", profile.id)
      .eq("cycle_id", cycleId)
      .maybeSingle(),
    supabase
      .from("cycle_stage_fields")
      .select("*")
      .eq("cycle_id", cycleId)
      .eq("stage_code", "documents")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
  ]);

  if (!cycle) {
    redirect("/applicant");
  }

  const existingApplication = (application as Application | null) ?? null;
  const adminSupabase = getSupabaseAdminClient();
  const { data: recommenderRows } = existingApplication?.id
    ? await adminSupabase
        .from("recommendation_requests")
        .select("*")
        .eq("application_id", existingApplication.id)
        .order("created_at", { ascending: false })
    : { data: [] as RecommendationRequest[] };
  const initialRecommenders = ((recommenderRows as RecommendationRequest[] | null) ?? []).map((row) => ({
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
  const resolvedStageFields = resolveDocumentStageFields({
    cycleId,
    fields: ((stageFields as CycleStageField[] | null) ?? []),
  });

  return (
    <ApplicantApplicationForm
      existingApplication={existingApplication}
      cycleId={cycleId}
      cycleName={(cycle as SelectionProcess).name}
      stageFields={resolvedStageFields}
      stageCloseAt={(cycle as SelectionProcess).stage1_close_at ?? null}
      initialRecommenders={initialRecommenders}
    />
  );
}
