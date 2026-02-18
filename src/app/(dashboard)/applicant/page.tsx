import { redirect } from "next/navigation";
import {
  ApplicantProcessesDashboard,
  type ApplicantApplicationSummary,
} from "@/components/applicant-processes-dashboard";
import { getSessionProfileOrRedirect } from "@/lib/server/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { SelectionProcess } from "@/types/domain";

export default async function ApplicantPage() {
  const profile = await getSessionProfileOrRedirect();

  if (profile.role !== "applicant") {
    redirect("/admin");
  }

  const supabase = await getSupabaseServerClient();
  const { data: cycles } = await supabase.from("cycles").select("*").order("created_at", {
    ascending: false,
  });
  const { data: applications } = await supabase
    .from("applications")
    .select("id, cycle_id, status, stage_code, updated_at")
    .eq("applicant_id", profile.id)
    .order("updated_at", { ascending: false });

  return (
    <ApplicantProcessesDashboard
      processes={(cycles as SelectionProcess[] | null) ?? []}
      applications={(applications as ApplicantApplicationSummary[] | null) ?? []}
      maxApplications={3}
    />
  );
}
