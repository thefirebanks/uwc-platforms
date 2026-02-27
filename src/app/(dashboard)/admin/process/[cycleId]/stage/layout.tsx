import { redirect } from "next/navigation";
import { AdminStageSidebar } from "@/components/admin-stage-sidebar";
import { getSessionProfileOrRedirect } from "@/lib/server/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { CycleStageTemplate } from "@/types/domain";

export default async function StageLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ cycleId: string }>;
}) {
  const profile = await getSessionProfileOrRedirect();

  if (profile.role !== "admin") {
    redirect("/applicant");
  }

  const { cycleId } = await params;

  const supabase = await getSupabaseServerClient();
  const [{ data: cycleData }, { data: templateRows }] = await Promise.all([
    supabase.from("cycles").select("name").eq("id", cycleId).maybeSingle(),
    supabase
      .from("cycle_stage_templates")
      .select("*")
      .eq("cycle_id", cycleId)
      .order("sort_order", { ascending: true }),
  ]);

  if (!cycleData) {
    redirect("/admin/processes");
  }

  const templates = (templateRows as CycleStageTemplate[] | null) ?? [];

  return (
    <>
      <AdminStageSidebar cycleId={cycleId} cycleName={cycleData.name} stages={templates} />
      {children}
    </>
  );
}
