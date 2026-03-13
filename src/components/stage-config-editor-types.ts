import type {
  CycleStageField,
  EligibilityRubricCriterion,
  StageFieldAiParserConfig,
  StageAutomationTemplate,
} from "@/types/domain";
import type {
  OcrExpectedOutputField,
  OcrExpectedOutputFieldType,
} from "@/lib/ocr/expected-output-schema";

export type EditableField = CycleStageField & {
  localId: string;
};

export type EditableAutomation = StageAutomationTemplate & {
  localId: string;
};

export type SectionPlaceholderDraft = {
  localId: string;
  title: string;
  sectionKey: string;
};

export type StageEditorSettingsDraft = {
  stageName: string;
  description: string;
  openDate: string;
  closeDate: string;
  previousStageRequirement: string;
  blockIfPreviousNotMet: boolean;
  ocrPromptTemplate: string;
  eligibilityRubricJson: string;
  rubricBlueprintV1Json: string;
  rubricMetaJson: string;
};

export type RubricEditorMode = "guided" | "json";

export type StageAdminConfigPayload = {
  stageName?: string;
  description?: string;
  openDate?: string | null;
  closeDate?: string | null;
  previousStageRequirement?: string;
  blockIfPreviousNotMet?: boolean;
  eligibilityRubric?: import("@/types/domain").EligibilityRubricConfig | null;
  rubricBlueprintV1?: import("@/types/domain").RubricBlueprintV1 | null;
  rubricMeta?: import("@/types/domain").RubricMeta | null;
};

export type FieldAiParserDraft = StageFieldAiParserConfig & {
  modelId: string | null;
  promptTemplate: string | null;
  systemPrompt: string | null;
  expectedOutputFields: OcrExpectedOutputField[];
};

export type EditorSection = {
  id: string;
  sectionKey: string;
  title: string;
  description: string;
  fields: EditableField[];
};

export const DEFAULT_OCR_PROMPT_TEMPLATE =
  "Analiza el documento y entrega una validación preliminar para comité. Resume hallazgos clave sobre legibilidad, coherencia y posibles señales de alteración.";

export const RUBRIC_OUTCOME_OPTIONS: Array<{
  value: EligibilityRubricCriterion["onFail"];
  label: string;
}> = [
  { value: "eligible", label: "eligible" },
  { value: "not_eligible", label: "not_eligible" },
  { value: "needs_review", label: "needs_review" },
];

export const RUBRIC_KIND_OPTIONS: Array<{
  value: EligibilityRubricCriterion["kind"];
  label: string;
}> = [
  { value: "field_present", label: "Campo presente" },
  { value: "all_present", label: "Todos los campos presentes" },
  { value: "any_present", label: "Al menos un campo presente" },
  { value: "field_in", label: "Campo dentro de lista permitida" },
  { value: "number_between", label: "Rango numérico" },
  { value: "file_uploaded", label: "Archivo cargado" },
  { value: "recommendations_complete", label: "Recomendaciones completas" },
  { value: "ocr_confidence", label: "Confianza mínima OCR" },
  { value: "ocr_field_in", label: "OCR valor permitido" },
  { value: "ocr_field_not_in", label: "OCR valor observado (revisión)" },
  { value: "field_matches_ocr", label: "Campo coincide con OCR" },
  {
    value: "file_upload_count_between",
    label: "Cantidad de archivos en rango",
  },
  { value: "any_of", label: "Cumple al menos una condición" },
];

export const OCR_OUTPUT_FIELD_TYPE_LABELS: Record<
  OcrExpectedOutputFieldType,
  string
> = {
  text: "Texto",
  number: "Número entero",
  decimal: "Número decimal",
  date: "Fecha",
  boolean: "Sí/No",
};
