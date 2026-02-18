import { redirect } from "next/navigation";
import { StageConfigEditor } from "@/components/stage-config-editor";
import { getSessionProfileOrRedirect } from "@/lib/server/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type {
  CycleStageField,
  CycleStageTemplate,
  StageAutomationTemplate,
  StageCode,
} from "@/types/domain";
import {
  buildDefaultCycleStageFields,
  buildDefaultStageAutomationTemplates,
} from "@/lib/stages/templates";

const validStages: StageCode[] = ["documents", "exam_placeholder"];

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
  if (!validStages.includes(stageCode as StageCode)) {
    redirect(`/admin/process/${cycleId}`);
  }
  const parsedStageCode = stageCode as StageCode;

  const supabase = await getSupabaseServerClient();
  const { data: cycleData } = await supabase.from("cycles").select("*").eq("id", cycleId).maybeSingle();
  const cycle = cycleData as { name: string } | null;

  if (!cycle) {
    redirect("/admin");
  }

  const { data: templateData } = await supabase
    .from("cycle_stage_templates")
    .select("*")
    .eq("cycle_id", cycleId)
    .eq("stage_code", parsedStageCode)
    .maybeSingle();

  const { data: fieldsData } = await supabase
    .from("cycle_stage_fields")
    .select("*")
    .eq("cycle_id", cycleId)
    .eq("stage_code", parsedStageCode)
    .order("sort_order", { ascending: true });

  const { data: automationsData } = await supabase
    .from("stage_automation_templates")
    .select("*")
    .eq("cycle_id", cycleId)
    .eq("stage_code", parsedStageCode)
    .order("created_at", { ascending: true });

  const fallbackFields =
    parsedStageCode === "documents"
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
    parsedStageCode === "documents"
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
      stageCode={parsedStageCode}
      stageLabel={(templateData as CycleStageTemplate | null)?.stage_label ?? parsedStageCode}
      initialFields={(fieldsData as CycleStageField[] | null) ?? fallbackFields}
      initialAutomations={(automationsData as StageAutomationTemplate[] | null) ?? fallbackAutomations}
    />
  );
}
