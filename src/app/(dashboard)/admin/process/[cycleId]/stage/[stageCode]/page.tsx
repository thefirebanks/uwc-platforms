import { redirect } from "next/navigation";
import { StageConfigEditor } from "@/components/stage-config-editor";
import { getSessionProfileOrRedirect } from "@/lib/server/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type {
  CycleStageField,
  CycleStageTemplate,
  StageAutomationTemplate,
  StageSection,
} from "@/types/domain";
import {
  buildDefaultStageAutomationTemplates,
  findTemplateByIdOrCode,
} from "@/lib/stages/templates";
import { resolveDocumentStageFields } from "@/lib/stages/stage-field-fallback";

export default async function StageConfigPage({
  params,
  searchParams,
}: {
  params: Promise<{ cycleId: string; stageCode: string }>;
  searchParams?: Promise<{ tab?: string | string[] }>;
}) {
  const profile = await getSessionProfileOrRedirect();

  if (profile.role !== "admin") {
    redirect("/applicant");
  }

  const { cycleId, stageCode } = await params;
  const resolvedSearchParams = (await searchParams) ?? {};
  const requestedTab = Array.isArray(resolvedSearchParams.tab)
    ? resolvedSearchParams.tab[0]
    : resolvedSearchParams.tab;

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
  const selectedTemplate = findTemplateByIdOrCode(templates, stageCode);

  if (!selectedTemplate) {
    redirect(`/admin/process/${cycleId}`);
  }

  const resolvedStageCode = selectedTemplate.stage_code;

  const [{ data: fieldsData }, { data: automationsData }, { data: sectionsData }] = await Promise.all([
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
    supabase
      .from("stage_sections")
      .select("*")
      .eq("cycle_id", cycleId)
      .eq("stage_code", resolvedStageCode)
      .order("sort_order", { ascending: true }),
  ]);

  const resolvedFields =
    resolvedStageCode === "documents"
      ? resolveDocumentStageFields({ cycleId, fields: (fieldsData as CycleStageField[] | null) ?? [] })
      : (fieldsData as CycleStageField[] | null) ?? [];

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
      stageLabel={selectedTemplate.stage_label}
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
      initialFields={resolvedFields}
      initialAutomations={(automationsData as StageAutomationTemplate[] | null) ?? fallbackAutomations}
      initialOcrPromptTemplate={selectedTemplate.ocr_prompt_template ?? null}
      initialStageAdminConfig={selectedTemplate.admin_config ?? null}
      initialSections={(sectionsData as StageSection[] | null) ?? []}
      initialTab={
        requestedTab === "settings" ||
        requestedTab === "automations" ||
        requestedTab === "communications" ||
        requestedTab === "prompt_studio" ||
        requestedTab === "stats"
          ? requestedTab
          : "editor"
      }
    />
  );
}
