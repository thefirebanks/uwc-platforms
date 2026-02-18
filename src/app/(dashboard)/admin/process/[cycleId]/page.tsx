import { redirect } from "next/navigation";
import { AdminDashboard } from "@/components/admin-dashboard";
import { getSessionProfileOrRedirect } from "@/lib/server/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Application, CycleStageTemplate, SelectionProcess } from "@/types/domain";

export default async function AdminProcessPage({
  params,
}: {
  params: Promise<{ cycleId: string }>;
}) {
  const profile = await getSessionProfileOrRedirect();

  if (profile.role !== "admin") {
    redirect("/applicant");
  }

  const { cycleId } = await params;
  const supabase = await getSupabaseServerClient();
  const { data: cycle } = await supabase.from("cycles").select("*").eq("id", cycleId).maybeSingle();

  if (!cycle) {
    redirect("/admin");
  }

  const [{ data: applications }, { data: templates }] = await Promise.all([
    supabase
      .from("applications")
      .select("*")
      .eq("cycle_id", cycleId)
      .order("updated_at", { ascending: false }),
    supabase
      .from("cycle_stage_templates")
      .select("*")
      .eq("cycle_id", cycleId)
      .order("sort_order", { ascending: true }),
  ]);

  return (
    <AdminDashboard
      initialApplications={(applications as Application[] | null) ?? []}
      cycleTemplates={(templates as CycleStageTemplate[] | null) ?? []}
      cycle={cycle as SelectionProcess}
    />
  );
}
