import { redirect } from "next/navigation";
import { AdminProcessesDashboard } from "@/components/admin-processes-dashboard";
import { getSessionProfileOrRedirect } from "@/lib/server/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { SelectionProcess } from "@/types/domain";

export default async function AdminPage() {
  const profile = await getSessionProfileOrRedirect();

  if (profile.role !== "admin") {
    redirect("/applicant");
  }

  const supabase = await getSupabaseServerClient();
  const { data: cycles } = await supabase.from("cycles").select("*").order("created_at", {
    ascending: false,
  });
  const { data: applicationRows } = await supabase.from("applications").select("cycle_id");

  const cycleCounts = new Map<string, number>();
  for (const row of applicationRows ?? []) {
    cycleCounts.set(row.cycle_id, (cycleCounts.get(row.cycle_id) ?? 0) + 1);
  }

  const processSummaries = ((cycles as SelectionProcess[] | null) ?? []).map((cycle) => ({
    ...cycle,
    applicationCount: cycleCounts.get(cycle.id) ?? 0,
  }));

  return <AdminProcessesDashboard initialProcesses={processSummaries} />;
}
