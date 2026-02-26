import { redirect } from "next/navigation";
import { AdminStageFormPreview } from "@/components/admin-stage-form-preview";
import { getSessionProfileOrRedirect } from "@/lib/server/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { CycleStageField, CycleStageTemplate } from "@/types/domain";
import { buildDefaultCycleStageFields } from "@/lib/stages/templates";
import { parseStageAdminConfig } from "@/lib/stages/stage-admin-config";

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
  const selectedTemplate =
    templates.find((template) => template.id === stageCode) ??
    templates.find((template) => template.stage_code === stageCode) ??
    null;

  if (!selectedTemplate) {
    redirect(`/admin/process/${cycleId}`);
  }

  const { data: fieldsData } = await supabase
    .from("cycle_stage_fields")
    .select("*")
    .eq("cycle_id", cycleId)
    .eq("stage_code", selectedTemplate.stage_code)
    .order("sort_order", { ascending: true });

  const fallbackFields =
    selectedTemplate.stage_code === "documents"
      ? buildDefaultCycleStageFields({ cycleId }).map((field, index) => ({
          id: `fallback-field-${index + 1}`,
          cycle_id: field.cycle_id,
          stage_code: field.stage_code,
          field_key: field.field_key,
          field_label: field.field_label,
          field_type: field.field_type,
          is_required: field.is_required ?? false,
          placeholder: field.placeholder ?? null,
          help_text: field.help_text ?? null,
          sort_order: field.sort_order ?? index + 1,
          is_active: field.is_active ?? true,
          created_at: new Date().toISOString(),
        }))
      : [];
  const parsedAdminConfig = parseStageAdminConfig(selectedTemplate.admin_config ?? null);

  return (
    <AdminStageFormPreview
      cycleId={cycleId}
      stageId={selectedTemplate.id}
      cycleName={(cycleData as { name: string }).name}
      stageCode={selectedTemplate.stage_code}
      stageLabel={selectedTemplate.stage_label}
      fields={(fieldsData as CycleStageField[] | null) ?? fallbackFields}
      customSections={parsedAdminConfig.customSections}
      fieldSectionAssignments={parsedAdminConfig.fieldSectionAssignments}
    />
  );
}
