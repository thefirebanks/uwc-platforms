import { redirect } from "next/navigation";
import { StageConfigEditor } from "@/components/stage-config-editor";
import { getSessionProfileOrRedirect } from "@/lib/server/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type {
  CycleStageField,
  CycleStageTemplate,
  StageAutomationTemplate,
} from "@/types/domain";
import {
  buildDefaultCycleStageFields,
  buildDefaultStageAutomationTemplates,
} from "@/lib/stages/templates";

export default async function StageConfigPage({
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
  const [{ data: cycleData }, { data: templateRows }] = await Promise.all([
    supabase
      .from("cycles")
      .select("*")
      .eq("id", cycleId)
      .maybeSingle(),
    supabase
      .from("cycle_stage_templates")
      .select("*")
      .eq("cycle_id", cycleId)
      .order("sort_order", { ascending: true }),
  ]);
  const cycle = cycleData as {
    name: string;
    stage1_open_at: string | null;
    stage1_close_at: string | null;
    stage2_open_at: string | null;
    stage2_close_at: string | null;
  } | null;

  if (!cycle) {
    redirect("/admin/processes");
  }

  const templates = (templateRows as CycleStageTemplate[] | null) ?? [];
  const selectedTemplate =
    templates.find((template) => template.id === stageCode) ??
    templates.find((template) => template.stage_code === stageCode) ??
    null;

  if (!selectedTemplate) {
    redirect(`/admin/process/${cycleId}`);
  }

  const resolvedStageCode = selectedTemplate.stage_code;

  const [{ data: templateData }, { data: fieldsData }, { data: automationsData }] = await Promise.all([
    Promise.resolve({ data: selectedTemplate }),
    supabase
      .from("cycle_stage_fields")
      .select("*")
      .eq("cycle_id", cycleId)
      .eq("stage_code", resolvedStageCode)
      .order("sort_order", { ascending: true }),
    supabase
      .from("stage_automation_templates")
      .select("*")
      .eq("cycle_id", cycleId)
      .eq("stage_code", resolvedStageCode)
      .order("created_at", { ascending: true }),
  ]);

  const fallbackFields =
    resolvedStageCode === "documents"
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

  const fallbackAutomations =
    resolvedStageCode === "documents"
      ? buildDefaultStageAutomationTemplates({ cycleId }).map((automation, index) => ({
          id: `fallback-automation-${index + 1}`,
          cycle_id: automation.cycle_id,
          stage_code: automation.stage_code,
          trigger_event: automation.trigger_event,
          channel: automation.channel ?? "email",
          is_enabled: automation.is_enabled ?? false,
          template_subject: automation.template_subject,
          template_body: automation.template_body,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }))
      : [];

  return (
    <StageConfigEditor
      cycleId={cycleId}
      cycleName={cycle.name}
      stageId={selectedTemplate.id}
      stageCode={resolvedStageCode}
      stageLabel={(templateData as CycleStageTemplate | null)?.stage_label ?? resolvedStageCode}
      stageOpenAt={
        resolvedStageCode === "documents"
          ? cycle.stage1_open_at
          : resolvedStageCode === "exam_placeholder"
            ? cycle.stage2_open_at
            : null
      }
      stageCloseAt={
        resolvedStageCode === "documents"
          ? cycle.stage1_close_at
          : resolvedStageCode === "exam_placeholder"
            ? cycle.stage2_close_at
            : null
      }
      stageTemplates={templates}
      initialFields={(fieldsData as CycleStageField[] | null) ?? fallbackFields}
      initialAutomations={(automationsData as StageAutomationTemplate[] | null) ?? fallbackAutomations}
      initialOcrPromptTemplate={(templateData as CycleStageTemplate | null)?.ocr_prompt_template ?? null}
      initialStageAdminConfig={(templateData as CycleStageTemplate | null)?.admin_config ?? null}
    />
  );
}
