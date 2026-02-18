import type { Database } from "@/types/supabase";
import type { StageFieldType } from "@/types/domain";

type CycleRow = Database["public"]["Tables"]["cycles"]["Row"];
type CycleTemplateInsert = Database["public"]["Tables"]["cycle_stage_templates"]["Insert"];
type StageFieldInsert = Database["public"]["Tables"]["cycle_stage_fields"]["Insert"];
type StageAutomationInsert = Database["public"]["Tables"]["stage_automation_templates"]["Insert"];

export type StageFieldPreset = {
  fieldKey: string;
  fieldLabel: string;
  fieldType: StageFieldType;
  isRequired: boolean;
  placeholder: string | null;
  helpText: string | null;
  sortOrder: number;
};

export const DEFAULT_DOCUMENT_STAGE_FIELD_PRESETS: StageFieldPreset[] = [
  {
    fieldKey: "fullName",
    fieldLabel: "Nombre completo",
    fieldType: "short_text",
    isRequired: true,
    placeholder: "Nombres y apellidos",
    helpText: "Tal como figura en tu DNI o pasaporte",
    sortOrder: 1,
  },
  {
    fieldKey: "dateOfBirth",
    fieldLabel: "Fecha de nacimiento",
    fieldType: "date",
    isRequired: true,
    placeholder: null,
    helpText: "Formato: AAAA-MM-DD",
    sortOrder: 2,
  },
  {
    fieldKey: "nationality",
    fieldLabel: "Nacionalidad",
    fieldType: "short_text",
    isRequired: true,
    placeholder: "Peruana",
    helpText: null,
    sortOrder: 3,
  },
  {
    fieldKey: "schoolName",
    fieldLabel: "Colegio",
    fieldType: "short_text",
    isRequired: true,
    placeholder: "Nombre del colegio",
    helpText: null,
    sortOrder: 4,
  },
  {
    fieldKey: "gradeAverage",
    fieldLabel: "Promedio (0-20)",
    fieldType: "number",
    isRequired: true,
    placeholder: "Ejemplo: 16.5",
    helpText: null,
    sortOrder: 5,
  },
  {
    fieldKey: "essay",
    fieldLabel: "Ensayo personal",
    fieldType: "long_text",
    isRequired: true,
    placeholder: "Comparte tu motivación para UWC",
    helpText: "Mínimo 50 caracteres",
    sortOrder: 6,
  },
  {
    fieldKey: "identificationDocument",
    fieldLabel: "Documento de identificación",
    fieldType: "file",
    isRequired: true,
    placeholder: null,
    helpText: "Sube DNI, pasaporte o carné",
    sortOrder: 7,
  },
];

export function buildDefaultCycleStageTemplates({
  cycleId,
  stage1CloseAt,
  stage2CloseAt,
}: {
  cycleId: CycleRow["id"];
  stage1CloseAt: CycleRow["stage1_close_at"];
  stage2CloseAt: CycleRow["stage2_close_at"];
}): CycleTemplateInsert[] {
  return [
    {
      cycle_id: cycleId,
      stage_code: "documents",
      stage_label: "Stage 1: Documentos",
      milestone_label: "Recepción y validación documental",
      due_at: stage1CloseAt,
      sort_order: 1,
    },
    {
      cycle_id: cycleId,
      stage_code: "exam_placeholder",
      stage_label: "Stage 2: Examen (placeholder)",
      milestone_label: "Evaluación externa y consolidación",
      due_at: stage2CloseAt,
      sort_order: 2,
    },
  ];
}

export function buildDefaultCycleStageFields({
  cycleId,
}: {
  cycleId: CycleRow["id"];
}): StageFieldInsert[] {
  return DEFAULT_DOCUMENT_STAGE_FIELD_PRESETS.map((preset) => ({
    cycle_id: cycleId,
    stage_code: "documents",
    field_key: preset.fieldKey,
    field_label: preset.fieldLabel,
    field_type: preset.fieldType,
    is_required: preset.isRequired,
    placeholder: preset.placeholder,
    help_text: preset.helpText,
    sort_order: preset.sortOrder,
    is_active: true,
  }));
}

export function buildDefaultStageAutomationTemplates({
  cycleId,
}: {
  cycleId: CycleRow["id"];
}): StageAutomationInsert[] {
  return [
    {
      cycle_id: cycleId,
      stage_code: "documents",
      trigger_event: "application_submitted",
      channel: "email",
      is_enabled: true,
      template_subject: "Confirmación de postulación - {{cycle_name}}",
      template_body:
        "Hola {{full_name}}, recibimos tu postulación para {{cycle_name}}. Código de postulación: {{application_id}}.",
    },
    {
      cycle_id: cycleId,
      stage_code: "documents",
      trigger_event: "stage_result",
      channel: "email",
      is_enabled: false,
      template_subject: "Actualización de tu postulación - {{cycle_name}}",
      template_body:
        "Hola {{full_name}}, tu estado actual es {{application_status}} en {{cycle_name}}.",
    },
  ];
}
