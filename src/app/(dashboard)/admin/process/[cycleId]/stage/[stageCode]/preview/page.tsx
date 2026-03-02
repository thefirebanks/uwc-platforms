import { redirect } from "next/navigation";
import { AdminStageFormPreview } from "@/components/admin-stage-form-preview";
import { getSessionProfileOrRedirect } from "@/lib/server/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { CycleStageField, CycleStageTemplate, StageSection } from "@/types/domain";
import { findTemplateByIdOrCode } from "@/lib/stages/templates";
import { resolveDocumentStageFields } from "@/lib/stages/stage-field-fallback";

export default async function AdminStagePreviewPage({
  params,
}: {
  params: Promise<{ cycleId: string; stageCode: string }>;
}) {
  const profile = await getSessionProfileOrRedirect();

  if (profile.role !== "admin") {
    redirect("/applicant");
  }

  const { cycleId, stageCode } = await params;
  const supabase = await getSupabaseServerClient();
  const [{ data: cycleData }, { data: templatesData }] = await Promise.all([
    supabase.from("cycles").select("id, name").eq("id", cycleId).maybeSingle(),
    supabase
      .from("cycle_stage_templates")
      .select("*")
      .eq("cycle_id", cycleId)
      .order("sort_order", { ascending: true }),
  ]);

  if (!cycleData) {
    redirect("/admin/processes");
  }

  const templates = (templatesData as CycleStageTemplate[] | null) ?? [];
  const selectedTemplate = findTemplateByIdOrCode(templates, stageCode);

  if (!selectedTemplate) {
    redirect(`/admin/process/${cycleId}`);
  }

  const [{ data: fieldsData }, { data: sectionsData }] = await Promise.all([
    supabase
      .from("cycle_stage_fields")
      .select("*")
      .eq("cycle_id", cycleId)
      .eq("stage_code", selectedTemplate.stage_code)
      .order("sort_order", { ascending: true }),
    supabase
      .from("stage_sections")
      .select("*")
      .eq("cycle_id", cycleId)
      .eq("stage_code", selectedTemplate.stage_code)
      .order("sort_order", { ascending: true }),
  ]);

  const resolvedFields =
    selectedTemplate.stage_code === "documents"
      ? resolveDocumentStageFields({ cycleId, fields: (fieldsData as CycleStageField[] | null) ?? [] })
      : (fieldsData as CycleStageField[] | null) ?? [];

  return (
    <AdminStageFormPreview
      cycleId={cycleId}
      stageId={selectedTemplate.id}
      cycleName={(cycleData as { name: string }).name}
      stageCode={selectedTemplate.stage_code}
      stageLabel={selectedTemplate.stage_label}
      fields={resolvedFields}
      sections={(sectionsData as StageSection[] | null) ?? []}
    />
  );
}
