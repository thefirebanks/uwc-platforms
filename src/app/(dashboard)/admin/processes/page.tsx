import { redirect } from "next/navigation";
import { AdminProcessesDashboard } from "@/components/admin-processes-dashboard";
import { getSessionProfileOrRedirect } from "@/lib/server/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { CycleStageTemplate, SelectionProcess } from "@/types/domain";

export default async function AdminProcessesPage() {
  const profile = await getSessionProfileOrRedirect();

  if (profile.role !== "admin") {
    redirect("/applicant");
  }

  const supabase = await getSupabaseServerClient();
  const [{ data: cycles }, { data: applicationRows }, { data: templateRows }] = await Promise.all([
    supabase.from("cycles").select("*").order("created_at", {
      ascending: false,
    }),
    supabase.from("applications").select("cycle_id"),
    supabase
      .from("cycle_stage_templates")
      .select("id, cycle_id, stage_code, sort_order")
      .order("sort_order", { ascending: true }),
  ]);

  const cycleCounts = new Map<string, number>();
  for (const row of applicationRows ?? []) {
    cycleCounts.set(row.cycle_id, (cycleCounts.get(row.cycle_id) ?? 0) + 1);
  }

  const primaryTemplateIdByCycle = new Map<string, string>();
  for (const template of (templateRows as Pick<CycleStageTemplate, "id" | "cycle_id" | "stage_code" | "sort_order">[] | null) ?? []) {
    if (template.stage_code === "documents") {
      primaryTemplateIdByCycle.set(template.cycle_id, template.id);
    } else if (!primaryTemplateIdByCycle.has(template.cycle_id)) {
      primaryTemplateIdByCycle.set(template.cycle_id, template.id);
    }
  }

  const processSummaries = ((cycles as SelectionProcess[] | null) ?? []).map((cycle) => ({
    ...cycle,
    applicationCount: cycleCounts.get(cycle.id) ?? 0,
    primaryStageEditorId: primaryTemplateIdByCycle.get(cycle.id) ?? null,
  }));

  return <AdminProcessesDashboard initialProcesses={processSummaries} />;
}
