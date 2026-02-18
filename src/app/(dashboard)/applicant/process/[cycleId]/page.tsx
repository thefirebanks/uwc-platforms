import { redirect } from "next/navigation";
import { ApplicantApplicationForm } from "@/components/applicant-application-form";
import { getSessionProfileOrRedirect } from "@/lib/server/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Application, SelectionProcess } from "@/types/domain";

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

  return (
    <ApplicantApplicationForm
      existingApplication={(application as Application | null) ?? null}
      cycleId={cycleId}
      cycleName={(cycle as SelectionProcess).name}
    />
  );
}
