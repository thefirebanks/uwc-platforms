import { redirect } from "next/navigation";
import { getSessionProfileOrRedirect } from "@/lib/server/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { CycleStageTemplate } from "@/types/domain";

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
  const requestedSection = Array.isArray(resolvedSearchParams.section)
    ? resolvedSearchParams.section[0]
    : resolvedSearchParams.section;

  if (requestedSection === "applications") {
    redirect(`/admin/candidates?cycleId=${cycleId}`);
  }
  if (requestedSection === "export") {
    redirect(`/admin/candidates?cycleId=${cycleId}&tab=export`);
  }
  if (requestedSection === "communications") {
    redirect(`/admin/process/${cycleId}/stage/documents?tab=communications`);
  }
  if (requestedSection === "ocr_testbed") {
    redirect(`/admin/process/${cycleId}/stage/documents?tab=prompt_studio`);
  }
  const supabase = await getSupabaseServerClient();
  const { data: templateRows } = await supabase
    .from("cycle_stage_templates")
    .select("id, stage_code, sort_order")
    .eq("cycle_id", cycleId)
    .order("sort_order", { ascending: true });
  const templates = (templateRows as Pick<CycleStageTemplate, "id" | "stage_code" | "sort_order">[] | null) ?? [];
  const preferredTemplate =
    templates.find((template) => template.stage_code === "documents") ?? templates[0];

  if (!preferredTemplate) {
    redirect("/admin/processes");
  }

  redirect(`/admin/process/${cycleId}/stage/${preferredTemplate.id}`);
}
