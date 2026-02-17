import { redirect } from "next/navigation";
import { AdminDashboard } from "@/components/admin-dashboard";
import { getSessionProfileOrRedirect } from "@/lib/server/session";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Application } from "@/types/domain";

export default async function AdminPage() {
  const profile = await getSessionProfileOrRedirect();

  if (profile.role !== "admin") {
    redirect("/applicant");
  }

  const supabase = getSupabaseAdminClient();
  const { data: applications } = await supabase
    .from("applications")
    .select("*")
    .order("updated_at", { ascending: false });

  return <AdminDashboard initialApplications={(applications as Application[] | null) ?? []} />;
}
