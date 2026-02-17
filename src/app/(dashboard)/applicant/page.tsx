import { redirect } from "next/navigation";
import { ApplicantApplicationForm } from "@/components/applicant-application-form";
import { getSessionProfileOrRedirect } from "@/lib/server/session";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Application } from "@/types/domain";

export default async function ApplicantPage() {
  const profile = await getSessionProfileOrRedirect();

  if (profile.role !== "applicant") {
    redirect("/admin");
  }

  const supabase = getSupabaseAdminClient();
  const { data: application } = await supabase
    .from("applications")
    .select("*")
    .eq("applicant_id", profile.id)
    .maybeSingle();

  return <ApplicantApplicationForm existingApplication={(application as Application | null) ?? null} />;
}
