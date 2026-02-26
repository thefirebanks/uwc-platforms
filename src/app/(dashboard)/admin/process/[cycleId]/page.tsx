import { redirect } from "next/navigation";
import { AdminDashboard } from "@/components/admin-dashboard";
import { getSessionProfileOrRedirect } from "@/lib/server/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Application, CycleStageTemplate, SelectionProcess } from "@/types/domain";

export default async function AdminProcessPage({
  params,
  searchParams,
}: {
  params: Promise<{ cycleId: string }>;
  searchParams?: Promise<{ section?: string | string[] }>;
}) {
  const profile = await getSessionProfileOrRedirect();

  if (profile.role !== "admin") {
    redirect("/applicant");
  }

  const { cycleId } = await params;
  const resolvedSearchParams = (await searchParams) ?? {};
  const supabase = await getSupabaseServerClient();
  const { data: cycle } = await supabase.from("cycles").select("*").eq("id", cycleId).maybeSingle();

  if (!cycle) {
    redirect("/admin/processes");
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
      initialWorkspaceSection={
        Array.isArray(resolvedSearchParams.section)
          ? "process_config"
          : resolvedSearchParams.section === "stages"
            ? "stages"
            : resolvedSearchParams.section === "applications"
              ? "applications"
              : resolvedSearchParams.section === "communications"
                ? "communications"
                : "process_config"
      }
    />
  );
}
