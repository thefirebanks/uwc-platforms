import { redirect } from "next/navigation";
import { ApplicantApplicationForm } from "@/components/applicant-application-form";
import { getSessionProfileOrRedirect } from "@/lib/server/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type {
  Application,
  CycleStageField,
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
  const { data: recommenderRows } = existingApplication?.id
    ? await supabase
        .from("recommendation_requests")
        .select("recommender_email")
        .eq("application_id", existingApplication.id)
    : { data: [] as Array<{ recommender_email: string | null }> };

  const initialRecommenders = Array.from(
    new Set(
      (recommenderRows ?? [])
        .map((row) => row.recommender_email?.trim().toLowerCase())
        .filter((email): email is string => Boolean(email)),
    ),
  );

  return (
    <ApplicantApplicationForm
      existingApplication={existingApplication}
      cycleId={cycleId}
      cycleName={(cycle as SelectionProcess).name}
      stageFields={(stageFields as CycleStageField[] | null) ?? []}
      stageCloseAt={(cycle as SelectionProcess).stage1_close_at ?? null}
      initialRecommenders={initialRecommenders}
    />
  );
}
