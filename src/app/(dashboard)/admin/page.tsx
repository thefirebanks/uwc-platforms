import { redirect } from "next/navigation";
import { AdminDashboard } from "@/components/admin-dashboard";
import { getSessionProfileOrRedirect } from "@/lib/server/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Application } from "@/types/domain";

export default async function AdminPage() {
  const profile = await getSessionProfileOrRedirect();

  if (profile.role !== "admin") {
    redirect("/applicant");
  }

  const supabase = await getSupabaseServerClient();
  const { data: applications } = await supabase
    .from("applications")
    .select("*")
    .order("updated_at", { ascending: false });

  return <AdminDashboard initialApplications={(applications as Application[] | null) ?? []} />;
}
