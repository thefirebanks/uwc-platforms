import { redirect } from "next/navigation";
import { ApplicantApplicationForm } from "@/components/applicant-application-form";
import { getSessionProfileOrRedirect } from "@/lib/server/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type {
  Application,
  CycleStageField,
  CycleStageTemplate,
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

  const { data: cycle } = await supabase.from("cycles").select("*").eq("id", cycleId).maybeSingle();

  if (!cycle) {
    redirect("/applicant");
  }

  const { data: application } = await supabase
    .from("applications")
    .select("*")
    .eq("applicant_id", profile.id)
    .eq("cycle_id", cycleId)
    .maybeSingle();
  const { data: templates } = await supabase
    .from("cycle_stage_templates")
    .select("*")
    .eq("cycle_id", cycleId)
    .order("sort_order", { ascending: true });
  const { data: stageFields } = await supabase
    .from("cycle_stage_fields")
    .select("*")
    .eq("cycle_id", cycleId)
    .eq("stage_code", "documents")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  return (
    <ApplicantApplicationForm
      existingApplication={(application as Application | null) ?? null}
      cycleId={cycleId}
      cycleName={(cycle as SelectionProcess).name}
      cycleTemplates={(templates as CycleStageTemplate[] | null) ?? []}
      stageFields={(stageFields as CycleStageField[] | null) ?? []}
    />
  );
}
