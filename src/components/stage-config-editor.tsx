"use client";

import { useRouter } from "next/navigation";
import {
  startTransition,
  useEffect,
  useLayoutEffect,
  useDeferredValue,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import type {
  CycleStageField,
  CycleStageTemplate,
  EligibilityRubricConfig,
  EligibilityRubricCriterion,
  RubricBlueprintV1,
  RubricMeta,
  StageFieldAiParserConfig,
  StageAutomationTemplate,
  StageCode,
  StageSection,
} from "@/types/domain";
import { ErrorCallout } from "@/components/error-callout";
import { AdminCommunicationsCenter } from "@/components/admin-communications-center";
import { AdminOcrTestbed } from "@/components/admin-ocr-testbed";
import { StageStatsPanel } from "@/components/stage-stats-panel";
import { StageAutomationManager } from "@/components/stage-automation-manager";
import { FieldHint } from "@/components/field-hint";
import {
  fetchApi,
  fetchApiResponse,
  toNormalizedApiError,
} from "@/lib/client/api-client";
import { normalizeFieldKey } from "@/lib/stages/form-schema";
import {
  OCR_EXPECTED_OUTPUT_TYPES,
  buildSchemaTemplateFromExpectedOutputFields,
  normalizeExpectedOutputFields,
  normalizeOcrOutputKey,
  parseExpectedOutputFieldsFromSchemaTemplate,
  type OcrExpectedOutputField,
  type OcrExpectedOutputFieldType,
} from "@/lib/ocr/expected-output-schema";
import {
  normalizeFieldAiReferenceFiles,
  type FieldAiReferenceFile,
} from "@/lib/ocr/field-ai-parser";
import {
  DEFAULT_OCR_EXTRACTION_INSTRUCTIONS,
  DEFAULT_OCR_PROMPT,
  DEFAULT_OCR_SCHEMA_TEMPLATE,
  DEFAULT_OCR_SYSTEM_PROMPT,
  MODEL_REGISTRY,
} from "@/lib/server/ocr";
import {
  buildUwcStageOneRubricFromDraft,
  createRubricMeta,
  guessUwcStageOnePresetDraft,
  parseRubricBlueprintV1,
  tryHydrateBlueprintFromRubric,
  type UwcStageOnePresetDraft,
} from "@/lib/rubric/default-rubric-presets";
import {
  getDefaultEligibilityRubricConfig,
  parseEligibilityRubricConfig,
  validateEligibilityRubricConfig,
} from "@/lib/rubric/eligibility-rubric";
import { toDateInputValue } from "@/lib/utils/date-formatters";

interface ApiError {
  message: string;
  errorId?: string;
}

type EditableField = CycleStageField & {
  localId: string;
};

type EditableAutomation = StageAutomationTemplate & {
  localId: string;
};

type SectionPlaceholderDraft = {
  localId: string;
  title: string;
  sectionKey: string;
};

type StageEditorSettingsDraft = {
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

type RubricEditorMode = "guided" | "json";
type StageAdminConfigPayload = {
  stageName?: string;
  description?: string;
  openDate?: string | null;
  closeDate?: string | null;
  previousStageRequirement?: string;
  blockIfPreviousNotMet?: boolean;
  eligibilityRubric?: EligibilityRubricConfig | null;
  rubricBlueprintV1?: RubricBlueprintV1 | null;
  rubricMeta?: RubricMeta | null;
};

type FieldAiParserDraft = StageFieldAiParserConfig & {
  modelId: string | null;
  promptTemplate: string | null;
  systemPrompt: string | null;
  expectedOutputFields: OcrExpectedOutputField[];
};

type EditorSection = {
  id: string;
  sectionKey: string;
  title: string;
  description: string;
  fields: EditableField[];
};

const DEFAULT_OCR_PROMPT_TEMPLATE =
  "Analiza el documento y entrega una validación preliminar para comité. Resume hallazgos clave sobre legibilidad, coherencia y posibles señales de alteración.";

const RUBRIC_OUTCOME_OPTIONS: Array<{
  value: EligibilityRubricCriterion["onFail"];
  label: string;
}> = [
  { value: "eligible", label: "eligible" },
  { value: "not_eligible", label: "not_eligible" },
  { value: "needs_review", label: "needs_review" },
];

const RUBRIC_KIND_OPTIONS: Array<{
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

const OCR_OUTPUT_FIELD_TYPE_LABELS: Record<OcrExpectedOutputFieldType, string> =
  {
    text: "Texto",
    number: "Número entero",
    decimal: "Número decimal",
    date: "Fecha",
    boolean: "Sí/No",
  };

function parseCommaSeparatedList(raw: string) {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const candidate of raw.split(",")) {
    const trimmed = candidate.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    values.push(trimmed);
  }
  return values;
}

function formatCommaSeparatedList(values: string[] | undefined) {
  return (values ?? []).join(", ");
}

function formatFileSize(bytes: number | null | undefined) {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes <= 0) {
    return "Tamano desconocido";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function parseCommaSeparatedNumbers(raw: string) {
  const seen = new Set<number>();
  const values: number[] = [];

  for (const candidate of raw.split(/[,\s;]+/)) {
    const trimmed = candidate.trim();
    if (!trimmed) {
      continue;
    }

    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed) || seen.has(parsed)) {
      continue;
    }

    seen.add(parsed);
    values.push(parsed);
  }

  return values;
}

function presetDraftFromBlueprint(
  blueprint: RubricBlueprintV1,
): UwcStageOnePresetDraft {
  return {
    idDocumentFileKeys: blueprint.mappings.idDocumentFileKeys,
    gradesDocumentFileKeys: blueprint.mappings.gradesDocumentFileKeys,
    topThirdProofFileKey: blueprint.mappings.topThirdProofFileKey,
    applicantNameFieldKey: blueprint.mappings.applicantNameFieldKey,
    averageGradeFieldKey: blueprint.mappings.averageGradeFieldKey,
    signedAuthorizationFileKey: blueprint.mappings.signedAuthorizationFileKey,
    applicantPhotoFileKey: blueprint.mappings.applicantPhotoFileKey,
    ocrNamePath: blueprint.mappings.ocrPaths.idName,
    ocrBirthYearPath: blueprint.mappings.ocrPaths.birthYear,
    ocrDocumentTypePath: blueprint.mappings.ocrPaths.documentType,
    ocrDocumentIssuePath: blueprint.mappings.ocrPaths.documentIssue,
    allowedBirthYears: blueprint.policy.allowedBirthYears,
    minAverageGrade: blueprint.policy.minAverageGrade,
    recommendationCompleteness: blueprint.policy.recommendationCompleteness,
    recommendationRoles: ["mentor", "friend"],
    minRecommendationResponses: blueprint.policy.recommendationMinAnswers ?? 0,
    gradesCombinationRule: blueprint.policy.gradesCombinationRule,
    idExceptionRule: blueprint.policy.idExceptionRule,
    limitGradesDocumentToSingleUpload:
      blueprint.policy.gradesCombinationRule !== "allow_multiple",
  };
}

function createUniqueCriterionId(
  kind: EligibilityRubricCriterion["kind"],
  existingCriteria: EligibilityRubricCriterion[],
) {
  const existingIds = new Set(
    existingCriteria.map((criterion) => criterion.id),
  );
  const base = kind.replace(/[^a-zA-Z0-9]+/g, "_").toLowerCase();
  let counter = existingCriteria.length + 1;
  let candidate = `${base}_${counter}`;
  while (existingIds.has(candidate)) {
    counter += 1;
    candidate = `${base}_${counter}`;
  }
  return candidate;
}

function createDefaultRubricCriterion({
  kind,
  existingCriteria,
  defaultFieldKey,
  defaultFileKey,
  defaultNumberFieldKey,
}: {
  kind: EligibilityRubricCriterion["kind"];
  existingCriteria: EligibilityRubricCriterion[];
  defaultFieldKey: string;
  defaultFileKey: string;
  defaultNumberFieldKey: string;
}): EligibilityRubricCriterion {
  const labelByKind = new Map(
    RUBRIC_KIND_OPTIONS.map((option) => [option.value, option.label] as const),
  );
  const id = createUniqueCriterionId(kind, existingCriteria);
  const base: EligibilityRubricCriterion = {
    id,
    label: labelByKind.get(kind) ?? kind,
    kind,
    onFail: "not_eligible",
    onMissingData: "needs_review",
  };

  switch (kind) {
    case "field_present":
      return { ...base, fieldKey: defaultFieldKey };
    case "all_present":
      return { ...base, fieldKeys: [defaultFieldKey] };
    case "any_present":
      return { ...base, fieldKeys: [defaultFieldKey] };
    case "field_in":
      return {
        ...base,
        fieldKey: defaultFieldKey,
        allowedValues: ["valor_aceptado"],
        caseSensitive: false,
      };
    case "number_between":
      return {
        ...base,
        fieldKey: defaultNumberFieldKey,
        min: 0,
      };
    case "file_uploaded":
      return {
        ...base,
        fileKey: defaultFileKey,
        onFail: "needs_review",
      };
    case "recommendations_complete":
      return {
        ...base,
        roles: ["mentor", "friend"],
        requireRequested: true,
      };
    case "ocr_confidence":
      return {
        ...base,
        fileKey: defaultFileKey,
        minConfidence: 0.8,
        onFail: "needs_review",
      };
    case "ocr_field_in":
      return {
        ...base,
        fileKey: defaultFileKey,
        jsonPath: "documentType",
        allowedValues: ["dni"],
        caseSensitive: false,
        onFail: "needs_review",
      };
    case "ocr_field_not_in":
      return {
        ...base,
        fileKey: defaultFileKey,
        jsonPath: "documentIssue",
        disallowedValues: ["expired"],
        caseSensitive: false,
        onFail: "needs_review",
      };
    case "field_matches_ocr":
      return {
        ...base,
        fieldKey: defaultFieldKey,
        fileKey: defaultFileKey,
        jsonPath: "fullName",
        caseSensitive: false,
        normalizeWhitespace: true,
        onFail: "needs_review",
      };
    case "file_upload_count_between":
      return {
        ...base,
        fileKeys: [defaultFileKey],
        minCount: 1,
      };
    case "any_of":
      return {
        ...base,
        conditions: [
          {
            kind: "field_present",
            fieldKey: defaultFieldKey,
          },
        ],
      };
    default:
      return base;
  }
}

function createDefaultFieldAiParserConfig(): FieldAiParserDraft {
  const expectedOutputFields = parseExpectedOutputFieldsFromSchemaTemplate(
    DEFAULT_OCR_SCHEMA_TEMPLATE,
  );

  return {
    enabled: true,
    modelId: null,
    promptTemplate: null,
    systemPrompt: null,
    extractionInstructions: DEFAULT_OCR_EXTRACTION_INSTRUCTIONS,
    expectedSchemaTemplate: DEFAULT_OCR_SCHEMA_TEMPLATE,
    referenceFiles: [],
    expectedOutputFields,
    strictSchema: true,
  };
}

function normalizeFieldAiParserConfig(
  value: unknown,
): FieldAiParserDraft | null {
  if (!isRecord(value)) {
    return null;
  }

  if (value.enabled !== true) {
    return null;
  }

  const extractionInstructions =
    typeof value.extractionInstructions === "string" &&
    value.extractionInstructions.trim().length > 0
      ? value.extractionInstructions
      : DEFAULT_OCR_EXTRACTION_INSTRUCTIONS;
  const expectedSchemaTemplate =
    typeof value.expectedSchemaTemplate === "string" &&
    value.expectedSchemaTemplate.trim().length > 0
      ? value.expectedSchemaTemplate
      : DEFAULT_OCR_SCHEMA_TEMPLATE;
  const expectedOutputFields =
    Array.isArray(value.expectedOutputFields) &&
    value.expectedOutputFields.length > 0
      ? normalizeExpectedOutputFields(
          value.expectedOutputFields.filter(
            (item) =>
              item &&
              typeof item === "object" &&
              typeof (item as { key?: unknown }).key === "string" &&
              typeof (item as { type?: unknown }).type === "string",
          ) as Array<{ key: string; type: string }>,
        )
      : parseExpectedOutputFieldsFromSchemaTemplate(expectedSchemaTemplate);
  const referenceFiles =
    Array.isArray(value.referenceFiles) && value.referenceFiles.length > 0
      ? normalizeFieldAiReferenceFiles(
          value.referenceFiles as FieldAiReferenceFile[],
        )
      : [];

  return {
    enabled: true,
    modelId: typeof value.modelId === "string" ? value.modelId : null,
    promptTemplate:
      typeof value.promptTemplate === "string" ? value.promptTemplate : null,
    systemPrompt:
      typeof value.systemPrompt === "string" ? value.systemPrompt : null,
    extractionInstructions,
    expectedSchemaTemplate,
    referenceFiles,
    expectedOutputFields,
    strictSchema:
      typeof value.strictSchema === "boolean" ? value.strictSchema : true,
  };
}

function mapFieldsWithLocalId(fields: CycleStageField[]) {
  return [...fields]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((field) => ({
      ...field,
      ai_parser_config: normalizeFieldAiParserConfig(field.ai_parser_config),
      localId: field.id,
    }));
}

function mapAutomationsWithLocalId(automations: StageAutomationTemplate[]) {
  return automations.map((automation) => ({
    ...automation,
    localId: automation.id,
  }));
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function serializeSections(sections: StageSection[]): string {
  return JSON.stringify(
    [...sections]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((s) => ({
        section_key: s.section_key,
        title: s.title,
        description: s.description,
        sort_order: s.sort_order,
        is_visible: s.is_visible,
      })),
  );
}

function deriveEditorSections(
  fields: EditableField[],
  sections: StageSection[],
  documentsRouteRepresentsMainForm: boolean,
): EditorSection[] {
  const sortedSections = [...sections]
    .filter((s) => s.is_visible)
    .filter(
      (s) =>
        !(documentsRouteRepresentsMainForm && s.section_key === "eligibility"),
    )
    .sort((a, b) => a.sort_order - b.sort_order);

  const otherSection = sortedSections.find((s) => s.section_key === "other");
  const fallbackSection = otherSection ?? sortedSections[0] ?? null;
  const buckets = new Map<string, EditableField[]>();
  for (const s of sortedSections) {
    buckets.set(s.id, []);
  }

  for (const field of fields) {
    if (field.section_id && buckets.has(field.section_id)) {
      buckets.get(field.section_id)!.push(field);
    } else if (fallbackSection) {
      buckets.get(fallbackSection.id)?.push(field);
    }
  }

  const result: EditorSection[] = [];

  for (const s of sortedSections) {
    const sectionFields = buckets.get(s.id) ?? [];

    result.push({
      id: s.id,
      sectionKey: s.section_key,
      title: s.title,
      description: s.description,
      fields: sectionFields,
    });
  }

  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getFieldTypeLabel(fieldType: CycleStageField["field_type"]) {
  switch (fieldType) {
    case "short_text":
      return "Texto corto";
    case "long_text":
      return "Texto largo";
    case "number":
      return "Número";
    case "date":
      return "Fecha";
    case "email":
      return "Correo";
    case "file":
      return "Archivo";
    default:
      return fieldType;
  }
}

function getFieldIcon(fieldType: CycleStageField["field_type"]) {
  switch (fieldType) {
    case "short_text":
      return "T";
    case "long_text":
      return "≡";
    case "number":
      return "#";
    case "date":
      return "17";
    case "email":
      return "@";
    case "file":
      return "📄";
    default:
      return "T";
  }
}


function getNewFieldSeedForSection({
  sectionKey,
  suffix,
}: {
  sectionKey: string;
  suffix: number;
}) {
  switch (sectionKey) {
    case "eligibility":
      return {
        field_key: `eligibilityCustom${suffix}`,
        field_label: "Nuevo campo de elegibilidad",
        field_type: "short_text" as const,
      };
    case "identity":
      return {
        field_key: `identityCustom${suffix}`,
        field_label: "Nuevo campo de datos personales",
        field_type: "short_text" as const,
      };
    case "family":
      return {
        field_key: `guardianCustom${suffix}`,
        field_label: "Nuevo campo de familia",
        field_type: "short_text" as const,
      };
    case "school":
      return {
        field_key: `schoolCustom${suffix}`,
        field_label: "Nuevo campo académico",
        field_type: "short_text" as const,
      };
    case "motivation":
      return {
        field_key: `motivationCustom${suffix}`,
        field_label: "Nuevo campo de motivación",
        field_type: "long_text" as const,
      };
    case "recommenders":
      return {
        field_key: `recommenderCustom${suffix}`,
        field_label: "Nuevo campo de recomendadores",
        field_type: "short_text" as const,
      };
    case "documents":
      return {
        field_key: `docsCustom${suffix}`,
        field_label: "Nuevo campo de documentos",
        field_type: "short_text" as const,
      };
    case "other":
    default:
      return {
        field_key: `customField${suffix}`,
        field_label: "Nuevo campo adicional",
        field_type: "short_text" as const,
      };
  }
}

function getDefaultSectionTitle(sectionKey: string, sectionNumber: number) {
  switch (sectionKey) {
    case "other":
      return "Otros campos";
    case "identity":
      return "Datos personales";
    case "family":
      return "Familia";
    case "school":
      return "Información académica";
    case "motivation":
      return "Motivación";
    case "documents":
      return "Documentos";
    case "recommenders":
      return "Recomendaciones";
    default:
      return `Sección ${sectionNumber}`;
  }
}

function serializePersistedFields(fields: EditableField[]) {
  return JSON.stringify(
    fields.map((field) => ({
      id: isUuid(field.id) ? field.id : null,
      field_key: field.field_key,
      field_label: field.field_label,
      field_type: field.field_type,
      is_required: field.is_required,
      placeholder: field.placeholder ?? "",
      help_text: field.help_text ?? "",
      group_name: field.group_name?.trim() || null,
      sort_order: field.sort_order,
      is_active: field.is_active,
      ai_parser_config: normalizeFieldAiParserConfig(field.ai_parser_config),
    })),
  );
}

function serializePersistedAutomations({
  automations,
}: {
  automations: EditableAutomation[];
}) {
  return JSON.stringify({
    automations: automations.map((automation) => ({
      id: isUuid(automation.id) ? automation.id : null,
      trigger_event: automation.trigger_event,
      channel: automation.channel,
      is_enabled: automation.is_enabled,
      template_subject: automation.template_subject,
      template_body: automation.template_body,
    })),
  });
}

function serializeSettingsDraft(settings: StageEditorSettingsDraft) {
  return JSON.stringify({
    stageName: settings.stageName.trim(),
    description: settings.description.trim(),
    openDate: settings.openDate,
    closeDate: settings.closeDate,
    previousStageRequirement: settings.previousStageRequirement,
    blockIfPreviousNotMet: settings.blockIfPreviousNotMet,
    ocrPromptTemplate: settings.ocrPromptTemplate?.trim() ?? "",
    eligibilityRubricJson: settings.eligibilityRubricJson.trim(),
    rubricBlueprintV1Json: settings.rubricBlueprintV1Json.trim(),
    rubricMetaJson: settings.rubricMetaJson.trim(),
  });
}

function parseRubricMeta(value: unknown): RubricMeta | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    value.presetId === "uwc_stage1" &&
    typeof value.compiledAt === "string" &&
    (typeof value.compiledBy === "string" ||
      value.compiledBy === null ||
      value.compiledBy === undefined) &&
    (value.source === "wizard" || value.source === "advanced") &&
    value.version === 1
  ) {
    return {
      presetId: "uwc_stage1",
      compiledAt: value.compiledAt,
      compiledBy:
        typeof value.compiledBy === "string" ? value.compiledBy : null,
      source: value.source,
      version: 1,
    };
  }

  return null;
}

function parseStageAdminConfig(value: unknown): StageAdminConfigPayload {
  if (!isRecord(value)) {
    return {};
  }

  return {
    stageName:
      typeof value.stageName === "string" ? value.stageName : undefined,
    description:
      typeof value.description === "string" ? value.description : undefined,
    openDate:
      typeof value.openDate === "string" || value.openDate === null
        ? (value.openDate as string | null)
        : undefined,
    closeDate:
      typeof value.closeDate === "string" || value.closeDate === null
        ? (value.closeDate as string | null)
        : undefined,
    previousStageRequirement:
      typeof value.previousStageRequirement === "string"
        ? value.previousStageRequirement
        : undefined,
    blockIfPreviousNotMet:
      typeof value.blockIfPreviousNotMet === "boolean"
        ? value.blockIfPreviousNotMet
        : undefined,
    eligibilityRubric: parseEligibilityRubricConfig(value.eligibilityRubric),
    rubricBlueprintV1: parseRubricBlueprintV1(value.rubricBlueprintV1),
    rubricMeta: parseRubricMeta(value.rubricMeta),
  };
}

function validateRubricJsonText(raw: string) {
  try {
    const parsed = JSON.parse(raw);
    return validateEligibilityRubricConfig(parsed);
  } catch {
    return {
      success: false as const,
      data: null,
      errors: ["La rúbrica automática debe ser JSON válido."],
    };
  }
}

export function StageConfigEditor({
  cycleId,
  cycleName,
  stageId,
  stageCode,
  stageLabel,
  stageOpenAt,
  stageCloseAt,
  stageTemplates,
  initialFields,
  initialSections,
  initialAutomations,
  initialOcrPromptTemplate,
  initialStageAdminConfig,
  initialTab = "editor",
}: {
  cycleId: string;
  cycleName: string;
  stageId: string;
  stageCode: StageCode;
  stageLabel: string;
  stageOpenAt: string | null;
  stageCloseAt: string | null;
  stageTemplates: CycleStageTemplate[];
  initialFields: CycleStageField[];
  initialSections: StageSection[];
  initialAutomations: StageAutomationTemplate[];
  initialOcrPromptTemplate: string | null;
  initialStageAdminConfig?: Record<string, unknown> | null;
  initialTab?:
    | "editor"
    | "settings"
    | "automations"
    | "communications"
    | "prompt_studio"
    | "stats";
}) {
  const router = useRouter();
  const [fields, setFields] = useState<EditableField[]>(
    mapFieldsWithLocalId(initialFields),
  );
  const [automations, setAutomations] = useState<EditableAutomation[]>(
    mapAutomationsWithLocalId(initialAutomations),
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [rubricFeedback, setRubricFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAtIso, setLastSavedAtIso] = useState<string | null>(null);
  const [draggedFieldId, setDraggedFieldId] = useState<string | null>(null);
  const [dragOverFieldId, setDragOverFieldId] = useState<string | null>(null);
  const [ocrPromptTemplate, setOcrPromptTemplate] = useState(
    initialOcrPromptTemplate ?? DEFAULT_OCR_PROMPT_TEMPLATE,
  );
  const [activeTab, setActiveTab] = useState<
    | "editor"
    | "settings"
    | "automations"
    | "communications"
    | "prompt_studio"
    | "stats"
  >(initialTab);
  const [activeFieldId, setActiveFieldId] = useState<string | null>(null);
  const [aiReferenceUploadState, setAiReferenceUploadState] = useState<
    Record<string, { isUploading: boolean; error: string | null }>
  >({});
  const [pendingEditorFieldFocusId, setPendingEditorFieldFocusId] = useState<
    string | null
  >(null);
  const [sectionPlaceholders, setSectionPlaceholders] = useState<
    SectionPlaceholderDraft[]
  >([]);

  const parsedStageAdminConfigRef = useRef(
    parseStageAdminConfig(initialStageAdminConfig),
  );
  const [sections, setSections] = useState<StageSection[]>(initialSections);
  const [collapsedSectionIds, setCollapsedSectionIds] = useState<string[]>([]);
  const [previewData, setPreviewData] = useState<{
    subject: string;
    bodyHtml: string;
  } | null>(null);
  const initializedSectionCollapseRef = useRef(false);

  const savedFieldsSnapshotRef = useRef(
    serializePersistedFields(mapFieldsWithLocalId(initialFields)),
  );
  const savedSectionsSnapshotRef = useRef(serializeSections(initialSections));
  const savedAutomationsSnapshotRef = useRef(
    serializePersistedAutomations({
      automations: mapAutomationsWithLocalId(initialAutomations),
    }),
  );
  const savedSettingsSnapshotRef = useRef<string | null>(null);

  const deferredFields = useDeferredValue(fields);
  const persistedFieldsSnapshot = useMemo(
    () => serializePersistedFields(fields),
    [fields],
  );
  const persistedSectionsSnapshot = useMemo(
    () => serializeSections(sections),
    [sections],
  );
  const persistedAutomationsSnapshot = useMemo(
    () =>
      serializePersistedAutomations({
        automations,
      }),
    [automations],
  );

  function createNewField(nextIndex: number): EditableField {
    const localId = `new-${crypto.randomUUID()}`;

    return {
      id: localId,
      localId,
      cycle_id: cycleId,
      stage_code: stageCode,
      field_key: `nuevoCampo${nextIndex}`,
      field_label: `Nuevo campo ${nextIndex}`,
      field_type: "short_text",
      is_required: false,
      placeholder: "",
      help_text: "",
      group_name: null,
      sort_order: nextIndex,
      is_active: true,
      section_id: null,
      ai_parser_config: null,
      created_at: new Date().toISOString(),
    };
  }

  function applyOrderedFields(nextFields: EditableField[]) {
    setFields(
      nextFields.map((field, index) => ({ ...field, sort_order: index + 1 })),
    );
  }

  function updateFieldByLocalId(
    localId: string,
    updater: (field: EditableField) => EditableField,
  ) {
    setFields((current) =>
      current.map((item) => (item.localId === localId ? updater(item) : item)),
    );
  }

  function updateFieldAiParserConfig(
    localId: string,
    updater: (current: FieldAiParserDraft) => FieldAiParserDraft | null,
  ) {
    updateFieldByLocalId(localId, (field) => {
      const baseConfig =
        normalizeFieldAiParserConfig(field.ai_parser_config) ??
        createDefaultFieldAiParserConfig();
      return {
        ...field,
        ai_parser_config: updater(baseConfig),
      };
    });
  }

  async function uploadAiParserReferenceFiles(
    localId: string,
    uploadedFiles: FileList | File[],
  ) {
    const filesToUpload = Array.from(uploadedFiles);
    if (filesToUpload.length === 0) {
      return;
    }

    setAiReferenceUploadState((current) => ({
      ...current,
      [localId]: { isUploading: true, error: null },
    }));

    try {
      const formData = new FormData();
      for (const file of filesToUpload) {
        formData.append("files", file);
      }

      const response = await fetchApiResponse(
        `/api/cycles/${cycleId}/stages/${stageId}/ai-reference-files`,
        {
          method: "POST",
          body: formData,
        },
      );
      const body = (await response.json()) as
        | { referenceFiles?: FieldAiReferenceFile[] }
        | null;

      const uploadedReferenceFiles =
        body && Array.isArray(body.referenceFiles)
          ? normalizeFieldAiReferenceFiles(body.referenceFiles)
          : [];

      updateFieldAiParserConfig(localId, (currentConfig) => ({
        ...currentConfig,
        referenceFiles: normalizeFieldAiReferenceFiles([
          ...(currentConfig.referenceFiles ?? []),
          ...uploadedReferenceFiles,
        ]),
      }));

      setAiReferenceUploadState((current) => ({
        ...current,
        [localId]: { isUploading: false, error: null },
      }));
    } catch (uploadError) {
      setAiReferenceUploadState((current) => ({
        ...current,
        [localId]: {
          isUploading: false,
          error: toNormalizedApiError(
            uploadError,
            "No se pudieron subir los archivos de referencia.",
          ).message,
        },
      }));
    }
  }

  function removeAiParserReferenceFile(localId: string, path: string) {
    updateFieldAiParserConfig(localId, (currentConfig) => ({
      ...currentConfig,
      referenceFiles: (currentConfig.referenceFiles ?? []).filter(
        (referenceFile) => referenceFile.path !== path,
      ),
    }));
  }

  function addExpectedOutputField(localId: string) {
    updateFieldAiParserConfig(localId, (currentConfig) => {
      const currentFields = normalizeExpectedOutputFields(
        currentConfig.expectedOutputFields,
      );
      const nextIndex = currentFields.length + 1;
      const fallbackKey =
        normalizeOcrOutputKey(`campo_${nextIndex}`) || `campo_${nextIndex}`;
      const nextFields = [
        ...currentFields,
        { key: fallbackKey, type: "text" as const },
      ];
      return {
        ...currentConfig,
        expectedOutputFields: nextFields,
        expectedSchemaTemplate:
          buildSchemaTemplateFromExpectedOutputFields(nextFields),
      };
    });
  }

  function updateExpectedOutputField(
    localId: string,
    index: number,
    patch: Partial<OcrExpectedOutputField>,
  ) {
    updateFieldAiParserConfig(localId, (currentConfig) => {
      const currentFields = currentConfig.expectedOutputFields ?? [];
      const nextFields = currentFields.map((field, fieldIndex) =>
        fieldIndex === index ? { ...field, ...patch } : field,
      );
      // Build schema from normalized keys but keep raw keys for editing
      const normalizedForSchema = normalizeExpectedOutputFields(nextFields);
      return {
        ...currentConfig,
        expectedOutputFields: nextFields,
        expectedSchemaTemplate:
          normalizedForSchema.length > 0
            ? buildSchemaTemplateFromExpectedOutputFields(normalizedForSchema)
            : "{}",
      };
    });
  }

  function finalizeExpectedOutputFields(localId: string) {
    updateFieldAiParserConfig(localId, (currentConfig) => {
      const normalizedFields = normalizeExpectedOutputFields(
        currentConfig.expectedOutputFields,
      );
      return {
        ...currentConfig,
        expectedOutputFields: normalizedFields,
        expectedSchemaTemplate:
          normalizedFields.length > 0
            ? buildSchemaTemplateFromExpectedOutputFields(normalizedFields)
            : "{}",
      };
    });
  }

  function removeExpectedOutputField(localId: string, index: number) {
    updateFieldAiParserConfig(localId, (currentConfig) => {
      const currentFields = normalizeExpectedOutputFields(
        currentConfig.expectedOutputFields,
      );
      const nextFields = currentFields.filter(
        (_, fieldIndex) => fieldIndex !== index,
      );
      return {
        ...currentConfig,
        expectedOutputFields: nextFields,
        expectedSchemaTemplate:
          nextFields.length > 0
            ? buildSchemaTemplateFromExpectedOutputFields(nextFields)
            : "{}",
      };
    });
  }

  function insertFieldAt(
    position: number,
    seed?:
      | Partial<
          Pick<
            EditableField,
            | "field_key"
            | "field_label"
            | "field_type"
            | "is_required"
            | "placeholder"
            | "help_text"
            | "is_active"
          >
        >
      | undefined,
    options?: {
      sectionId?: string | null;
    },
  ) {
    const safePosition = Math.max(0, Math.min(position, fields.length));
    const nextIndex = fields.length + 1;
    const baseField = createNewField(nextIndex);
    const insertedField: EditableField = {
      ...baseField,
      ...(seed ?? {}),
      localId: baseField.localId,
      id: baseField.id,
      cycle_id: cycleId,
      stage_code: stageCode,
      created_at: baseField.created_at,
    };

    if (options?.sectionId) {
      insertedField.section_id = options.sectionId;
    }

    const nextFields = [
      ...fields.slice(0, safePosition),
      insertedField,
      ...fields.slice(safePosition),
    ];

    applyOrderedFields(nextFields);
    setActiveFieldId(insertedField.localId);
    setStatusMessage(
      "Campo agregado localmente. Guarda configuración para persistir cambios.",
    );
  }

  function addNextSection() {
    const newSectionTitle = `Nueva sección ${sections.length + 1}`;
    const newSectionId = crypto.randomUUID();
    const newSectionKey = `custom-${crypto.randomUUID().slice(0, 8)}`;
    const createdAt = new Date().toISOString();

    setSections((current) => {
      const maxSortOrder = current.reduce(
        (highest, section) => Math.max(highest, section.sort_order),
        0,
      );
      const newSection: StageSection = {
        id: newSectionId,
        cycle_id: cycleId,
        stage_code: stageCode,
        section_key: newSectionKey,
        title: newSectionTitle,
        description: "",
        sort_order: maxSortOrder + 1,
        is_visible: true,
        created_at: createdAt,
      };
      return [...current, newSection];
    });
    setStatusMessage(
      `Se creó la sección “${newSectionTitle}”. Guarda configuración para persistir.`,
    );
  }

  function renameSection(sectionId: string) {
    const section = sections.find((item) => item.id === sectionId);
    if (!section) {
      return;
    }

    if (typeof window === "undefined" || typeof window.prompt !== "function") {
      return;
    }

    const nextTitle = window.prompt(
      "Nuevo nombre de la sección",
      section.title,
    );
    if (nextTitle === null) {
      return;
    }

    const sanitizedTitle = nextTitle.trim();
    if (!sanitizedTitle) {
      setStatusMessage("El nombre de la sección no puede estar vacío.");
      return;
    }

    if (sanitizedTitle === section.title) {
      return;
    }

    setSections((current) =>
      current.map((item) =>
        item.id === sectionId ? { ...item, title: sanitizedTitle } : item,
      ),
    );
    setStatusMessage(
      `Sección renombrada a “${sanitizedTitle}”. Guarda configuración para persistir.`,
    );
  }

  async function openPreview() {
    if (isSaving) {
      return;
    }

    if (hasUnsavedConfigChanges) {
      setStatusMessage(
        "Guardando cambios antes de abrir la previsualización...",
      );
      const didSave = await saveStageConfig();
      if (!didSave) {
        return;
      }
    }

    if (hasUnsavedSectionDraftChanges) {
      setStatusMessage(
        "La previsualización muestra los cambios guardados. Las secciones nuevas sin campos aún no se incluyen.",
      );
    }

    router.push(`/admin/process/${cycleId}/stage/${stageId}/preview`);
  }

  function switchToTab(
    nextTab:
      | "editor"
      | "settings"
      | "automations"
      | "communications"
      | "prompt_studio"
      | "stats",
  ) {
    startTransition(() => setActiveTab(nextTab));
  }

  function addFieldToPlaceholder(placeholder: SectionPlaceholderDraft) {
    // Find or create a section matching the placeholder's sectionKey
    const matchingSection = sections.find(
      (s) => s.section_key === placeholder.sectionKey,
    );
    const suffix = fields.length + 1;
    const seed = getNewFieldSeedForSection({
      sectionKey: placeholder.sectionKey,
      suffix,
    });
    insertFieldAt(
      fields.length,
      {
        field_key: seed.field_key,
        field_label: seed.field_label,
        field_type: seed.field_type,
        is_required: false,
        placeholder: "",
        help_text: "",
        is_active: true,
      },
      {
        sectionId: matchingSection?.id ?? null,
      },
    );
    setSectionPlaceholders((current) =>
      current.filter((draft) => draft.localId !== placeholder.localId),
    );
  }

  function confirmAction(message: string) {
    if (typeof window === "undefined") {
      return true;
    }

    try {
      return window.confirm(message);
    } catch {
      return true;
    }
  }

  function ensureUniqueFieldKey(fieldKey: string, currentLocalId: string) {
    const normalizedBase = normalizeFieldKey(fieldKey);
    const existingKeys = new Set(
      fields
        .filter((candidate) => candidate.localId !== currentLocalId)
        .map((candidate) => candidate.field_key),
    );

    if (!existingKeys.has(normalizedBase)) {
      return normalizedBase;
    }

    let counter = 2;
    let candidate = `${normalizedBase}${counter}`;
    while (existingKeys.has(candidate)) {
      counter += 1;
      candidate = `${normalizedBase}${counter}`;
    }
    return candidate;
  }

  function reorderDraggedField(targetLocalId: string) {
    if (!draggedFieldId || draggedFieldId === targetLocalId) {
      return;
    }

    const draggingIndex = fields.findIndex(
      (field) => field.localId === draggedFieldId,
    );
    const targetIndex = fields.findIndex(
      (field) => field.localId === targetLocalId,
    );

    if (draggingIndex < 0 || targetIndex < 0) {
      return;
    }

    const nextFields = [...fields];
    const [draggingField] = nextFields.splice(draggingIndex, 1);
    nextFields.splice(targetIndex, 0, draggingField);
    applyOrderedFields(nextFields);
  }

  function handleFieldDrop(
    event: DragEvent<HTMLDivElement>,
    targetLocalId: string,
  ) {
    event.preventDefault();
    reorderDraggedField(targetLocalId);
    setDragOverFieldId(null);
    setDraggedFieldId(null);
  }


  function removeField(localId: string) {
    const removedField = fields.find((field) => field.localId === localId);
    if (removedField) {
      const confirmed = confirmAction(
        `¿Eliminar el campo \"${removedField.field_label}\"?\n\nDebes usar \"Guardar configuración\" para publicar este cambio.`,
      );
      if (!confirmed) {
        return;
      }
    }

    applyOrderedFields(fields.filter((field) => field.localId !== localId));
    setStatusMessage(
      removedField
        ? `Campo eliminado localmente (${removedField.field_label}). Guarda configuración para persistir.`
        : "Campo eliminado localmente. Guarda configuración para persistir.",
    );
  }




  async function saveStageConfig() {
    let didSave = false;
    setError(null);
    setStatusMessage(null);
    setIsSaving(true);

    const normalizedKeys = fields.map((field) => field.field_key.trim());
    if (new Set(normalizedKeys).size !== normalizedKeys.length) {
      const duplicateKeys = Array.from(
        normalizedKeys.reduce((map, key) => {
          map.set(key, (map.get(key) ?? 0) + 1);
          return map;
        }, new Map<string, number>()),
      )
        .filter(([, count]) => count > 1)
        .map(([key]) => key)
        .sort();
      setError({
        message: `Hay claves técnicas duplicadas en los campos. Claves repetidas: ${duplicateKeys.join(", ")}. Ajusta los identificadores internos antes de guardar.`,
      });
      setIsSaving(false);
      return false;
    }

    let parsedEligibilityRubric: EligibilityRubricConfig;
    const nextRubricBlueprintForSave: RubricBlueprintV1 | null =
      settingsRubricBlueprint;
    let nextRubricMetaForSave: RubricMeta | null = settingsRubricMeta;

    {
      const rubricValidation = validateRubricJsonText(
        settingsEligibilityRubricJson,
      );
      if (!rubricValidation.success) {
        setSettingsEligibilityRubricErrors(rubricValidation.errors);
        setError({
          message: `La rúbrica automática no es válida:\n${rubricValidation.errors
            .slice(0, 6)
            .join("\n")}`,
        });
        setIsSaving(false);
        return false;
      }
      parsedEligibilityRubric = rubricValidation.data;
      nextRubricMetaForSave =
        settingsRubricMeta ?? createRubricMeta({ source: "advanced" });
    }

    try {
      const body = await fetchApi<{
        fields?: CycleStageField[];
        sections?: StageSection[];
        automations?: StageAutomationTemplate[];
        ocrPromptTemplate?: string | null;
        settings?: {
          stageName?: string;
          description?: string;
          openDate?: string | null;
          closeDate?: string | null;
          previousStageRequirement?: string;
          blockIfPreviousNotMet?: boolean;
          eligibilityRubric?: unknown;
          rubricBlueprintV1?: unknown;
          rubricMeta?: unknown;
        };
      }>(
        `/api/cycles/${cycleId}/stages/${stageId}/config`,
        {
          method: "PATCH",
          body: JSON.stringify({
            fields: fields.map((field, index) => ({
              id: isUuid(field.id) ? field.id : undefined,
              fieldKey: field.field_key,
              fieldLabel: field.field_label,
              fieldType: field.field_type,
              isRequired: field.is_required,
              placeholder: field.placeholder,
              helpText: field.help_text,
              groupName: field.group_name?.trim() || null,
              sortOrder: index + 1,
              isActive: field.is_active,
              sectionKey:
                sections.find((s) => s.id === field.section_id)?.section_key ??
                null,
              aiParser: normalizeFieldAiParserConfig(field.ai_parser_config),
            })),
            sections: sections.map((s, index) => ({
              sectionKey: s.section_key,
              title:
                s.title.trim() ||
                getDefaultSectionTitle(s.section_key, index + 1),
              description: s.description.trim(),
              sortOrder: index + 1,
              isVisible: s.is_visible,
            })),
            automations: automations.map((automation) => ({
              id: isUuid(automation.id) ? automation.id : undefined,
              triggerEvent: automation.trigger_event,
              channel: automation.channel,
              isEnabled: automation.is_enabled,
              templateSubject: automation.template_subject,
              templateBody: automation.template_body,
            })),
            ocrPromptTemplate:
              ocrPromptTemplate.trim().length > 0
                ? ocrPromptTemplate.trim()
                : null,
            settings: {
              stageName: settingsStageName.trim(),
              description: settingsDescription.trim(),
              openDate: settingsOpenDate || null,
              closeDate: settingsCloseDate || null,
              previousStageRequirement,
              blockIfPreviousNotMet,
              eligibilityRubric: parsedEligibilityRubric,
              rubricBlueprintV1: nextRubricBlueprintForSave,
              rubricMeta: nextRubricMetaForSave,
            },
          }),
        },
      );

      const nextSavedSections = Array.isArray(body.sections)
        ? (body.sections as StageSection[])
        : sections;
      const nextSavedFields = mapFieldsWithLocalId(body.fields ?? []);
      const nextSavedAutomations = mapAutomationsWithLocalId(
        body.automations ?? [],
      );
      const nextSavedOcrPrompt = body.ocrPromptTemplate ?? "";
      const nextSavedRubric =
        parseEligibilityRubricConfig(body.settings?.eligibilityRubric) ??
        parsedEligibilityRubric;
      const nextSavedBlueprint =
        parseRubricBlueprintV1(body.settings?.rubricBlueprintV1) ??
        nextRubricBlueprintForSave;
      const nextSavedMeta =
        parseRubricMeta(body.settings?.rubricMeta) ?? nextRubricMetaForSave;
      const nextSavedSettings = {
        stageName:
          typeof body.settings?.stageName === "string"
            ? body.settings.stageName
            : settingsStageName.trim(),
        description:
          typeof body.settings?.description === "string"
            ? body.settings.description
            : settingsDescription.trim(),
        openDate:
          typeof body.settings?.openDate === "string"
            ? body.settings.openDate
            : "",
        closeDate:
          typeof body.settings?.closeDate === "string"
            ? body.settings.closeDate
            : "",
        previousStageRequirement:
          typeof body.settings?.previousStageRequirement === "string"
            ? body.settings.previousStageRequirement
            : previousStageRequirement,
        blockIfPreviousNotMet:
          typeof body.settings?.blockIfPreviousNotMet === "boolean"
            ? body.settings.blockIfPreviousNotMet
            : blockIfPreviousNotMet,
        ocrPromptTemplate:
          typeof body.ocrPromptTemplate === "string"
            ? body.ocrPromptTemplate
            : nextSavedOcrPrompt,
        eligibilityRubricJson: JSON.stringify(nextSavedRubric, null, 2),
        rubricBlueprintV1Json: JSON.stringify(
          nextSavedBlueprint ?? null,
          null,
          2,
        ),
        rubricMetaJson: JSON.stringify(nextSavedMeta ?? null, null, 2),
      } satisfies StageEditorSettingsDraft;

      setSections(nextSavedSections);
      setFields(nextSavedFields);
      setAutomations(nextSavedAutomations);
      setOcrPromptTemplate(nextSavedOcrPrompt);
      setSettingsStageName(nextSavedSettings.stageName);
      setSettingsDescription(nextSavedSettings.description);
      setSettingsOpenDate(nextSavedSettings.openDate);
      setSettingsCloseDate(nextSavedSettings.closeDate);
      setPreviousStageRequirement(nextSavedSettings.previousStageRequirement);
      setBlockIfPreviousNotMet(nextSavedSettings.blockIfPreviousNotMet);
      setSettingsEligibilityRubricDraft(nextSavedRubric);
      setSettingsEligibilityRubricJson(nextSavedSettings.eligibilityRubricJson);
      setSettingsRubricBlueprint(nextSavedBlueprint);
      setSettingsRubricMeta(nextSavedMeta);
      setSettingsEligibilityRubricErrors([]);
      savedSectionsSnapshotRef.current = serializeSections(nextSavedSections);
      savedFieldsSnapshotRef.current =
        serializePersistedFields(nextSavedFields);
      savedAutomationsSnapshotRef.current = serializePersistedAutomations({
        automations: nextSavedAutomations,
      });
      savedSettingsSnapshotRef.current =
        serializeSettingsDraft(nextSavedSettings);
      setLastSavedAtIso(new Date().toISOString());
      didSave = true;
    } catch (saveError) {
      setError(
        toNormalizedApiError(
          saveError,
          "No se pudo guardar la configuración.",
        ),
      );
      return false;
    } finally {
      setIsSaving(false);
    }

    return didSave;
  }
  const documentsRouteRepresentsMainForm = stageCode === "documents";
  const displayStageLabel = documentsRouteRepresentsMainForm
    ? "Formulario Principal"
    : stageCode === "exam_placeholder"
      ? "Examen Académico"
      : stageLabel;
  const parsedStageAdminConfig = parsedStageAdminConfigRef.current;
  const initialEligibilityRubricConfig =
    parsedStageAdminConfig.eligibilityRubric ??
    getDefaultEligibilityRubricConfig();
  const hydratedBlueprintFromRubric = parsedStageAdminConfig.eligibilityRubric
    ? tryHydrateBlueprintFromRubric(parsedStageAdminConfig.eligibilityRubric)
    : null;
  const initialRubricBlueprint =
    parsedStageAdminConfig.rubricBlueprintV1 ?? hydratedBlueprintFromRubric;
  const initialRubricMeta =
    parsedStageAdminConfig.rubricMeta ??
    (initialRubricBlueprint ? createRubricMeta({ source: "wizard" }) : null);
  const initialWizardDraft = initialRubricBlueprint
    ? presetDraftFromBlueprint(initialRubricBlueprint)
    : guessUwcStageOnePresetDraft(initialFields);
  const [settingsStageName, setSettingsStageName] = useState(
    parsedStageAdminConfig.stageName ?? displayStageLabel,
  );
  const [settingsDescription, setSettingsDescription] = useState(
    parsedStageAdminConfig.description ??
      (documentsRouteRepresentsMainForm
        ? "Completa tu información familiar, académica y redacta tus ensayos de motivación."
        : "Configura la captura de datos de esta etapa, reglas de acceso y notificaciones."),
  );
  const [settingsOpenDate, setSettingsOpenDate] = useState(
    toDateInputValue(stageOpenAt) || (parsedStageAdminConfig.openDate ?? ""),
  );
  const [settingsCloseDate, setSettingsCloseDate] = useState(
    toDateInputValue(stageCloseAt) || (parsedStageAdminConfig.closeDate ?? ""),
  );
  const [previousStageRequirement, setPreviousStageRequirement] = useState(
    parsedStageAdminConfig.previousStageRequirement ?? "none",
  );
  const [blockIfPreviousNotMet, setBlockIfPreviousNotMet] = useState(
    parsedStageAdminConfig.blockIfPreviousNotMet ??
      documentsRouteRepresentsMainForm,
  );
  const [rubricEditorMode, setRubricEditorMode] =
    useState<RubricEditorMode>("guided");
  const [newRubricCriterionKind, setNewRubricCriterionKind] =
    useState<EligibilityRubricCriterion["kind"]>("field_present");
  const [collapsedCriteria, setCollapsedCriteria] = useState<Set<number>>(
    new Set(),
  );
  const [settingsEligibilityRubricDraft, setSettingsEligibilityRubricDraft] =
    useState<EligibilityRubricConfig>(initialEligibilityRubricConfig);
  const [settingsEligibilityRubricJson, setSettingsEligibilityRubricJson] =
    useState(JSON.stringify(initialEligibilityRubricConfig, null, 2));
  const [settingsEligibilityRubricErrors, setSettingsEligibilityRubricErrors] =
    useState<string[]>([]);
  const [settingsRubricBlueprint, setSettingsRubricBlueprint] =
    useState<RubricBlueprintV1 | null>(initialRubricBlueprint);
  const [settingsRubricMeta, setSettingsRubricMeta] =
    useState<RubricMeta | null>(initialRubricMeta);
  const suggestedUwcPresetDraft = useMemo(
    () => guessUwcStageOnePresetDraft(fields),
    [fields],
  );
  const [uwcPresetDraft, setUwcPresetDraft] =
    useState<UwcStageOnePresetDraft>(initialWizardDraft);
  const rubricFieldOptions = useMemo(() => {
    const seen = new Set<string>();
    return fields
      .filter((field) => {
        const key = field.field_key.trim();
        if (!key || seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      })
      .map((field) => ({
        value: field.field_key,
        label: `${field.field_label} (${field.field_key})`,
      }));
  }, [fields]);
  const rubricFileFieldOptions = useMemo(
    () =>
      rubricFieldOptions.filter((option) =>
        fields.some(
          (field) =>
            field.field_key === option.value && field.field_type === "file",
        ),
      ),
    [fields, rubricFieldOptions],
  );
  const rubricNumberFieldOptions = useMemo(
    () =>
      rubricFieldOptions.filter((option) =>
        fields.some(
          (field) =>
            field.field_key === option.value && field.field_type === "number",
        ),
      ),
    [fields, rubricFieldOptions],
  );
  const defaultRubricFieldKey = rubricFieldOptions[0]?.value ?? "field_key";
  const defaultRubricFileKey = rubricFileFieldOptions[0]?.value ?? "file_key";
  const defaultRubricNumberFieldKey =
    rubricNumberFieldOptions[0]?.value ?? defaultRubricFieldKey;

  function applyUwcPeruTemplate() {
    const result = buildUwcStageOneRubricFromDraft(uwcPresetDraft);
    if (!result || result.criteria.length === 0) {
      setRubricFeedback({
        type: "error",
        message:
          "No se pudo generar la plantilla. Verifica que los campos de mapeo estén completos.",
      });
      return;
    }
    setRubricEditorMode("guided");
    syncGuidedRubricDraft(result, { source: "advanced" });
    setRubricFeedback({
      type: "success",
      message: `Plantilla UWC Perú aplicada: ${result.criteria.length} criterios generados.`,
    });
  }

  function syncGuidedRubricDraft(
    nextDraft: EligibilityRubricConfig,
    options?: {
      source?: RubricMeta["source"];
      blueprint?: RubricBlueprintV1 | null;
    },
  ) {
    setSettingsEligibilityRubricDraft(nextDraft);
    setSettingsEligibilityRubricJson(JSON.stringify(nextDraft, null, 2));
    const validation = validateEligibilityRubricConfig(nextDraft);
    setSettingsEligibilityRubricErrors(
      validation.success ? [] : validation.errors,
    );

    if (options?.blueprint !== undefined) {
      setSettingsRubricBlueprint(options.blueprint);
    }
    if (options?.source) {
      setSettingsRubricMeta(
        createRubricMeta({
          source: options.source,
        }),
      );
    }
  }

  function handleRubricJsonInputChange(nextJson: string) {
    setSettingsEligibilityRubricJson(nextJson);
    const validation = validateRubricJsonText(nextJson);
    if (validation.success) {
      setSettingsEligibilityRubricDraft(validation.data);
      setSettingsEligibilityRubricErrors([]);
      setSettingsRubricMeta(
        createRubricMeta({
          source: "advanced",
        }),
      );
      return;
    }
    setSettingsEligibilityRubricErrors(validation.errors);
  }

  function addGuidedRubricCriterion(kind: EligibilityRubricCriterion["kind"]) {
    const nextCriteria = [
      ...settingsEligibilityRubricDraft.criteria,
      createDefaultRubricCriterion({
        kind,
        existingCriteria: settingsEligibilityRubricDraft.criteria,
        defaultFieldKey: defaultRubricFieldKey,
        defaultFileKey: defaultRubricFileKey,
        defaultNumberFieldKey: defaultRubricNumberFieldKey,
      }),
    ];
    syncGuidedRubricDraft(
      {
        ...settingsEligibilityRubricDraft,
        criteria: nextCriteria,
      },
      { source: "advanced" },
    );
  }

  function updateGuidedRubricCriterion(
    criterionIndex: number,
    updater: (
      criterion: EligibilityRubricCriterion,
    ) => EligibilityRubricCriterion,
  ) {
    const nextCriteria = settingsEligibilityRubricDraft.criteria.map(
      (criterion, index) =>
        index === criterionIndex ? updater(criterion) : criterion,
    );
    syncGuidedRubricDraft(
      {
        ...settingsEligibilityRubricDraft,
        criteria: nextCriteria,
      },
      { source: "advanced" },
    );
  }

  function removeGuidedRubricCriterion(criterionIndex: number) {
    const nextCriteria = settingsEligibilityRubricDraft.criteria.filter(
      (_, index) => index !== criterionIndex,
    );
    syncGuidedRubricDraft(
      {
        ...settingsEligibilityRubricDraft,
        criteria: nextCriteria,
      },
      { source: "advanced" },
    );
  }

  function moveGuidedRubricCriterion(
    criterionIndex: number,
    direction: "up" | "down",
  ) {
    const targetIndex =
      direction === "up" ? criterionIndex - 1 : criterionIndex + 1;
    if (
      targetIndex < 0 ||
      targetIndex >= settingsEligibilityRubricDraft.criteria.length
    ) {
      return;
    }

    const nextCriteria = [...settingsEligibilityRubricDraft.criteria];
    const [moved] = nextCriteria.splice(criterionIndex, 1);
    nextCriteria.splice(targetIndex, 0, moved);
    syncGuidedRubricDraft(
      {
        ...settingsEligibilityRubricDraft,
        criteria: nextCriteria,
      },
      { source: "advanced" },
    );
  }

  function toggleCriterionCollapsed(criterionIndex: number) {
    setCollapsedCriteria((current) => {
      const next = new Set(current);
      if (next.has(criterionIndex)) {
        next.delete(criterionIndex);
      } else {
        next.add(criterionIndex);
      }
      return next;
    });
  }

  function handleRubricModeChange(nextMode: RubricEditorMode) {
    if (nextMode === rubricEditorMode) {
      return;
    }
    if (nextMode === "guided" && settingsEligibilityRubricErrors.length > 0) {
      setError({
        message:
          "No puedes volver al modo guiado mientras haya errores de JSON. Corrige el JSON o aplica una plantilla.",
      });
      return;
    }
    setRubricEditorMode(nextMode);
    setError(null);
  }

  function validateRubricFromEditor() {
    const validation = validateRubricJsonText(settingsEligibilityRubricJson);
    if (validation.success) {
      setSettingsEligibilityRubricDraft(validation.data);
      setSettingsEligibilityRubricJson(
        JSON.stringify(validation.data, null, 2),
      );
      setSettingsEligibilityRubricErrors([]);
      setSettingsRubricMeta(
        createRubricMeta({
          source: "advanced",
        }),
      );
      setError(null);
      setStatusMessage(
        `Rúbrica válida: ${validation.data.criteria.length} criterio(s).`,
      );
      return;
    }

    setSettingsEligibilityRubricErrors(validation.errors);
    setError({
      message: `La rúbrica automática no es válida:\n${validation.errors.slice(0, 6).join("\n")}`,
    });
  }

  function togglePresetFileKey(
    listKey: "idDocumentFileKeys" | "gradesDocumentFileKeys",
    fieldKey: string,
  ) {
    setUwcPresetDraft((current) => {
      const currentValues = current[listKey];
      const exists = currentValues.includes(fieldKey);
      const nextValues = exists
        ? currentValues.filter((value) => value !== fieldKey)
        : [...currentValues, fieldKey];
      return {
        ...current,
        [listKey]: nextValues,
      };
    });
  }

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.dispatchEvent(
      new CustomEvent("uwc:stage-label-updated", {
        detail: {
          cycleId,
          stageId,
          stageCode,
          stageLabel: settingsStageName.trim() || displayStageLabel,
        },
      }),
    );
  }, [cycleId, displayStageLabel, settingsStageName, stageCode, stageId]);

  useEffect(() => {
    if (activeTab !== "editor" || !pendingEditorFieldFocusId) {
      return;
    }

    const targetId = `field-card-${pendingEditorFieldFocusId}`;
    const frameId = window.requestAnimationFrame(() => {
      const element = document.getElementById(targetId);
      if (!element) {
        return;
      }
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      setPendingEditorFieldFocusId(null);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [activeTab, pendingEditorFieldFocusId]);

  const settingsDraftSnapshot = useMemo(
    () =>
      serializeSettingsDraft({
        stageName: settingsStageName,
        description: settingsDescription,
        openDate: settingsOpenDate,
        closeDate: settingsCloseDate,
        previousStageRequirement,
        blockIfPreviousNotMet,
        ocrPromptTemplate,
        eligibilityRubricJson: settingsEligibilityRubricJson,
        rubricBlueprintV1Json: JSON.stringify(
          settingsRubricBlueprint ?? null,
          null,
          2,
        ),
        rubricMetaJson: JSON.stringify(settingsRubricMeta ?? null, null, 2),
      }),
    [
      settingsStageName,
      settingsDescription,
      settingsOpenDate,
      settingsCloseDate,
      previousStageRequirement,
      blockIfPreviousNotMet,
      ocrPromptTemplate,
      settingsEligibilityRubricJson,
      settingsRubricBlueprint,
      settingsRubricMeta,
    ],
  );
  if (savedSettingsSnapshotRef.current === null) {
    savedSettingsSnapshotRef.current = settingsDraftSnapshot;
  }
  const hasUnsavedSectionsChanges =
    persistedSectionsSnapshot !== savedSectionsSnapshotRef.current;
  const hasUnsavedFieldConfigChanges =
    persistedFieldsSnapshot !== savedFieldsSnapshotRef.current ||
    hasUnsavedSectionsChanges;
  const hasUnsavedAutomationsConfigChanges =
    persistedAutomationsSnapshot !== savedAutomationsSnapshotRef.current;
  const hasUnsavedSettingsConfigChanges =
    settingsDraftSnapshot !== savedSettingsSnapshotRef.current;
  const hasUnsavedSectionDraftChanges = sectionPlaceholders.length > 0;
  const hasUnsavedConfigChanges =
    hasUnsavedFieldConfigChanges ||
    hasUnsavedAutomationsConfigChanges ||
    hasUnsavedSettingsConfigChanges;
  const canSavePersistedConfig = hasUnsavedConfigChanges && !isSaving;
  const saveStatusTone = isSaving
    ? "is-saving"
    : hasUnsavedConfigChanges || hasUnsavedSectionDraftChanges
      ? "is-dirty"
      : "is-clean";
  const saveFeedbackLabel = isSaving
    ? "Guardando cambios..."
    : hasUnsavedConfigChanges
      ? "Hay cambios sin guardar"
      : hasUnsavedSectionDraftChanges
        ? "Hay cambios locales pendientes"
        : lastSavedAtIso
          ? "Configuración guardada"
          : "Sin cambios";
  const isLargeFormEditor = fields.length >= 80;
  const saveableChangeLabels = [
    hasUnsavedFieldConfigChanges ? "Editor de Formulario" : null,
    hasUnsavedSettingsConfigChanges ? "Ajustes y Reglas" : null,
    hasUnsavedAutomationsConfigChanges ? "Automatizaciones" : null,
  ].filter(Boolean) as string[];
  const draftOnlyChangeLabels = [
    hasUnsavedSectionDraftChanges ? "Secciones nuevas (placeholder)" : null,
  ].filter(Boolean) as string[];
  const saveStatusTimestamp = lastSavedAtIso
    ? new Date(lastSavedAtIso).toLocaleTimeString("es-PE", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;
  const saveFeedbackSummary = isSaving
    ? "Guardando cambios de la etapa..."
    : hasUnsavedConfigChanges
      ? `Hay cambios sin guardar en ${saveableChangeLabels.join(", ")}. Previsualizar también los guarda.`
      : draftOnlyChangeLabels.length > 0
        ? `Hay borradores locales (${draftOnlyChangeLabels.join(", ")}) que aún no se publican.`
        : saveStatusTimestamp
          ? `Configuración guardada (${saveStatusTimestamp}).`
          : "Sin cambios pendientes.";

  const editorSections = useMemo(() => {
    if (activeTab !== "editor") {
      return [];
    }

    return deriveEditorSections(
      deferredFields,
      sections,
      documentsRouteRepresentsMainForm,
    );
  }, [activeTab, deferredFields, sections, documentsRouteRepresentsMainForm]);

  const displayedEditorFields = useMemo(() => {
    if (activeTab !== "editor") {
      return [];
    }

    const collapsedSet = new Set(collapsedSectionIds);
    return editorSections.flatMap((section) => {
      const sectionFields = section.fields as EditableField[];
      if (!collapsedSet.has(String(section.id))) {
        return sectionFields;
      }

      return sectionFields.slice(0, 1);
    });
  }, [activeTab, editorSections, collapsedSectionIds]);
  const emptySections = useMemo(
    () =>
      activeTab === "editor"
        ? editorSections.filter((section) => section.fields.length === 0)
        : [],
    [activeTab, editorSections],
  );
  const sectionPositionById = useMemo(() => {
    const total = editorSections.length;
    return new Map(
      editorSections.map(
        (section, index) => [section.id, { index, total }] as const,
      ),
    );
  }, [editorSections]);

  const orderedFieldIndexByLocalId = useMemo(() => {
    if (activeTab !== "editor") {
      return new Map<string, number>();
    }

    return new Map(
      fields.map((field, index) => [field.localId, index] as const),
    );
  }, [activeTab, fields]);

  const editorFieldSectionMeta = useMemo(() => {
    if (activeTab !== "editor") {
      return {
        headingByFieldId: new Map<string, string>(),
        firstFieldIds: new Set<string>(),
        lastFieldIds: new Set<string>(),
        insertPositionByLastFieldId: new Map<string, number>(),
        insertPositionBySectionId: new Map<string, number>(),
        sectionIdByLastFieldId: new Map<string, string>(),
        sectionIdByFieldId: new Map<string, string>(),
      };
    }

    const headingByFieldId = new Map<string, string>();
    const firstFieldIds = new Set<string>();
    const lastFieldIds = new Set<string>();
    const insertPositionByLastFieldId = new Map<string, number>();
    const insertPositionBySectionId = new Map<string, number>();
    const sectionIdByLastFieldId = new Map<string, string>();
    const sectionIdByFieldId = new Map<string, string>();
    const collapsedSet = new Set(collapsedSectionIds);

    editorSections.forEach((section, index) => {
      const sectionFields = section.fields as EditableField[];
      const heading = `Sección ${index + 1}: ${
        section.title.trim() ||
        getDefaultSectionTitle(section.sectionKey, index + 1)
      }`;
      const firstField = sectionFields[0];
      const lastField = sectionFields.at(-1);
      const isSectionCollapsed = collapsedSet.has(String(section.id));

      if (firstField) {
        firstFieldIds.add(firstField.localId);
      }

      if (lastField) {
        lastFieldIds.add(lastField.localId);
        sectionIdByLastFieldId.set(lastField.localId, section.id);
        const lastIndex = orderedFieldIndexByLocalId.get(lastField.localId);
        insertPositionByLastFieldId.set(
          lastField.localId,
          typeof lastIndex === "number" ? lastIndex + 1 : fields.length,
        );
        insertPositionBySectionId.set(
          section.id,
          typeof lastIndex === "number" ? lastIndex + 1 : fields.length,
        );
      } else {
        insertPositionBySectionId.set(section.id, fields.length);
      }

      if (isSectionCollapsed) {
        if (firstField) {
          headingByFieldId.set(firstField.localId, heading);
          sectionIdByFieldId.set(firstField.localId, section.id);
        }
      } else {
        for (const field of sectionFields) {
          headingByFieldId.set(field.localId, heading);
          sectionIdByFieldId.set(field.localId, section.id);
        }
      }
    });

    return {
      headingByFieldId,
      firstFieldIds,
      lastFieldIds,
      insertPositionByLastFieldId,
      insertPositionBySectionId,
      sectionIdByLastFieldId,
      sectionIdByFieldId,
    };
  }, [
    activeTab,
    editorSections,
    collapsedSectionIds,
    orderedFieldIndexByLocalId,
    fields.length,
  ]);

  useLayoutEffect(() => {
    if (activeTab !== "editor") {
      return;
    }

    const availableSectionIds = new Set(
      editorSections.map((section) => String(section.id)),
    );
    setCollapsedSectionIds((current) =>
      current.filter((id) => availableSectionIds.has(id)),
    );

    if (initializedSectionCollapseRef.current || editorSections.length === 0) {
      return;
    }

    initializedSectionCollapseRef.current = true;
    if (!isLargeFormEditor) {
      return;
    }

    setCollapsedSectionIds(
      editorSections.slice(1).map((section) => String(section.id)),
    );
  }, [activeTab, editorSections, isLargeFormEditor]);

  const collapsedSectionIdSet = useMemo(
    () => new Set(collapsedSectionIds),
    [collapsedSectionIds],
  );

  function expandSection(sectionKey: string) {
    setCollapsedSectionIds((current) => {
      if (isLargeFormEditor) {
        return editorSections
          .map((section) => String(section.id))
          .filter((id) => id !== sectionKey);
      }

      return current.filter((id) => id !== sectionKey);
    });
  }

  function collapseSection(sectionKey: string) {
    setCollapsedSectionIds((current) =>
      current.includes(sectionKey) ? current : [...current, sectionKey],
    );
  }

  function toggleSectionCollapse(sectionKey: string) {
    if (collapsedSectionIdSet.has(sectionKey)) {
      expandSection(sectionKey);
      return;
    }

    collapseSection(sectionKey);
  }

  function moveSection(sectionId: string, direction: "up" | "down") {
    setSections((current) => {
      const visible = current
        .filter((s) => s.is_visible)
        .sort((a, b) => a.sort_order - b.sort_order);
      const idx = visible.findIndex((s) => s.id === sectionId);
      if (idx < 0) return current;
      const target = direction === "up" ? idx - 1 : idx + 1;
      if (target < 0 || target >= visible.length) return current;

      const next = [...visible];
      const [moved] = next.splice(idx, 1);
      next.splice(target, 0, moved);

      const reordered = next.map((s, i) => ({ ...s, sort_order: i + 1 }));
      const hiddenSections = current.filter((s) => !s.is_visible);
      return [...reordered, ...hiddenSections];
    });
    setStatusMessage(
      "Orden de sección actualizado localmente. Guarda configuración para persistir.",
    );
  }

  function removeSection(sectionId: string) {
    const section = sections.find((s) => s.id === sectionId);
    if (!section) return;
    const sectionOrder = Math.max(
      1,
      sections
        .filter((candidate) => candidate.is_visible)
        .sort((a, b) => a.sort_order - b.sort_order)
        .findIndex((candidate) => candidate.id === section.id) + 1,
    );
    const sectionDisplayTitle =
      section.title.trim() ||
      getDefaultSectionTitle(section.section_key, sectionOrder);

    const fieldCount = fields.filter((f) => f.section_id === sectionId).length;
    const fallbackSection =
      sections.find((s) => s.section_key === "other" && s.id !== sectionId) ??
      sections.find((s) => s.id !== sectionId) ??
      null;

    const confirmed = confirmAction(
      fieldCount > 0
        ? `¿Eliminar la sección "${sectionDisplayTitle}"?\n\n${fieldCount} campo(s) se reasignarán automáticamente.`
        : `¿Eliminar la sección "${sectionDisplayTitle}"?`,
    );
    if (!confirmed) return;

    setSections((current) => current.filter((s) => s.id !== sectionId));

    if (fieldCount > 0) {
      setFields((current) =>
        current.map((f) =>
          f.section_id === sectionId
            ? { ...f, section_id: fallbackSection?.id ?? null }
            : f,
        ),
      );
    }

    setStatusMessage(
      fieldCount > 0
        ? `Sección eliminada. ${fieldCount} campo(s) reasignados localmente. Guarda para persistir.`
        : "Sección eliminada. Guarda configuración para persistir.",
    );
  }

  function renderSectionHeading(
    heading: string,
    sectionId: string,
    options?: { canCollapse?: boolean },
  ) {
    const section = sections.find((s) => s.id === sectionId);
    const position = sectionPositionById.get(sectionId);
    const isCollapsed = collapsedSectionIdSet.has(sectionId);
    const canCollapse = options?.canCollapse ?? true;
    const canMoveUp = Boolean(position && position.index > 0);
    const canMoveDown = Boolean(
      position && position.index < position.total - 1,
    );
    const canDelete = Boolean(section);

    return (
      <div className="admin-stage-section-heading-row">
        <div className="builder-section-title">{heading}</div>
        <div
          className="admin-stage-section-header-actions"
          role="group"
          aria-label="Acciones de sección"
        >
          <button
            type="button"
            className="admin-stage-section-header-btn"
            onClick={() => moveSection(sectionId, "up")}
            disabled={!canMoveUp}
            title="Subir sección"
            aria-label="Subir sección"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M12 19V5" />
              <path d="m5 12 7-7 7 7" />
            </svg>
          </button>
          <button
            type="button"
            className="admin-stage-section-header-btn"
            onClick={() => moveSection(sectionId, "down")}
            disabled={!canMoveDown}
            title="Bajar sección"
            aria-label="Bajar sección"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M12 5v14" />
              <path d="m19 12-7 7-7-7" />
            </svg>
          </button>
          <button
            type="button"
            className="admin-stage-section-header-btn"
            onClick={() => renameSection(sectionId)}
            title="Editar nombre de sección"
            aria-label="Editar nombre de sección"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
            </svg>
          </button>
          <button
            type="button"
            className="admin-stage-section-header-btn"
            onClick={() => removeSection(sectionId)}
            disabled={!canDelete}
            title={
              canDelete
                ? "Eliminar sección"
                : "No se pudo identificar la sección"
            }
            aria-label="Eliminar sección"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
          {canCollapse ? (
            <button
              type="button"
              className={`admin-stage-section-header-btn ${isCollapsed ? "" : "is-active"}`.trim()}
              onClick={() => toggleSectionCollapse(sectionId)}
              title={isCollapsed ? "Expandir sección" : "Colapsar sección"}
              aria-label={isCollapsed ? "Expandir sección" : "Colapsar sección"}
              aria-pressed={!isCollapsed}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                {isCollapsed ? (
                  <>
                    <path d="m9 18 6-6-6-6" />
                  </>
                ) : (
                  <>
                    <path d="m6 9 6 6 6-6" />
                  </>
                )}
              </svg>
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  function renderEmptySection(section: EditorSection) {
    const sectionNumber =
      editorSections.findIndex((candidate) => candidate.id === section.id) + 1;
    const sectionTitle =
      section.title.trim() ||
      getDefaultSectionTitle(section.sectionKey, sectionNumber);

    return (
      <div key={section.id} className="admin-stage-section-placeholder">
        {renderSectionHeading(
          `Sección ${sectionNumber}: ${sectionTitle}`,
          section.id,
          {
            canCollapse: false,
          },
        )}
        <div className="settings-card admin-stage-empty-section-card">
          <div className="editor-grid">
            <div className="form-field full">
              <label htmlFor={`section-title-${section.id}`}>
                Nombre de la sección
              </label>
              <input
                id={`section-title-${section.id}`}
                type="text"
                value={section.title}
                onChange={(event) =>
                  setSections((current) =>
                    current.map((item) =>
                      item.id === section.id
                        ? { ...item, title: event.target.value }
                        : item,
                    ),
                  )
                }
              />
              <small className="admin-text-muted">
                Guarda configuración para persistir esta sección.
              </small>
            </div>
          </div>
          <button
            type="button"
            className="add-field-btn"
            onClick={() => {
              const suffix = fields.length + 1;
              const seed = getNewFieldSeedForSection({
                sectionKey: section.sectionKey,
                suffix,
              });
              insertFieldAt(
                fields.length,
                {
                  field_key: seed.field_key,
                  field_label: seed.field_label,
                  field_type: seed.field_type,
                  is_required: false,
                  placeholder: "",
                  help_text: "",
                  is_active: true,
                },
                { sectionId: section.id },
              );
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Añadir nuevo campo en esta sección
          </button>
        </div>
      </div>
    );
  }

  return (
    <div id="view-process" className="view active admin-stage-editor-view">
      {/* Main Workspace */}
      <main className="main">
        <div className="canvas-header">
          {error && (
            <ErrorCallout
              message={error.message}
              errorId={error.errorId}
              context="stage_config"
            />
          )}
          {statusMessage && (
            <div
              className="admin-feedback success"
              style={{ marginBottom: "16px" }}
            >
              {statusMessage}
            </div>
          )}
          <div className="stage-status">Etapa Activa</div>
          <div className="canvas-title-row">
            <div>
              <h1>{settingsStageName.trim() || displayStageLabel}</h1>
              <p>
                Configura la captura de datos, reglas de acceso y notificaciones
                para {cycleName}.
              </p>
            </div>
            <div className="admin-stage-header-actions">
              <button
                type="button"
                className="btn btn-outline admin-stage-preview-btn"
                onClick={() => void openPreview()}
                disabled={isSaving}
                title={
                  hasUnsavedConfigChanges
                    ? "Guardará los cambios persistibles y abrirá la previsualización."
                    : "Abre la previsualización de la versión guardada."
                }
              >
                Previsualizar Formulario
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  void saveStageConfig();
                }}
                disabled={!canSavePersistedConfig}
                title={
                  isSaving
                    ? "Guardando configuración..."
                    : hasUnsavedConfigChanges
                      ? undefined
                      : "No hay cambios persistibles para guardar"
                }
              >
                {isSaving ? "Guardando..." : "Guardar configuración"}
              </button>
            </div>
          </div>
          <div
            className={`admin-stage-save-status ${saveStatusTone}`}
            aria-live="polite"
          >
            <div className="admin-stage-save-status-headline">
              <span
                className="admin-stage-save-status-dot"
                aria-hidden="true"
              />
              <span>{saveFeedbackLabel}</span>
              <span className="admin-stage-save-status-time">
                {saveFeedbackSummary}
              </span>
            </div>
          </div>

          <div className="page-tabs">
            <button
              className={`page-tab ${activeTab === "editor" ? "active" : ""}`}
              onClick={() => switchToTab("editor")}
            >
              Editor de Formulario
            </button>
            <button
              className={`page-tab ${activeTab === "settings" ? "active" : ""}`}
              onClick={() => switchToTab("settings")}
            >
              Ajustes y Reglas
            </button>
            <button
              className={`page-tab ${activeTab === "automations" ? "active" : ""}`}
              onClick={() => switchToTab("automations")}
            >
              Automatizaciones
            </button>
            <button
              className={`page-tab ${activeTab === "communications" ? "active" : ""}`}
              onClick={() => switchToTab("communications")}
            >
              Comunicaciones
            </button>
            <button
              className={`page-tab ${activeTab === "prompt_studio" ? "active" : ""}`}
              onClick={() => switchToTab("prompt_studio")}
            >
              Prompt Studio
            </button>
            <button
              className={`page-tab ${activeTab === "stats" ? "active" : ""}`}
              onClick={() => switchToTab("stats")}
            >
              Estadísticas
            </button>
          </div>
        </div>

        <div
          className={`canvas-body${
            activeTab === "communications" ||
            activeTab === "prompt_studio" ||
            activeTab === "automations"
              ? " wide"
              : ""
          }`}
        >
          {activeTab === "editor" && (
            <div id="tab-editor" className="tab-content active">
              <div className="field-list">
                {displayedEditorFields.length === 0 ? (
                  <>
                    <button
                      className="add-field-btn admin-stage-empty-add-field"
                      onClick={() => insertFieldAt(0)}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        aria-hidden="true"
                      >
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                      Añadir nuevo campo
                    </button>
                  </>
                ) : null}
                {displayedEditorFields.map((field) => {
                  const isEditing = activeFieldId === field.localId;
                  const isSectionStart =
                    editorFieldSectionMeta.firstFieldIds.has(field.localId);
                  const isSectionEnd = editorFieldSectionMeta.lastFieldIds.has(
                    field.localId,
                  );
                  const sectionHeading =
                    editorFieldSectionMeta.headingByFieldId.get(
                      field.localId,
                    ) ?? "Sección: Otros campos";
                  const sectionInsertPosition =
                    editorFieldSectionMeta.insertPositionByLastFieldId.get(
                      field.localId,
                    ) ?? fields.length;
                  const sectionIdForInsert =
                    editorFieldSectionMeta.sectionIdByLastFieldId.get(
                      field.localId,
                    ) ?? null;
                  const sectionId =
                    editorFieldSectionMeta.sectionIdByFieldId.get(
                      field.localId,
                    ) ?? null;
                  const isSectionCollapsed = sectionId
                    ? collapsedSectionIdSet.has(sectionId)
                    : false;
                  const aiParserConfig = normalizeFieldAiParserConfig(
                    field.ai_parser_config,
                  );
                  const aiReferenceUpload = aiReferenceUploadState[
                    field.localId
                  ] ?? {
                    isUploading: false,
                    error: null,
                  };

                  if (isSectionCollapsed && !isSectionStart) {
                    return null;
                  }

                  return (
                    <div key={field.localId}>
                      {isSectionStart && sectionId
                        ? renderSectionHeading(sectionHeading, sectionId)
                        : null}
                      {isSectionCollapsed ? null : (
                        <div
                          key={`${field.localId}-${isEditing ? "ed" : "st"}`}
                          id={`field-card-${field.localId}`}
                          className={[
                            "field-card",
                            isEditing ? "editing" : "",
                            dragOverFieldId === field.localId
                              ? "is-drag-over"
                              : "",
                            draggedFieldId === field.localId
                              ? "is-dragging"
                              : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          draggable={!isEditing}
                          onDragStart={() => setDraggedFieldId(field.localId)}
                          onDragOver={(event) => {
                            event.preventDefault();
                            setDragOverFieldId(field.localId);
                          }}
                          onDragLeave={() => {
                            setDragOverFieldId((current) =>
                              current === field.localId ? null : current,
                            );
                          }}
                          onDrop={(event) =>
                            handleFieldDrop(event, field.localId)
                          }
                          onDragEnd={() => {
                            setDraggedFieldId(null);
                            setDragOverFieldId(null);
                          }}
                        >
                          <div
                            className="field-header"
                            onClick={() =>
                              setActiveFieldId(isEditing ? null : field.localId)
                            }
                          >
                            <div
                              className={`drag-handle ${draggedFieldId === field.localId ? "dragging" : ""}`}
                            >
                              <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                              >
                                <circle cx="9" cy="12" r="1" />
                                <circle cx="9" cy="5" r="1" />
                                <circle cx="9" cy="19" r="1" />
                                <circle cx="15" cy="12" r="1" />
                                <circle cx="15" cy="5" r="1" />
                                <circle cx="15" cy="19" r="1" />
                              </svg>
                            </div>
                            <div className="field-icon">
                              {getFieldIcon(field.field_type)}
                            </div>
                            <div className="field-details">
                              <div className="field-name">
                                {field.field_label}{" "}
                                {field.is_required && (
                                  <span className="req-star">*</span>
                                )}
                                {isEditing && (
                                  <span className="editing-badge">
                                    Editando
                                  </span>
                                )}
                              </div>
                              <div className="field-type">
                                {getFieldTypeLabel(field.field_type)} • id:{" "}
                                <code>{field.field_key}</code>
                                {field.group_name?.trim() ? (
                                  <>
                                    {" "}
                                    • grupo: <span>{field.group_name}</span>
                                  </>
                                ) : null}
                              </div>
                            </div>
                            <div className="field-actions">
                              <button
                                className="btn-icon"
                                title="Editar"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveFieldId(
                                    isEditing ? null : field.localId,
                                  );
                                }}
                              >
                                <svg
                                  width="14"
                                  height="14"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                >
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                </svg>
                              </button>
                              <button
                                className="btn-icon danger"
                                title="Eliminar"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeField(field.localId);
                                }}
                              >
                                <svg
                                  width="14"
                                  height="14"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                >
                                  <polyline points="3 6 5 6 21 6" />
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                </svg>
                              </button>
                            </div>
                          </div>

                          {isEditing && (
                            <div
                              className="field-editor"
                              key={`editor-${field.localId}`}
                            >
                              <div className="editor-grid">
                                <div className="form-field full">
                                  <label htmlFor={`title-${field.localId}`}>
                                    Título
                                  </label>
                                  <input
                                    id={`title-${field.localId}`}
                                    type="text"
                                    defaultValue={field.field_label}
                                    onBlur={(event) => {
                                      const value = event.target.value;
                                      setFields((current) =>
                                        current.map((item) =>
                                          item.localId === field.localId
                                            ? {
                                                ...item,
                                                field_label: value,
                                                field_key:
                                                  item.id.startsWith("new-") ||
                                                  item.field_key.startsWith(
                                                    "nuevoCampo",
                                                  )
                                                    ? ensureUniqueFieldKey(
                                                        value,
                                                        field.localId,
                                                      )
                                                    : item.field_key,
                                              }
                                            : item,
                                        ),
                                      );
                                    }}
                                  />
                                </div>
                                <div className="form-field">
                                  <label htmlFor={`key-${field.localId}`}>
                                    Identificador interno (Clave)
                                  </label>
                                  <input
                                    id={`key-${field.localId}`}
                                    type="text"
                                    defaultValue={field.field_key}
                                    onBlur={(event) => {
                                      const nextFieldKey = normalizeFieldKey(
                                        event.target.value,
                                      );
                                      setFields((current) =>
                                        current.map((item) =>
                                          item.localId === field.localId
                                            ? {
                                                ...item,
                                                field_key: nextFieldKey,
                                              }
                                            : item,
                                        ),
                                      );
                                    }}
                                    style={{
                                      fontFamily: "monospace",
                                      color: "var(--muted)",
                                      background: "var(--paper)",
                                    }}
                                  />
                                </div>
                                <div className="form-field">
                                  <label htmlFor={`type-${field.localId}`}>
                                    Tipo de campo
                                  </label>
                                  <select
                                    id={`type-${field.localId}`}
                                    value={field.field_type}
                                    onChange={(event) => {
                                      const nextType = event.target
                                        .value as CycleStageField["field_type"];
                                      setFields((current) =>
                                        current.map((item) =>
                                          item.localId === field.localId
                                            ? {
                                                ...item,
                                                field_type: nextType,
                                                ai_parser_config:
                                                  nextType === "file"
                                                    ? normalizeFieldAiParserConfig(
                                                        item.ai_parser_config,
                                                      )
                                                    : null,
                                              }
                                            : item,
                                        ),
                                      );
                                    }}
                                  >
                                    <option value="short_text">
                                      Texto corto
                                    </option>
                                    <option value="long_text">
                                      Texto largo
                                    </option>
                                    <option value="number">Número</option>
                                    <option value="date">Fecha</option>
                                    <option value="email">Correo</option>
                                    <option value="file">Archivo</option>
                                  </select>
                                </div>
                                <div className="form-field full">
                                  <label
                                    htmlFor={`placeholder-${field.localId}`}
                                  >
                                    Placeholder
                                  </label>
                                  <input
                                    id={`placeholder-${field.localId}`}
                                    type="text"
                                    defaultValue={field.placeholder ?? ""}
                                    onBlur={(event) =>
                                      setFields((current) =>
                                        current.map((item) =>
                                          item.localId === field.localId
                                            ? {
                                                ...item,
                                                placeholder: event.target.value,
                                              }
                                            : item,
                                        ),
                                      )
                                    }
                                  />
                                </div>
                                <div className="form-field full">
                                  <label htmlFor={`help-${field.localId}`}>
                                    Ayuda
                                  </label>
                                  <input
                                    id={`help-${field.localId}`}
                                    type="text"
                                    defaultValue={field.help_text ?? ""}
                                    onBlur={(event) =>
                                      setFields((current) =>
                                        current.map((item) =>
                                          item.localId === field.localId
                                            ? {
                                                ...item,
                                                help_text: event.target.value,
                                              }
                                            : item,
                                        ),
                                      )
                                    }
                                  />
                                </div>
                                <div className="form-field full">
                                  <label
                                    htmlFor={`group-name-${field.localId}`}
                                  >
                                    Nombre de grupo (opcional)
                                  </label>
                                  <input
                                    id={`group-name-${field.localId}`}
                                    type="text"
                                    defaultValue={field.group_name ?? ""}
                                    onBlur={(event) =>
                                      setFields((current) =>
                                        current.map((item) =>
                                          item.localId === field.localId
                                            ? {
                                                ...item,
                                                group_name:
                                                  event.target.value.trim() ||
                                                  null,
                                              }
                                            : item,
                                        ),
                                      )
                                    }
                                  />
                                  <small className="admin-text-muted">
                                    Si lo completas, este campo se mostrará
                                    agrupado bajo ese título en la vista del
                                    postulante.
                                  </small>
                                </div>

                                <div
                                  className="form-field full"
                                  style={{ marginTop: "16px" }}
                                >
                                  <div
                                    className="switch-wrapper"
                                    style={{
                                      borderColor: "var(--maroon-soft)",
                                      background: "var(--paper)",
                                      marginBottom: "8px",
                                    }}
                                  >
                                    <div>
                                      <div
                                        style={{
                                          fontSize: "0.8rem",
                                          fontWeight: 500,
                                          color: "var(--ink)",
                                        }}
                                      >
                                        Campo obligatorio
                                      </div>
                                      <div
                                        style={{
                                          fontSize: "0.75rem",
                                          color: "var(--muted)",
                                        }}
                                      >
                                        El postulante no podrá avanzar si no
                                        responde.
                                      </div>
                                    </div>
                                    <label className="switch">
                                      <input
                                        type="checkbox"
                                        checked={field.is_required}
                                        onChange={(event) =>
                                          setFields((current) =>
                                            current.map((item) =>
                                              item.localId === field.localId
                                                ? {
                                                    ...item,
                                                    is_required:
                                                      event.target.checked,
                                                  }
                                                : item,
                                            ),
                                          )
                                        }
                                      />
                                      <span className="slider"></span>
                                    </label>
                                  </div>
                                  <div
                                    className="switch-wrapper"
                                    style={{
                                      borderColor: "var(--maroon-soft)",
                                      background: "var(--paper)",
                                    }}
                                  >
                                    <div>
                                      <div
                                        style={{
                                          fontSize: "0.8rem",
                                          fontWeight: 500,
                                          color: "var(--ink)",
                                        }}
                                      >
                                        Campo visible
                                      </div>
                                      <div
                                        style={{
                                          fontSize: "0.75rem",
                                          color: "var(--muted)",
                                        }}
                                      >
                                        Si está oculto, los postulantes no lo
                                        verán.
                                      </div>
                                    </div>
                                    <label className="switch">
                                      <input
                                        type="checkbox"
                                        checked={field.is_active}
                                        onChange={(event) =>
                                          setFields((current) =>
                                            current.map((item) =>
                                              item.localId === field.localId
                                                ? {
                                                    ...item,
                                                    is_active:
                                                      event.target.checked,
                                                  }
                                                : item,
                                            ),
                                          )
                                        }
                                      />
                                      <span className="slider"></span>
                                    </label>
                                  </div>
                                  {field.field_type === "file" ? (
                                    <div className="admin-ai-parser-panel">
                                      <div
                                        className="switch-wrapper"
                                        style={{
                                          borderColor: "var(--maroon-soft)",
                                          background: "var(--paper)",
                                        }}
                                      >
                                        <div>
                                          <div
                                            style={{
                                              fontSize: "0.8rem",
                                              fontWeight: 500,
                                              color: "var(--ink)",
                                            }}
                                          >
                                            Parsing con IA{" "}
                                            <FieldHint label="Qué hace parsing con IA">
                                              Habilita el análisis OCR con
                                              esquema JSON para este archivo
                                              desde la vista de administración.
                                            </FieldHint>
                                          </div>
                                          <div
                                            style={{
                                              fontSize: "0.75rem",
                                              color: "var(--muted)",
                                            }}
                                          >
                                            Actívalo solo para archivos que
                                            quieras procesar automáticamente.
                                          </div>
                                        </div>
                                        <label className="switch">
                                          <input
                                            type="checkbox"
                                            aria-label={`Habilitar parsing IA para ${field.field_label}`}
                                            checked={Boolean(
                                              aiParserConfig?.enabled,
                                            )}
                                            onChange={(event) => {
                                              if (event.target.checked) {
                                                updateFieldByLocalId(
                                                  field.localId,
                                                  (item) => ({
                                                    ...item,
                                                    ai_parser_config:
                                                      createDefaultFieldAiParserConfig(),
                                                  }),
                                                );
                                                return;
                                              }
                                              updateFieldByLocalId(
                                                field.localId,
                                                (item) => ({
                                                  ...item,
                                                  ai_parser_config: null,
                                                }),
                                              );
                                            }}
                                          />
                                          <span className="slider"></span>
                                        </label>
                                      </div>
                                      {aiParserConfig?.enabled ? (
                                        <div className="admin-ai-parser-editor">
                                          <div className="form-field full">
                                            <label
                                              htmlFor={`ai-parser-extraction-${field.localId}`}
                                            >
                                              Instrucciones de extracción{" "}
                                              <FieldHint label="Cómo redactar la extracción">
                                                Especifica exactamente qué datos
                                                extraer y cómo validarlos. Evita
                                                instrucciones ambiguas.
                                              </FieldHint>
                                            </label>
                                            <textarea
                                              id={`ai-parser-extraction-${field.localId}`}
                                              rows={4}
                                              value={
                                                aiParserConfig.extractionInstructions
                                              }
                                              onChange={(event) =>
                                                updateFieldAiParserConfig(
                                                  field.localId,
                                                  (currentConfig) => ({
                                                    ...currentConfig,
                                                    extractionInstructions:
                                                      event.target.value,
                                                  }),
                                                )
                                              }
                                            />
                                          </div>
                                          <div className="form-field full">
                                            <label>
                                              Archivos de referencia{" "}
                                              <FieldHint label="Cómo usar referencias OCR">
                                                Sube PDFs o imágenes de ejemplo
                                                para dar contexto al modelo. Se
                                                enviarán junto con el documento
                                                del postulante cada vez que
                                                corra el OCR de este campo.
                                              </FieldHint>
                                            </label>
                                            <div className="admin-ai-parser-reference-upload">
                                              <label className="btn btn-outline">
                                                <input
                                                  type="file"
                                                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                                                  multiple
                                                  style={{ display: "none" }}
                                                  aria-label={`Subir referencias OCR para ${field.field_label}`}
                                                  onChange={(event) => {
                                                    void uploadAiParserReferenceFiles(
                                                      field.localId,
                                                      event.target.files ?? [],
                                                    );
                                                    event.target.value = "";
                                                  }}
                                                />
                                                {aiReferenceUpload.isUploading
                                                  ? "Subiendo referencias..."
                                                  : "Subir referencias"}
                                              </label>
                                            </div>
                                            {aiReferenceUpload.error ? (
                                              <div
                                                className="form-hint"
                                                style={{
                                                  color: "var(--danger)",
                                                }}
                                              >
                                                {aiReferenceUpload.error}
                                              </div>
                                            ) : null}
                                            {(
                                              aiParserConfig.referenceFiles ??
                                              []
                                            ).length > 0 ? (
                                              <div className="admin-ai-parser-reference-list">
                                                {(
                                                  aiParserConfig.referenceFiles ??
                                                  []
                                                ).map((referenceFile) => (
                                                  <div
                                                    key={referenceFile.path}
                                                    className="admin-ai-parser-reference-item"
                                                  >
                                                    <div>
                                                      <div>
                                                        {referenceFile.fileName}
                                                      </div>
                                                      <div className="admin-ai-parser-reference-meta">
                                                        {referenceFile.mimeType}{" "}
                                                        •{" "}
                                                        {formatFileSize(
                                                          referenceFile.sizeBytes,
                                                        )}
                                                      </div>
                                                    </div>
                                                    <button
                                                      type="button"
                                                      className="btn btn-ghost btn-sm"
                                                      onClick={() =>
                                                        removeAiParserReferenceFile(
                                                          field.localId,
                                                          referenceFile.path,
                                                        )
                                                      }
                                                    >
                                                      Quitar
                                                    </button>
                                                  </div>
                                                ))}
                                              </div>
                                            ) : null}
                                          </div>
                                          <div className="form-field full">
                                            <label>
                                              Campos esperados del documento{" "}
                                              <FieldHint label="Definir campos esperados">
                                                Define las salidas esperadas de
                                                OCR en lenguaje simple. Se
                                                convierten automáticamente a un
                                                esquema JSON.
                                              </FieldHint>
                                            </label>
                                            <div className="admin-ai-parser-schema-builder">
                                              {(
                                                aiParserConfig.expectedOutputFields ??
                                                []
                                              ).map(
                                                (outputField, fieldIndex) => (
                                                  <div
                                                    key={`ai-parser-output-${field.localId}-${fieldIndex}`}
                                                    className="admin-ai-parser-schema-row"
                                                  >
                                                    <input
                                                      type="text"
                                                      className="admin-ai-parser-key-input"
                                                      value={outputField.key}
                                                      placeholder="fecha-de-nacimiento"
                                                      autoCapitalize="none"
                                                      autoCorrect="off"
                                                      spellCheck={false}
                                                      onChange={(event) =>
                                                        updateExpectedOutputField(
                                                          field.localId,
                                                          fieldIndex,
                                                          {
                                                            key: event.target
                                                              .value,
                                                          },
                                                        )
                                                      }
                                                      onBlur={() =>
                                                        finalizeExpectedOutputFields(
                                                          field.localId,
                                                        )
                                                      }
                                                      aria-label={`Clave OCR ${fieldIndex + 1}`}
                                                    />
                                                    <select
                                                      value={outputField.type}
                                                      onChange={(event) =>
                                                        updateExpectedOutputField(
                                                          field.localId,
                                                          fieldIndex,
                                                          {
                                                            type: event.target
                                                              .value as OcrExpectedOutputFieldType,
                                                          },
                                                        )
                                                      }
                                                      aria-label={`Tipo OCR ${fieldIndex + 1}`}
                                                    >
                                                      {OCR_EXPECTED_OUTPUT_TYPES.map(
                                                        (typeValue) => (
                                                          <option
                                                            key={`ocr-output-type-${typeValue}`}
                                                            value={typeValue}
                                                          >
                                                            {
                                                              OCR_OUTPUT_FIELD_TYPE_LABELS[
                                                                typeValue
                                                              ]
                                                            }
                                                          </option>
                                                        ),
                                                      )}
                                                    </select>
                                                    <button
                                                      type="button"
                                                      className="btn btn-outline"
                                                      onClick={() =>
                                                        removeExpectedOutputField(
                                                          field.localId,
                                                          fieldIndex,
                                                        )
                                                      }
                                                      aria-label={`Eliminar campo OCR ${fieldIndex + 1}`}
                                                    >
                                                      Eliminar
                                                    </button>
                                                    <div className="form-hint admin-ai-parser-schema-preview">
                                                      {`${field.field_key}_${normalizeOcrOutputKey(outputField.key || "campo")}`}
                                                    </div>
                                                  </div>
                                                ),
                                              )}
                                              <button
                                                type="button"
                                                className="btn btn-outline"
                                                onClick={() =>
                                                  addExpectedOutputField(
                                                    field.localId,
                                                  )
                                                }
                                              >
                                                + Añadir campo OCR
                                              </button>
                                            </div>
                                          </div>
                                          <details className="admin-ai-parser-advanced">
                                            <summary>
                                              Opciones avanzadas
                                            </summary>
                                            <div className="form-field full">
                                              <label
                                                htmlFor={`ai-parser-schema-${field.localId}`}
                                              >
                                                Esquema JSON esperado (avanzado)
                                              </label>
                                              <textarea
                                                id={`ai-parser-schema-${field.localId}`}
                                                rows={6}
                                                value={
                                                  aiParserConfig.expectedSchemaTemplate
                                                }
                                                onChange={(event) =>
                                                  updateFieldAiParserConfig(
                                                    field.localId,
                                                    (currentConfig) => {
                                                      const nextTemplate =
                                                        event.target.value;
                                                      return {
                                                        ...currentConfig,
                                                        expectedSchemaTemplate:
                                                          nextTemplate,
                                                        expectedOutputFields:
                                                          parseExpectedOutputFieldsFromSchemaTemplate(
                                                            nextTemplate,
                                                          ),
                                                      };
                                                    },
                                                  )
                                                }
                                                style={{
                                                  fontFamily: "monospace",
                                                }}
                                              />
                                            </div>
                                            <div className="form-field full">
                                              <label
                                                htmlFor={`ai-parser-system-${field.localId}`}
                                              >
                                                System prompt adicional
                                              </label>
                                              <textarea
                                                id={`ai-parser-system-${field.localId}`}
                                                rows={3}
                                                value={
                                                  aiParserConfig.systemPrompt ??
                                                  ""
                                                }
                                                onChange={(event) =>
                                                  updateFieldAiParserConfig(
                                                    field.localId,
                                                    (currentConfig) => ({
                                                      ...currentConfig,
                                                      systemPrompt:
                                                        event.target.value ||
                                                        null,
                                                    }),
                                                  )
                                                }
                                              />
                                            </div>
                                            <div className="form-field full">
                                              <label
                                                htmlFor={`ai-parser-prompt-${field.localId}`}
                                              >
                                                Prompt base opcional
                                              </label>
                                              <textarea
                                                id={`ai-parser-prompt-${field.localId}`}
                                                rows={3}
                                                value={
                                                  aiParserConfig.promptTemplate ??
                                                  ""
                                                }
                                                onChange={(event) =>
                                                  updateFieldAiParserConfig(
                                                    field.localId,
                                                    (currentConfig) => ({
                                                      ...currentConfig,
                                                      promptTemplate:
                                                        event.target.value ||
                                                        null,
                                                    }),
                                                  )
                                                }
                                              />
                                            </div>
                                          </details>
                                          <div
                                            className="switch-wrapper"
                                            style={{
                                              borderColor: "var(--maroon-soft)",
                                              background: "var(--paper)",
                                            }}
                                          >
                                            <div>
                                              <div
                                                style={{
                                                  fontSize: "0.8rem",
                                                  fontWeight: 500,
                                                  color: "var(--ink)",
                                                }}
                                              >
                                                Validación estricta de esquema
                                              </div>
                                              <div
                                                style={{
                                                  fontSize: "0.75rem",
                                                  color: "var(--muted)",
                                                }}
                                              >
                                                Falla la corrida si el JSON no
                                                coincide exactamente con el
                                                esquema.
                                              </div>
                                            </div>
                                            <label className="switch">
                                              <input
                                                type="checkbox"
                                                aria-label={`Validación estricta para ${field.field_label}`}
                                                checked={
                                                  aiParserConfig.strictSchema
                                                }
                                                onChange={(event) =>
                                                  updateFieldAiParserConfig(
                                                    field.localId,
                                                    (currentConfig) => ({
                                                      ...currentConfig,
                                                      strictSchema:
                                                        event.target.checked,
                                                    }),
                                                  )
                                                }
                                              />
                                              <span className="slider"></span>
                                            </label>
                                          </div>
                                        </div>
                                      ) : null}
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                              <div className="admin-field-editor-footer">
                                <button
                                  className="btn btn-ghost"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveFieldId(null);
                                  }}
                                >
                                  Cancelar
                                </button>
                                <button
                                  className="btn btn-primary"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setStatusMessage(
                                      "Campo actualizado localmente. Haz clic en Guardar configuración para persistir los cambios.",
                                    );
                                    setActiveFieldId(null);
                                  }}
                                >
                                  Aplicar cambios
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      {isSectionEnd && !isSectionCollapsed ? (
                        <button
                          className="add-field-btn admin-stage-section-add-field"
                          onClick={() => {
                            const suffix = fields.length + 1;
                            const insertSection = sectionIdForInsert
                              ? editorSections.find(
                                  (s) => s.id === sectionIdForInsert,
                                )
                              : null;
                            const seed = getNewFieldSeedForSection({
                              sectionKey: insertSection?.sectionKey ?? "other",
                              suffix,
                            });
                            insertFieldAt(
                              sectionInsertPosition,
                              {
                                field_key: seed.field_key,
                                field_label: seed.field_label,
                                field_type: seed.field_type,
                                is_required: false,
                                placeholder: "",
                                help_text: "",
                                is_active: true,
                              },
                              {
                                sectionId: sectionIdForInsert,
                              },
                            );
                          }}
                        >
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            aria-hidden="true"
                          >
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <line x1="5" y1="12" x2="19" y2="12" />
                          </svg>
                          Añadir nuevo campo
                        </button>
                      ) : null}
                    </div>
                  );
                })}
                {sectionPlaceholders.map((placeholder, index) => (
                  <div
                    key={placeholder.localId}
                    className="admin-stage-section-placeholder"
                  >
                    <div className="admin-stage-section-heading-row">
                      <div className="builder-section-title">
                        {`Sección ${editorSections.length + index + 1}: ${placeholder.title}`}
                      </div>
                    </div>
                    <div className="settings-card admin-stage-empty-section-card">
                      <div className="editor-grid">
                        <div className="form-field full">
                          <label
                            htmlFor={`section-title-${placeholder.localId}`}
                          >
                            Nombre de la sección
                          </label>
                          <input
                            id={`section-title-${placeholder.localId}`}
                            type="text"
                            value={placeholder.title}
                            onChange={(event) =>
                              setSectionPlaceholders((current) =>
                                current.map((draft) =>
                                  draft.localId === placeholder.localId
                                    ? { ...draft, title: event.target.value }
                                    : draft,
                                ),
                              )
                            }
                          />
                          <small className="admin-text-muted">
                            La sección quedará visible cuando agregues al menos
                            un campo.
                          </small>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="add-field-btn"
                        onClick={() => addFieldToPlaceholder(placeholder)}
                      >
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          aria-hidden="true"
                        >
                          <line x1="12" y1="5" x2="12" y2="19" />
                          <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                        Añadir nuevo campo en esta sección
                      </button>
                    </div>
                  </div>
                ))}
                {emptySections.map((section) => renderEmptySection(section))}
                <div className="admin-stage-editor-add-section">
                  <button
                    type="button"
                    className="btn btn-ghost admin-maroon-text"
                    onClick={addNextSection}
                  >
                    + Añadir nueva sección
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === "settings" && (
            <div id="tab-settings" className="tab-content active">
              <div className="settings-card">
                <div className="settings-card-header">
                  <h3>Información General</h3>
                  <p>Datos básicos de la etapa que verán los postulantes.</p>
                </div>
                <div className="editor-grid">
                  <div className="form-field full">
                    <label htmlFor={`stage-name-${stageCode}`}>
                      Nombre de la etapa
                    </label>
                    <input
                      id={`stage-name-${stageCode}`}
                      type="text"
                      value={settingsStageName}
                      onChange={(event) =>
                        setSettingsStageName(event.target.value)
                      }
                    />
                  </div>
                  <div className="form-field full">
                    <label htmlFor={`stage-description-${stageCode}`}>
                      Instrucciones de la etapa
                      <FieldHint label="Sobre las instrucciones">
                        Se muestra primero en el paso inicial del postulante.
                        Soporta encabezados, listas, enfasis y enlaces seguros.
                      </FieldHint>
                    </label>
                    <textarea
                      id={`stage-description-${stageCode}`}
                      rows={5}
                      value={settingsDescription}
                      onChange={(event) =>
                        setSettingsDescription(event.target.value)
                      }
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor={`stage-open-date-${stageCode}`}>
                      Fecha de apertura
                    </label>
                    <input
                      id={`stage-open-date-${stageCode}`}
                      type="date"
                      value={settingsOpenDate}
                      onChange={(event) =>
                        setSettingsOpenDate(event.target.value)
                      }
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor={`stage-close-date-${stageCode}`}>
                      Fecha de cierre
                    </label>
                    <input
                      id={`stage-close-date-${stageCode}`}
                      type="date"
                      value={settingsCloseDate}
                      onChange={(event) =>
                        setSettingsCloseDate(event.target.value)
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="settings-card">
                <div className="settings-card-header">
                  <h3>Reglas de Acceso</h3>
                  <p>
                    Condiciones para que un postulante pueda ingresar a esta
                    etapa.
                  </p>
                </div>
                <div className="admin-stage-settings-stack">
                  <div className="form-field">
                    <label htmlFor={`prev-stage-${stageCode}`}>
                      Etapa previa requerida
                    </label>
                    <select
                      id={`prev-stage-${stageCode}`}
                      value={previousStageRequirement}
                      onChange={(event) =>
                        setPreviousStageRequirement(event.target.value)
                      }
                    >
                      <option value="none">Ninguna (acceso directo)</option>
                      <option value="main_form">1. Formulario Principal</option>
                      <option value="exam_placeholder">
                        2. Examen Académico
                      </option>
                      {stageTemplates
                        .filter((template) => template.id !== stageId)
                        .filter(
                          (template) =>
                            template.stage_code !== "documents" &&
                            template.stage_code !== "exam_placeholder",
                        )
                        .sort((a, b) => a.sort_order - b.sort_order)
                        .map((template, index) => (
                          <option key={template.id} value={template.id}>
                            {`${index + 3}. ${template.stage_label}`}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="switch-wrapper">
                    <div>
                      <div className="admin-switch-label">
                        Bloquear si no cumple requisitos
                      </div>
                      <div className="admin-switch-help">
                        El postulante no podrá ver esta etapa si fue rechazado
                        en la etapa previa.
                      </div>
                    </div>
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={blockIfPreviousNotMet}
                        onChange={(event) =>
                          setBlockIfPreviousNotMet(event.target.checked)
                        }
                      />
                      <span className="slider"></span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="settings-card">
                <div className="settings-card-header">
                  <h3>Rúbrica de Elegibilidad Automática</h3>
                  <p>
                    Define criterios para clasificar postulaciones como{" "}
                    <strong>elegible</strong>, <strong>no elegible</strong> o{" "}
                    <strong>revisión manual</strong>.
                  </p>
                </div>
                <div className="editor-grid">
                  <div className="form-field full">
                    <details className="rubric-template-details">
                      <summary className="rubric-template-summary">
                        Generador de plantilla UWC Perú
                      </summary>
                      <div className="rubric-template-body">
                        <div
                          className="form-hint"
                          style={{ marginBottom: "12px" }}
                        >
                          Selecciona los campos del formulario que corresponden
                          a cada dato requerido. Al aplicar, se generará una
                          rúbrica pre-configurada con criterios editables.
                        </div>
                        <div className="editor-grid">
                          <div className="form-field full">
                            <label>
                              Campos de archivo para identidad
                              (DNI/Pasaporte/Carnet)
                            </label>
                            <div
                              style={{
                                display: "flex",
                                gap: "12px",
                                flexWrap: "wrap",
                              }}
                            >
                              {rubricFileFieldOptions.length > 0 ? (
                                rubricFileFieldOptions.map((option) => (
                                  <label
                                    key={`tpl-id-${option.value}`}
                                    style={{
                                      display: "flex",
                                      gap: "6px",
                                      alignItems: "center",
                                    }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={uwcPresetDraft.idDocumentFileKeys.includes(
                                        option.value,
                                      )}
                                      onChange={() =>
                                        togglePresetFileKey(
                                          "idDocumentFileKeys",
                                          option.value,
                                        )
                                      }
                                    />
                                    {option.label}
                                  </label>
                                ))
                              ) : (
                                <span className="form-hint">
                                  No hay campos de archivo disponibles.
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="form-field full">
                            <label>
                              Campos de archivo para notas oficiales
                            </label>
                            <div
                              style={{
                                display: "flex",
                                gap: "12px",
                                flexWrap: "wrap",
                              }}
                            >
                              {rubricFileFieldOptions.length > 0 ? (
                                rubricFileFieldOptions.map((option) => (
                                  <label
                                    key={`tpl-grades-${option.value}`}
                                    style={{
                                      display: "flex",
                                      gap: "6px",
                                      alignItems: "center",
                                    }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={uwcPresetDraft.gradesDocumentFileKeys.includes(
                                        option.value,
                                      )}
                                      onChange={() =>
                                        togglePresetFileKey(
                                          "gradesDocumentFileKeys",
                                          option.value,
                                        )
                                      }
                                    />
                                    {option.label}
                                  </label>
                                ))
                              ) : (
                                <span className="form-hint">
                                  No hay campos de archivo disponibles.
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="form-field">
                            <label htmlFor={`tpl-name-${stageCode}`}>
                              Campo nombre postulante
                            </label>
                            <select
                              id={`tpl-name-${stageCode}`}
                              value={uwcPresetDraft.applicantNameFieldKey ?? ""}
                              onChange={(event) =>
                                setUwcPresetDraft((current) => ({
                                  ...current,
                                  applicantNameFieldKey:
                                    event.target.value || null,
                                }))
                              }
                            >
                              <option value="">Selecciona un campo</option>
                              {rubricFieldOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="form-field">
                            <label htmlFor={`tpl-average-${stageCode}`}>
                              Campo promedio de notas (numérico)
                            </label>
                            <select
                              id={`tpl-average-${stageCode}`}
                              value={uwcPresetDraft.averageGradeFieldKey ?? ""}
                              onChange={(event) =>
                                setUwcPresetDraft((current) => ({
                                  ...current,
                                  averageGradeFieldKey:
                                    event.target.value || null,
                                }))
                              }
                            >
                              <option value="">Selecciona un campo</option>
                              {rubricNumberFieldOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="form-field">
                            <label htmlFor={`tpl-authorization-${stageCode}`}>
                              Campo autorización firmada
                            </label>
                            <select
                              id={`tpl-authorization-${stageCode}`}
                              value={
                                uwcPresetDraft.signedAuthorizationFileKey ?? ""
                              }
                              onChange={(event) =>
                                setUwcPresetDraft((current) => ({
                                  ...current,
                                  signedAuthorizationFileKey:
                                    event.target.value || null,
                                }))
                              }
                            >
                              <option value="">Selecciona un campo</option>
                              {rubricFileFieldOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="form-field">
                            <label htmlFor={`tpl-photo-${stageCode}`}>
                              Campo foto postulante
                            </label>
                            <select
                              id={`tpl-photo-${stageCode}`}
                              value={uwcPresetDraft.applicantPhotoFileKey ?? ""}
                              onChange={(event) =>
                                setUwcPresetDraft((current) => ({
                                  ...current,
                                  applicantPhotoFileKey:
                                    event.target.value || null,
                                }))
                              }
                            >
                              <option value="">Selecciona un campo</option>
                              {rubricFileFieldOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="form-field">
                            <label htmlFor={`tpl-top-third-${stageCode}`}>
                              Campo archivo de tercio superior (opcional)
                            </label>
                            <select
                              id={`tpl-top-third-${stageCode}`}
                              value={uwcPresetDraft.topThirdProofFileKey ?? ""}
                              onChange={(event) =>
                                setUwcPresetDraft((current) => ({
                                  ...current,
                                  topThirdProofFileKey:
                                    event.target.value || null,
                                }))
                              }
                            >
                              <option value="">Sin archivo dedicado</option>
                              {rubricFileFieldOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="form-field">
                            <label htmlFor={`tpl-birth-years-${stageCode}`}>
                              Años de nacimiento permitidos (coma)
                            </label>
                            <input
                              id={`tpl-birth-years-${stageCode}`}
                              type="text"
                              value={uwcPresetDraft.allowedBirthYears.join(
                                ", ",
                              )}
                              onChange={(event) =>
                                setUwcPresetDraft((current) => ({
                                  ...current,
                                  allowedBirthYears: parseCommaSeparatedNumbers(
                                    event.target.value,
                                  ),
                                }))
                              }
                            />
                          </div>
                          <div className="form-field">
                            <label htmlFor={`tpl-average-min-${stageCode}`}>
                              Promedio mínimo (0-20)
                            </label>
                            <input
                              id={`tpl-average-min-${stageCode}`}
                              type="number"
                              min={0}
                              max={20}
                              step={0.1}
                              value={String(uwcPresetDraft.minAverageGrade)}
                              onChange={(event) =>
                                setUwcPresetDraft((current) => ({
                                  ...current,
                                  minAverageGrade:
                                    Number(event.target.value) || 14,
                                }))
                              }
                            />
                          </div>
                          <div className="form-field">
                            <label htmlFor={`tpl-min-responses-${stageCode}`}>
                              Respuestas mínimas por recomendación
                            </label>
                            <input
                              id={`tpl-min-responses-${stageCode}`}
                              type="number"
                              min={0}
                              max={20}
                              step={1}
                              value={String(
                                uwcPresetDraft.minRecommendationResponses,
                              )}
                              onChange={(event) =>
                                setUwcPresetDraft((current) => ({
                                  ...current,
                                  minRecommendationResponses:
                                    Number(event.target.value) || 0,
                                }))
                              }
                            />
                          </div>
                          <div className="form-field">
                            <label htmlFor={`tpl-ocr-name-${stageCode}`}>
                              OCR path para nombre
                            </label>
                            <input
                              id={`tpl-ocr-name-${stageCode}`}
                              type="text"
                              value={uwcPresetDraft.ocrNamePath}
                              onChange={(event) =>
                                setUwcPresetDraft((current) => ({
                                  ...current,
                                  ocrNamePath: event.target.value,
                                }))
                              }
                            />
                          </div>
                          <div className="form-field">
                            <label htmlFor={`tpl-ocr-birth-${stageCode}`}>
                              OCR path para año nacimiento
                            </label>
                            <input
                              id={`tpl-ocr-birth-${stageCode}`}
                              type="text"
                              value={uwcPresetDraft.ocrBirthYearPath}
                              onChange={(event) =>
                                setUwcPresetDraft((current) => ({
                                  ...current,
                                  ocrBirthYearPath: event.target.value,
                                }))
                              }
                            />
                          </div>
                          <div className="form-field">
                            <label htmlFor={`tpl-ocr-doc-type-${stageCode}`}>
                              OCR path para tipo documento
                            </label>
                            <input
                              id={`tpl-ocr-doc-type-${stageCode}`}
                              type="text"
                              value={uwcPresetDraft.ocrDocumentTypePath}
                              onChange={(event) =>
                                setUwcPresetDraft((current) => ({
                                  ...current,
                                  ocrDocumentTypePath: event.target.value,
                                }))
                              }
                            />
                          </div>
                          <div className="form-field">
                            <label htmlFor={`tpl-ocr-doc-issue-${stageCode}`}>
                              OCR path para observaciones de documento
                            </label>
                            <input
                              id={`tpl-ocr-doc-issue-${stageCode}`}
                              type="text"
                              value={uwcPresetDraft.ocrDocumentIssuePath}
                              onChange={(event) =>
                                setUwcPresetDraft((current) => ({
                                  ...current,
                                  ocrDocumentIssuePath: event.target.value,
                                }))
                              }
                            />
                          </div>
                          <div className="switch-wrapper">
                            <div>
                              <div className="admin-switch-label">
                                Marcar combinación de múltiples certificados
                                como revisión manual
                              </div>
                            </div>
                            <label className="switch">
                              <input
                                type="checkbox"
                                checked={
                                  uwcPresetDraft.limitGradesDocumentToSingleUpload
                                }
                                onChange={(event) =>
                                  setUwcPresetDraft((current) => ({
                                    ...current,
                                    limitGradesDocumentToSingleUpload:
                                      event.target.checked,
                                    gradesCombinationRule: event.target.checked
                                      ? "single_or_review"
                                      : "allow_multiple",
                                  }))
                                }
                              />
                              <span className="slider" />
                            </label>
                          </div>
                          <div
                            className="form-field full"
                            style={{
                              display: "flex",
                              gap: "8px",
                              flexWrap: "wrap",
                            }}
                          >
                            <button
                              type="button"
                              className="btn btn-primary"
                              onClick={applyUwcPeruTemplate}
                            >
                              Generar rúbrica desde plantilla
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline"
                              onClick={() =>
                                setUwcPresetDraft(suggestedUwcPresetDraft)
                              }
                            >
                              Recargar sugerencias desde campos actuales
                            </button>
                          </div>
                        </div>
                      </div>
                    </details>

                    {rubricFeedback && (
                      <div
                        className={`admin-feedback ${rubricFeedback.type === "error" ? "error" : "success"}`}
                        style={{ marginBottom: "10px", whiteSpace: "pre-line" }}
                      >
                        {rubricFeedback.message}
                      </div>
                    )}

                    <div className="rubric-toolbar">
                      <div className="rubric-toolbar-left">
                        <div className="switch-wrapper" style={{ margin: 0 }}>
                          <div>
                            <div className="admin-switch-label">
                              Habilitar rúbrica
                            </div>
                          </div>
                          <label className="switch">
                            <input
                              type="checkbox"
                              checked={settingsEligibilityRubricDraft.enabled}
                              onChange={(event) =>
                                syncGuidedRubricDraft({
                                  ...settingsEligibilityRubricDraft,
                                  enabled: event.target.checked,
                                })
                              }
                            />
                            <span className="slider" />
                          </label>
                        </div>
                      </div>
                      <div className="rubric-toolbar-right">
                        <button
                          type="button"
                          className={`btn btn-sm ${rubricEditorMode === "guided" ? "btn-primary" : "btn-outline"}`}
                          onClick={() => handleRubricModeChange("guided")}
                        >
                          Visual
                        </button>
                        <button
                          type="button"
                          className={`btn btn-sm ${rubricEditorMode === "json" ? "btn-primary" : "btn-outline"}`}
                          onClick={() => handleRubricModeChange("json")}
                        >
                          JSON
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline"
                          onClick={validateRubricFromEditor}
                        >
                          Validar
                        </button>
                      </div>
                    </div>

                    {rubricEditorMode === "guided" ? (
                      <div className="rubric-criteria-list">
                        {settingsEligibilityRubricDraft.enabled ? (
                          <>
                            {settingsEligibilityRubricDraft.criteria.length ===
                            0 ? (
                              <div className="rubric-empty-state">
                                No hay criterios configurados. Usa el generador
                                de plantilla o agrega criterios manualmente.
                              </div>
                            ) : null}
                            {settingsEligibilityRubricDraft.criteria.map(
                              (criterion, criterionIndex) => {
                                const isCollapsed =
                                  collapsedCriteria.has(criterionIndex);
                                const fieldKeyOptions =
                                  criterion.fieldKey &&
                                  !rubricFieldOptions.some(
                                    (option) =>
                                      option.value === criterion.fieldKey,
                                  )
                                    ? [
                                        {
                                          value: criterion.fieldKey,
                                          label: `${criterion.fieldKey} (actual)`,
                                        },
                                        ...rubricFieldOptions,
                                      ]
                                    : rubricFieldOptions;
                                const fileKeyOptions =
                                  criterion.fileKey &&
                                  !rubricFileFieldOptions.some(
                                    (option) =>
                                      option.value === criterion.fileKey,
                                  )
                                    ? [
                                        {
                                          value: criterion.fileKey,
                                          label: `${criterion.fileKey} (actual)`,
                                        },
                                        ...rubricFileFieldOptions,
                                      ]
                                    : rubricFileFieldOptions;
                                const numberFieldOptions =
                                  criterion.fieldKey &&
                                  !rubricNumberFieldOptions.some(
                                    (option) =>
                                      option.value === criterion.fieldKey,
                                  )
                                    ? [
                                        {
                                          value: criterion.fieldKey,
                                          label: `${criterion.fieldKey} (actual)`,
                                        },
                                        ...rubricNumberFieldOptions,
                                      ]
                                    : rubricNumberFieldOptions;
                                const criterionRoles = new Set(
                                  criterion.roles ?? [],
                                );
                                const kindOption = RUBRIC_KIND_OPTIONS.find(
                                  (o) => o.value === criterion.kind,
                                );

                                return (
                                  <div
                                    key={`${criterion.id}-${criterionIndex}`}
                                    className="rubric-criterion-card"
                                  >
                                    <div
                                      className="rubric-criterion-header"
                                      onClick={() =>
                                        toggleCriterionCollapsed(criterionIndex)
                                      }
                                    >
                                      <div className="rubric-criterion-header-left">
                                        <span className="rubric-criterion-drag">
                                          &#x2630;
                                        </span>
                                        <div className="rubric-criterion-title-group">
                                          <span className="rubric-criterion-title">
                                            {criterion.label || criterion.id}
                                          </span>
                                          <span className="rubric-criterion-kind-badge">
                                            {kindOption?.label ??
                                              criterion.kind}
                                          </span>
                                        </div>
                                      </div>
                                      <div className="rubric-criterion-header-right">
                                        <span
                                          className={`rubric-outcome-badge rubric-outcome-badge--${criterion.onFail}`}
                                        >
                                          {criterion.onFail === "not_eligible"
                                            ? "No elegible"
                                            : criterion.onFail ===
                                                "needs_review"
                                              ? "Revisión"
                                              : "Elegible"}
                                        </span>
                                        <button
                                          type="button"
                                          className="btn btn-sm btn-outline"
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            moveGuidedRubricCriterion(
                                              criterionIndex,
                                              "up",
                                            );
                                          }}
                                          disabled={criterionIndex === 0}
                                          title="Subir"
                                        >
                                          &uarr;
                                        </button>
                                        <button
                                          type="button"
                                          className="btn btn-sm btn-outline"
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            moveGuidedRubricCriterion(
                                              criterionIndex,
                                              "down",
                                            );
                                          }}
                                          disabled={
                                            criterionIndex ===
                                            settingsEligibilityRubricDraft
                                              .criteria.length -
                                              1
                                          }
                                          title="Bajar"
                                        >
                                          &darr;
                                        </button>
                                        <button
                                          type="button"
                                          className="btn btn-sm btn-outline rubric-btn-delete"
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            removeGuidedRubricCriterion(
                                              criterionIndex,
                                            );
                                          }}
                                          title="Eliminar"
                                        >
                                          &times;
                                        </button>
                                        <span
                                          className={`rubric-chevron ${isCollapsed ? "" : "rubric-chevron--open"}`}
                                        >
                                          &#x25B6;
                                        </span>
                                      </div>
                                    </div>
                                    {!isCollapsed && (
                                      <div className="rubric-criterion-body">
                                        <div className="editor-grid">
                                          <div className="form-field">
                                            <label
                                              htmlFor={`rubric-criterion-kind-${stageCode}-${criterionIndex}`}
                                            >
                                              Tipo
                                            </label>
                                            <select
                                              id={`rubric-criterion-kind-${stageCode}-${criterionIndex}`}
                                              value={criterion.kind}
                                              onChange={(event) => {
                                                const nextKind = event.target
                                                  .value as EligibilityRubricCriterion["kind"];
                                                const replacement =
                                                  createDefaultRubricCriterion({
                                                    kind: nextKind,
                                                    existingCriteria:
                                                      settingsEligibilityRubricDraft.criteria.filter(
                                                        (_, index) =>
                                                          index !==
                                                          criterionIndex,
                                                      ),
                                                    defaultFieldKey:
                                                      defaultRubricFieldKey,
                                                    defaultFileKey:
                                                      defaultRubricFileKey,
                                                    defaultNumberFieldKey:
                                                      defaultRubricNumberFieldKey,
                                                  });
                                                updateGuidedRubricCriterion(
                                                  criterionIndex,
                                                  (currentCriterion) => ({
                                                    ...replacement,
                                                    id: currentCriterion.id,
                                                    label:
                                                      currentCriterion.label,
                                                    description:
                                                      currentCriterion.description,
                                                    onFail:
                                                      currentCriterion.onFail,
                                                    onMissingData:
                                                      currentCriterion.onMissingData,
                                                  }),
                                                );
                                              }}
                                            >
                                              {RUBRIC_KIND_OPTIONS.map(
                                                (option) => (
                                                  <option
                                                    key={option.value}
                                                    value={option.value}
                                                  >
                                                    {option.label}
                                                  </option>
                                                ),
                                              )}
                                            </select>
                                          </div>
                                          <div className="form-field">
                                            <label
                                              htmlFor={`rubric-criterion-id-${stageCode}-${criterionIndex}`}
                                            >
                                              ID técnico
                                            </label>
                                            <input
                                              id={`rubric-criterion-id-${stageCode}-${criterionIndex}`}
                                              type="text"
                                              value={criterion.id}
                                              onChange={(event) =>
                                                updateGuidedRubricCriterion(
                                                  criterionIndex,
                                                  (currentCriterion) => ({
                                                    ...currentCriterion,
                                                    id: event.target.value,
                                                  }),
                                                )
                                              }
                                              style={{
                                                fontFamily: "monospace",
                                              }}
                                            />
                                          </div>
                                          <div className="form-field full">
                                            <label
                                              htmlFor={`rubric-criterion-label-${stageCode}-${criterionIndex}`}
                                            >
                                              Etiqueta visible
                                            </label>
                                            <input
                                              id={`rubric-criterion-label-${stageCode}-${criterionIndex}`}
                                              type="text"
                                              value={criterion.label}
                                              onChange={(event) =>
                                                updateGuidedRubricCriterion(
                                                  criterionIndex,
                                                  (currentCriterion) => ({
                                                    ...currentCriterion,
                                                    label: event.target.value,
                                                  }),
                                                )
                                              }
                                            />
                                          </div>
                                          <div className="form-field">
                                            <label
                                              htmlFor={`rubric-criterion-onfail-${stageCode}-${criterionIndex}`}
                                            >
                                              Resultado si falla
                                            </label>
                                            <select
                                              id={`rubric-criterion-onfail-${stageCode}-${criterionIndex}`}
                                              value={criterion.onFail}
                                              onChange={(event) =>
                                                updateGuidedRubricCriterion(
                                                  criterionIndex,
                                                  (currentCriterion) => ({
                                                    ...currentCriterion,
                                                    onFail: event.target
                                                      .value as EligibilityRubricCriterion["onFail"],
                                                  }),
                                                )
                                              }
                                            >
                                              {RUBRIC_OUTCOME_OPTIONS.map(
                                                (option) => (
                                                  <option
                                                    key={option.value}
                                                    value={option.value}
                                                  >
                                                    {option.label}
                                                  </option>
                                                ),
                                              )}
                                            </select>
                                          </div>
                                          <div className="form-field">
                                            <label
                                              htmlFor={`rubric-criterion-missing-${stageCode}-${criterionIndex}`}
                                            >
                                              Resultado si falta data
                                            </label>
                                            <select
                                              id={`rubric-criterion-missing-${stageCode}-${criterionIndex}`}
                                              value={criterion.onMissingData}
                                              onChange={(event) =>
                                                updateGuidedRubricCriterion(
                                                  criterionIndex,
                                                  (currentCriterion) => ({
                                                    ...currentCriterion,
                                                    onMissingData: event.target
                                                      .value as EligibilityRubricCriterion["onMissingData"],
                                                  }),
                                                )
                                              }
                                            >
                                              {RUBRIC_OUTCOME_OPTIONS.map(
                                                (option) => (
                                                  <option
                                                    key={option.value}
                                                    value={option.value}
                                                  >
                                                    {option.label}
                                                  </option>
                                                ),
                                              )}
                                            </select>
                                          </div>

                                          {/* Kind-specific fields - same as existing guided editor */}
                                          {criterion.kind ===
                                          "field_present" ? (
                                            <div className="form-field full">
                                              <label
                                                htmlFor={`rubric-criterion-fieldkey-${stageCode}-${criterionIndex}`}
                                              >
                                                Campo objetivo
                                              </label>
                                              <select
                                                id={`rubric-criterion-fieldkey-${stageCode}-${criterionIndex}`}
                                                value={criterion.fieldKey ?? ""}
                                                onChange={(event) =>
                                                  updateGuidedRubricCriterion(
                                                    criterionIndex,
                                                    (currentCriterion) => ({
                                                      ...currentCriterion,
                                                      fieldKey:
                                                        event.target.value,
                                                    }),
                                                  )
                                                }
                                              >
                                                <option value="">
                                                  Selecciona un campo
                                                </option>
                                                {fieldKeyOptions.map(
                                                  (option) => (
                                                    <option
                                                      key={option.value}
                                                      value={option.value}
                                                    >
                                                      {option.label}
                                                    </option>
                                                  ),
                                                )}
                                              </select>
                                            </div>
                                          ) : null}

                                          {criterion.kind === "all_present" ||
                                          criterion.kind === "any_present" ? (
                                            <div className="form-field full">
                                              <label
                                                htmlFor={`rubric-criterion-fieldkeys-${stageCode}-${criterionIndex}`}
                                              >
                                                Campos (separados por coma)
                                              </label>
                                              <input
                                                id={`rubric-criterion-fieldkeys-${stageCode}-${criterionIndex}`}
                                                type="text"
                                                value={formatCommaSeparatedList(
                                                  criterion.fieldKeys,
                                                )}
                                                onChange={(event) =>
                                                  updateGuidedRubricCriterion(
                                                    criterionIndex,
                                                    (currentCriterion) => ({
                                                      ...currentCriterion,
                                                      fieldKeys:
                                                        parseCommaSeparatedList(
                                                          event.target.value,
                                                        ),
                                                    }),
                                                  )
                                                }
                                                placeholder="dateOfBirth, nationality"
                                              />
                                            </div>
                                          ) : null}

                                          {criterion.kind === "field_in" ? (
                                            <>
                                              <div className="form-field">
                                                <label
                                                  htmlFor={`rubric-criterion-fieldin-key-${stageCode}-${criterionIndex}`}
                                                >
                                                  Campo objetivo
                                                </label>
                                                <select
                                                  id={`rubric-criterion-fieldin-key-${stageCode}-${criterionIndex}`}
                                                  value={
                                                    criterion.fieldKey ?? ""
                                                  }
                                                  onChange={(event) =>
                                                    updateGuidedRubricCriterion(
                                                      criterionIndex,
                                                      (currentCriterion) => ({
                                                        ...currentCriterion,
                                                        fieldKey:
                                                          event.target.value,
                                                      }),
                                                    )
                                                  }
                                                >
                                                  <option value="">
                                                    Selecciona un campo
                                                  </option>
                                                  {fieldKeyOptions.map(
                                                    (option) => (
                                                      <option
                                                        key={option.value}
                                                        value={option.value}
                                                      >
                                                        {option.label}
                                                      </option>
                                                    ),
                                                  )}
                                                </select>
                                              </div>
                                              <div className="form-field">
                                                <label
                                                  htmlFor={`rubric-criterion-fieldin-sensitive-${stageCode}-${criterionIndex}`}
                                                >
                                                  Coincidencia
                                                </label>
                                                <select
                                                  id={`rubric-criterion-fieldin-sensitive-${stageCode}-${criterionIndex}`}
                                                  value={
                                                    criterion.caseSensitive
                                                      ? "strict"
                                                      : "ignore_case"
                                                  }
                                                  onChange={(event) =>
                                                    updateGuidedRubricCriterion(
                                                      criterionIndex,
                                                      (currentCriterion) => ({
                                                        ...currentCriterion,
                                                        caseSensitive:
                                                          event.target.value ===
                                                          "strict",
                                                      }),
                                                    )
                                                  }
                                                >
                                                  <option value="ignore_case">
                                                    Ignorar
                                                    mayúsculas/minúsculas
                                                  </option>
                                                  <option value="strict">
                                                    Exacta (case-sensitive)
                                                  </option>
                                                </select>
                                              </div>
                                              <div className="form-field full">
                                                <label
                                                  htmlFor={`rubric-criterion-fieldin-values-${stageCode}-${criterionIndex}`}
                                                >
                                                  Valores permitidos (separados
                                                  por coma)
                                                </label>
                                                <input
                                                  id={`rubric-criterion-fieldin-values-${stageCode}-${criterionIndex}`}
                                                  type="text"
                                                  value={formatCommaSeparatedList(
                                                    criterion.allowedValues,
                                                  )}
                                                  onChange={(event) =>
                                                    updateGuidedRubricCriterion(
                                                      criterionIndex,
                                                      (currentCriterion) => ({
                                                        ...currentCriterion,
                                                        allowedValues:
                                                          parseCommaSeparatedList(
                                                            event.target.value,
                                                          ),
                                                      }),
                                                    )
                                                  }
                                                  placeholder="peru, chile"
                                                />
                                              </div>
                                            </>
                                          ) : null}

                                          {criterion.kind ===
                                          "number_between" ? (
                                            <>
                                              <div className="form-field">
                                                <label
                                                  htmlFor={`rubric-criterion-number-key-${stageCode}-${criterionIndex}`}
                                                >
                                                  Campo numérico
                                                </label>
                                                <select
                                                  id={`rubric-criterion-number-key-${stageCode}-${criterionIndex}`}
                                                  value={
                                                    criterion.fieldKey ?? ""
                                                  }
                                                  onChange={(event) =>
                                                    updateGuidedRubricCriterion(
                                                      criterionIndex,
                                                      (currentCriterion) => ({
                                                        ...currentCriterion,
                                                        fieldKey:
                                                          event.target.value,
                                                      }),
                                                    )
                                                  }
                                                >
                                                  <option value="">
                                                    Selecciona un campo
                                                  </option>
                                                  {numberFieldOptions.map(
                                                    (option) => (
                                                      <option
                                                        key={option.value}
                                                        value={option.value}
                                                      >
                                                        {option.label}
                                                      </option>
                                                    ),
                                                  )}
                                                </select>
                                              </div>
                                              <div className="form-field">
                                                <label
                                                  htmlFor={`rubric-criterion-number-min-${stageCode}-${criterionIndex}`}
                                                >
                                                  Mínimo
                                                </label>
                                                <input
                                                  id={`rubric-criterion-number-min-${stageCode}-${criterionIndex}`}
                                                  type="number"
                                                  value={
                                                    typeof criterion.min ===
                                                    "number"
                                                      ? String(criterion.min)
                                                      : ""
                                                  }
                                                  onChange={(event) =>
                                                    updateGuidedRubricCriterion(
                                                      criterionIndex,
                                                      (currentCriterion) => ({
                                                        ...currentCriterion,
                                                        min:
                                                          event.target.value.trim() ===
                                                          ""
                                                            ? undefined
                                                            : Number(
                                                                event.target
                                                                  .value,
                                                              ),
                                                      }),
                                                    )
                                                  }
                                                />
                                              </div>
                                              <div className="form-field">
                                                <label
                                                  htmlFor={`rubric-criterion-number-max-${stageCode}-${criterionIndex}`}
                                                >
                                                  Máximo
                                                </label>
                                                <input
                                                  id={`rubric-criterion-number-max-${stageCode}-${criterionIndex}`}
                                                  type="number"
                                                  value={
                                                    typeof criterion.max ===
                                                    "number"
                                                      ? String(criterion.max)
                                                      : ""
                                                  }
                                                  onChange={(event) =>
                                                    updateGuidedRubricCriterion(
                                                      criterionIndex,
                                                      (currentCriterion) => ({
                                                        ...currentCriterion,
                                                        max:
                                                          event.target.value.trim() ===
                                                          ""
                                                            ? undefined
                                                            : Number(
                                                                event.target
                                                                  .value,
                                                              ),
                                                      }),
                                                    )
                                                  }
                                                />
                                              </div>
                                            </>
                                          ) : null}

                                          {criterion.kind ===
                                          "file_uploaded" ? (
                                            <div className="form-field full">
                                              <label
                                                htmlFor={`rubric-criterion-file-key-${stageCode}-${criterionIndex}`}
                                              >
                                                Campo de archivo
                                              </label>
                                              <select
                                                id={`rubric-criterion-file-key-${stageCode}-${criterionIndex}`}
                                                value={criterion.fileKey ?? ""}
                                                onChange={(event) =>
                                                  updateGuidedRubricCriterion(
                                                    criterionIndex,
                                                    (currentCriterion) => ({
                                                      ...currentCriterion,
                                                      fileKey:
                                                        event.target.value,
                                                    }),
                                                  )
                                                }
                                              >
                                                <option value="">
                                                  Selecciona un archivo
                                                </option>
                                                {fileKeyOptions.map(
                                                  (option) => (
                                                    <option
                                                      key={option.value}
                                                      value={option.value}
                                                    >
                                                      {option.label}
                                                    </option>
                                                  ),
                                                )}
                                              </select>
                                            </div>
                                          ) : null}

                                          {criterion.kind ===
                                          "recommendations_complete" ? (
                                            <>
                                              <div className="form-field full">
                                                <label>Roles requeridos</label>
                                                <div
                                                  style={{
                                                    display: "flex",
                                                    gap: "12px",
                                                    flexWrap: "wrap",
                                                  }}
                                                >
                                                  <label
                                                    style={{
                                                      display: "flex",
                                                      gap: "6px",
                                                      alignItems: "center",
                                                    }}
                                                  >
                                                    <input
                                                      type="checkbox"
                                                      checked={criterionRoles.has(
                                                        "mentor",
                                                      )}
                                                      onChange={(event) => {
                                                        const nextRoles =
                                                          new Set(
                                                            criterionRoles,
                                                          );
                                                        if (
                                                          event.target.checked
                                                        ) {
                                                          nextRoles.add(
                                                            "mentor",
                                                          );
                                                        } else {
                                                          nextRoles.delete(
                                                            "mentor",
                                                          );
                                                        }
                                                        updateGuidedRubricCriterion(
                                                          criterionIndex,
                                                          (
                                                            currentCriterion,
                                                          ) => ({
                                                            ...currentCriterion,
                                                            roles:
                                                              Array.from(
                                                                nextRoles,
                                                              ),
                                                          }),
                                                        );
                                                      }}
                                                    />
                                                    Mentor
                                                  </label>
                                                  <label
                                                    style={{
                                                      display: "flex",
                                                      gap: "6px",
                                                      alignItems: "center",
                                                    }}
                                                  >
                                                    <input
                                                      type="checkbox"
                                                      checked={criterionRoles.has(
                                                        "friend",
                                                      )}
                                                      onChange={(event) => {
                                                        const nextRoles =
                                                          new Set(
                                                            criterionRoles,
                                                          );
                                                        if (
                                                          event.target.checked
                                                        ) {
                                                          nextRoles.add(
                                                            "friend",
                                                          );
                                                        } else {
                                                          nextRoles.delete(
                                                            "friend",
                                                          );
                                                        }
                                                        updateGuidedRubricCriterion(
                                                          criterionIndex,
                                                          (
                                                            currentCriterion,
                                                          ) => ({
                                                            ...currentCriterion,
                                                            roles:
                                                              Array.from(
                                                                nextRoles,
                                                              ),
                                                          }),
                                                        );
                                                      }}
                                                    />
                                                    Friend
                                                  </label>
                                                </div>
                                              </div>
                                              <div className="switch-wrapper">
                                                <div>
                                                  <div className="admin-switch-label">
                                                    Verificar que fueron
                                                    solicitadas
                                                  </div>
                                                </div>
                                                <label className="switch">
                                                  <input
                                                    type="checkbox"
                                                    checked={
                                                      criterion.requireRequested !==
                                                      false
                                                    }
                                                    onChange={(event) =>
                                                      updateGuidedRubricCriterion(
                                                        criterionIndex,
                                                        (currentCriterion) => ({
                                                          ...currentCriterion,
                                                          requireRequested:
                                                            event.target
                                                              .checked,
                                                        }),
                                                      )
                                                    }
                                                  />
                                                  <span className="slider" />
                                                </label>
                                              </div>
                                              <div className="form-field">
                                                <label
                                                  htmlFor={`rubric-criterion-min-responses-${stageCode}-${criterionIndex}`}
                                                >
                                                  Respuestas mínimas por carta
                                                </label>
                                                <input
                                                  id={`rubric-criterion-min-responses-${stageCode}-${criterionIndex}`}
                                                  type="number"
                                                  min={0}
                                                  max={20}
                                                  step={1}
                                                  value={
                                                    typeof criterion.minFilledResponses ===
                                                    "number"
                                                      ? String(
                                                          criterion.minFilledResponses,
                                                        )
                                                      : "0"
                                                  }
                                                  onChange={(event) =>
                                                    updateGuidedRubricCriterion(
                                                      criterionIndex,
                                                      (currentCriterion) => ({
                                                        ...currentCriterion,
                                                        minFilledResponses:
                                                          Number(
                                                            event.target.value,
                                                          ) || 0,
                                                      }),
                                                    )
                                                  }
                                                />
                                              </div>
                                            </>
                                          ) : null}

                                          {criterion.kind ===
                                          "ocr_confidence" ? (
                                            <>
                                              <div className="form-field">
                                                <label
                                                  htmlFor={`rubric-criterion-ocr-key-${stageCode}-${criterionIndex}`}
                                                >
                                                  Campo de archivo OCR
                                                </label>
                                                <select
                                                  id={`rubric-criterion-ocr-key-${stageCode}-${criterionIndex}`}
                                                  value={
                                                    criterion.fileKey ?? ""
                                                  }
                                                  onChange={(event) =>
                                                    updateGuidedRubricCriterion(
                                                      criterionIndex,
                                                      (currentCriterion) => ({
                                                        ...currentCriterion,
                                                        fileKey:
                                                          event.target.value,
                                                      }),
                                                    )
                                                  }
                                                >
                                                  <option value="">
                                                    Selecciona un archivo
                                                  </option>
                                                  {fileKeyOptions.map(
                                                    (option) => (
                                                      <option
                                                        key={option.value}
                                                        value={option.value}
                                                      >
                                                        {option.label}
                                                      </option>
                                                    ),
                                                  )}
                                                </select>
                                              </div>
                                              <div className="form-field">
                                                <label
                                                  htmlFor={`rubric-criterion-ocr-confidence-${stageCode}-${criterionIndex}`}
                                                >
                                                  Confianza mínima (0 a 1)
                                                </label>
                                                <input
                                                  id={`rubric-criterion-ocr-confidence-${stageCode}-${criterionIndex}`}
                                                  type="number"
                                                  min={0}
                                                  max={1}
                                                  step={0.01}
                                                  value={
                                                    typeof criterion.minConfidence ===
                                                    "number"
                                                      ? String(
                                                          criterion.minConfidence,
                                                        )
                                                      : ""
                                                  }
                                                  onChange={(event) =>
                                                    updateGuidedRubricCriterion(
                                                      criterionIndex,
                                                      (currentCriterion) => ({
                                                        ...currentCriterion,
                                                        minConfidence:
                                                          event.target.value.trim() ===
                                                          ""
                                                            ? undefined
                                                            : Number(
                                                                event.target
                                                                  .value,
                                                              ),
                                                      }),
                                                    )
                                                  }
                                                />
                                              </div>
                                            </>
                                          ) : null}

                                          {criterion.kind === "ocr_field_in" ||
                                          criterion.kind ===
                                            "ocr_field_not_in" ? (
                                            <>
                                              <div className="form-field">
                                                <label
                                                  htmlFor={`rubric-criterion-ocr-value-key-${stageCode}-${criterionIndex}`}
                                                >
                                                  Campo de archivo OCR
                                                </label>
                                                <select
                                                  id={`rubric-criterion-ocr-value-key-${stageCode}-${criterionIndex}`}
                                                  value={
                                                    criterion.fileKey ?? ""
                                                  }
                                                  onChange={(event) =>
                                                    updateGuidedRubricCriterion(
                                                      criterionIndex,
                                                      (currentCriterion) => ({
                                                        ...currentCriterion,
                                                        fileKey:
                                                          event.target.value,
                                                      }),
                                                    )
                                                  }
                                                >
                                                  <option value="">
                                                    Selecciona un archivo
                                                  </option>
                                                  {fileKeyOptions.map(
                                                    (option) => (
                                                      <option
                                                        key={option.value}
                                                        value={option.value}
                                                      >
                                                        {option.label}
                                                      </option>
                                                    ),
                                                  )}
                                                </select>
                                              </div>
                                              <div className="form-field">
                                                <label
                                                  htmlFor={`rubric-criterion-ocr-value-path-${stageCode}-${criterionIndex}`}
                                                >
                                                  JSON path OCR
                                                </label>
                                                <input
                                                  id={`rubric-criterion-ocr-value-path-${stageCode}-${criterionIndex}`}
                                                  type="text"
                                                  value={
                                                    criterion.jsonPath ?? ""
                                                  }
                                                  onChange={(event) =>
                                                    updateGuidedRubricCriterion(
                                                      criterionIndex,
                                                      (currentCriterion) => ({
                                                        ...currentCriterion,
                                                        jsonPath:
                                                          event.target.value,
                                                      }),
                                                    )
                                                  }
                                                />
                                              </div>
                                              <div className="form-field">
                                                <label
                                                  htmlFor={`rubric-criterion-ocr-value-sensitive-${stageCode}-${criterionIndex}`}
                                                >
                                                  Coincidencia
                                                </label>
                                                <select
                                                  id={`rubric-criterion-ocr-value-sensitive-${stageCode}-${criterionIndex}`}
                                                  value={
                                                    criterion.caseSensitive
                                                      ? "strict"
                                                      : "ignore_case"
                                                  }
                                                  onChange={(event) =>
                                                    updateGuidedRubricCriterion(
                                                      criterionIndex,
                                                      (currentCriterion) => ({
                                                        ...currentCriterion,
                                                        caseSensitive:
                                                          event.target.value ===
                                                          "strict",
                                                      }),
                                                    )
                                                  }
                                                >
                                                  <option value="ignore_case">
                                                    Ignorar
                                                    mayúsculas/minúsculas
                                                  </option>
                                                  <option value="strict">
                                                    Exacta (case-sensitive)
                                                  </option>
                                                </select>
                                              </div>
                                              <div className="form-field full">
                                                <label
                                                  htmlFor={`rubric-criterion-ocr-values-${stageCode}-${criterionIndex}`}
                                                >
                                                  {criterion.kind ===
                                                  "ocr_field_in"
                                                    ? "Valores permitidos (coma)"
                                                    : "Valores que disparan revisión (coma)"}
                                                </label>
                                                <input
                                                  id={`rubric-criterion-ocr-values-${stageCode}-${criterionIndex}`}
                                                  type="text"
                                                  value={
                                                    criterion.kind ===
                                                    "ocr_field_in"
                                                      ? formatCommaSeparatedList(
                                                          criterion.allowedValues,
                                                        )
                                                      : formatCommaSeparatedList(
                                                          criterion.disallowedValues,
                                                        )
                                                  }
                                                  onChange={(event) =>
                                                    updateGuidedRubricCriterion(
                                                      criterionIndex,
                                                      (currentCriterion) => {
                                                        if (
                                                          currentCriterion.kind ===
                                                          "ocr_field_in"
                                                        ) {
                                                          return {
                                                            ...currentCriterion,
                                                            allowedValues:
                                                              parseCommaSeparatedList(
                                                                event.target
                                                                  .value,
                                                              ),
                                                          };
                                                        }
                                                        return {
                                                          ...currentCriterion,
                                                          disallowedValues:
                                                            parseCommaSeparatedList(
                                                              event.target
                                                                .value,
                                                            ),
                                                        };
                                                      },
                                                    )
                                                  }
                                                />
                                              </div>
                                            </>
                                          ) : null}

                                          {criterion.kind ===
                                          "field_matches_ocr" ? (
                                            <>
                                              <div className="form-field">
                                                <label
                                                  htmlFor={`rubric-criterion-match-field-${stageCode}-${criterionIndex}`}
                                                >
                                                  Campo de formulario
                                                </label>
                                                <select
                                                  id={`rubric-criterion-match-field-${stageCode}-${criterionIndex}`}
                                                  value={
                                                    criterion.fieldKey ?? ""
                                                  }
                                                  onChange={(event) =>
                                                    updateGuidedRubricCriterion(
                                                      criterionIndex,
                                                      (currentCriterion) => ({
                                                        ...currentCriterion,
                                                        fieldKey:
                                                          event.target.value,
                                                      }),
                                                    )
                                                  }
                                                >
                                                  <option value="">
                                                    Selecciona un campo
                                                  </option>
                                                  {fieldKeyOptions.map(
                                                    (option) => (
                                                      <option
                                                        key={option.value}
                                                        value={option.value}
                                                      >
                                                        {option.label}
                                                      </option>
                                                    ),
                                                  )}
                                                </select>
                                              </div>
                                              <div className="form-field">
                                                <label
                                                  htmlFor={`rubric-criterion-match-file-${stageCode}-${criterionIndex}`}
                                                >
                                                  Archivo OCR
                                                </label>
                                                <select
                                                  id={`rubric-criterion-match-file-${stageCode}-${criterionIndex}`}
                                                  value={
                                                    criterion.fileKey ?? ""
                                                  }
                                                  onChange={(event) =>
                                                    updateGuidedRubricCriterion(
                                                      criterionIndex,
                                                      (currentCriterion) => ({
                                                        ...currentCriterion,
                                                        fileKey:
                                                          event.target.value,
                                                      }),
                                                    )
                                                  }
                                                >
                                                  <option value="">
                                                    Selecciona un archivo
                                                  </option>
                                                  {fileKeyOptions.map(
                                                    (option) => (
                                                      <option
                                                        key={option.value}
                                                        value={option.value}
                                                      >
                                                        {option.label}
                                                      </option>
                                                    ),
                                                  )}
                                                </select>
                                              </div>
                                              <div className="form-field">
                                                <label
                                                  htmlFor={`rubric-criterion-match-path-${stageCode}-${criterionIndex}`}
                                                >
                                                  JSON path OCR
                                                </label>
                                                <input
                                                  id={`rubric-criterion-match-path-${stageCode}-${criterionIndex}`}
                                                  type="text"
                                                  value={
                                                    criterion.jsonPath ?? ""
                                                  }
                                                  onChange={(event) =>
                                                    updateGuidedRubricCriterion(
                                                      criterionIndex,
                                                      (currentCriterion) => ({
                                                        ...currentCriterion,
                                                        jsonPath:
                                                          event.target.value,
                                                      }),
                                                    )
                                                  }
                                                />
                                              </div>
                                              <div className="form-field">
                                                <label
                                                  htmlFor={`rubric-criterion-match-sensitive-${stageCode}-${criterionIndex}`}
                                                >
                                                  Coincidencia
                                                </label>
                                                <select
                                                  id={`rubric-criterion-match-sensitive-${stageCode}-${criterionIndex}`}
                                                  value={
                                                    criterion.caseSensitive
                                                      ? "strict"
                                                      : "ignore_case"
                                                  }
                                                  onChange={(event) =>
                                                    updateGuidedRubricCriterion(
                                                      criterionIndex,
                                                      (currentCriterion) => ({
                                                        ...currentCriterion,
                                                        caseSensitive:
                                                          event.target.value ===
                                                          "strict",
                                                      }),
                                                    )
                                                  }
                                                >
                                                  <option value="ignore_case">
                                                    Ignorar
                                                    mayúsculas/minúsculas
                                                  </option>
                                                  <option value="strict">
                                                    Exacta (case-sensitive)
                                                  </option>
                                                </select>
                                              </div>
                                              <div className="switch-wrapper">
                                                <div>
                                                  <div className="admin-switch-label">
                                                    Normalizar espacios antes de
                                                    comparar
                                                  </div>
                                                </div>
                                                <label className="switch">
                                                  <input
                                                    type="checkbox"
                                                    checked={
                                                      criterion.normalizeWhitespace !==
                                                      false
                                                    }
                                                    onChange={(event) =>
                                                      updateGuidedRubricCriterion(
                                                        criterionIndex,
                                                        (currentCriterion) => ({
                                                          ...currentCriterion,
                                                          normalizeWhitespace:
                                                            event.target
                                                              .checked,
                                                        }),
                                                      )
                                                    }
                                                  />
                                                  <span className="slider" />
                                                </label>
                                              </div>
                                            </>
                                          ) : null}

                                          {criterion.kind ===
                                          "file_upload_count_between" ? (
                                            <>
                                              <div className="form-field full">
                                                <label
                                                  htmlFor={`rubric-criterion-count-filekeys-${stageCode}-${criterionIndex}`}
                                                >
                                                  Claves de archivo (separadas
                                                  por coma)
                                                </label>
                                                <input
                                                  id={`rubric-criterion-count-filekeys-${stageCode}-${criterionIndex}`}
                                                  type="text"
                                                  value={formatCommaSeparatedList(
                                                    criterion.fileKeys,
                                                  )}
                                                  onChange={(event) =>
                                                    updateGuidedRubricCriterion(
                                                      criterionIndex,
                                                      (currentCriterion) => ({
                                                        ...currentCriterion,
                                                        fileKeys:
                                                          parseCommaSeparatedList(
                                                            event.target.value,
                                                          ),
                                                      }),
                                                    )
                                                  }
                                                />
                                              </div>
                                              <div className="form-field">
                                                <label
                                                  htmlFor={`rubric-criterion-count-min-${stageCode}-${criterionIndex}`}
                                                >
                                                  Cantidad mínima
                                                </label>
                                                <input
                                                  id={`rubric-criterion-count-min-${stageCode}-${criterionIndex}`}
                                                  type="number"
                                                  min={0}
                                                  step={1}
                                                  value={
                                                    typeof criterion.minCount ===
                                                    "number"
                                                      ? String(
                                                          criterion.minCount,
                                                        )
                                                      : ""
                                                  }
                                                  onChange={(event) =>
                                                    updateGuidedRubricCriterion(
                                                      criterionIndex,
                                                      (currentCriterion) => ({
                                                        ...currentCriterion,
                                                        minCount:
                                                          event.target.value.trim() ===
                                                          ""
                                                            ? undefined
                                                            : Number(
                                                                event.target
                                                                  .value,
                                                              ),
                                                      }),
                                                    )
                                                  }
                                                />
                                              </div>
                                              <div className="form-field">
                                                <label
                                                  htmlFor={`rubric-criterion-count-max-${stageCode}-${criterionIndex}`}
                                                >
                                                  Cantidad máxima
                                                </label>
                                                <input
                                                  id={`rubric-criterion-count-max-${stageCode}-${criterionIndex}`}
                                                  type="number"
                                                  min={0}
                                                  step={1}
                                                  value={
                                                    typeof criterion.maxCount ===
                                                    "number"
                                                      ? String(
                                                          criterion.maxCount,
                                                        )
                                                      : ""
                                                  }
                                                  onChange={(event) =>
                                                    updateGuidedRubricCriterion(
                                                      criterionIndex,
                                                      (currentCriterion) => ({
                                                        ...currentCriterion,
                                                        maxCount:
                                                          event.target.value.trim() ===
                                                          ""
                                                            ? undefined
                                                            : Number(
                                                                event.target
                                                                  .value,
                                                              ),
                                                      }),
                                                    )
                                                  }
                                                />
                                              </div>
                                            </>
                                          ) : null}

                                          {criterion.kind === "any_of" ? (
                                            <div className="form-field full">
                                              <label
                                                htmlFor={`rubric-criterion-anyof-${stageCode}-${criterionIndex}`}
                                              >
                                                Condiciones alternativas (JSON)
                                              </label>
                                              <textarea
                                                id={`rubric-criterion-anyof-${stageCode}-${criterionIndex}`}
                                                rows={6}
                                                value={JSON.stringify(
                                                  criterion.conditions ?? [],
                                                  null,
                                                  2,
                                                )}
                                                onChange={(event) => {
                                                  try {
                                                    const parsed = JSON.parse(
                                                      event.target.value,
                                                    ) as unknown;
                                                    if (
                                                      !Array.isArray(parsed)
                                                    ) {
                                                      return;
                                                    }
                                                    updateGuidedRubricCriterion(
                                                      criterionIndex,
                                                      (currentCriterion) => ({
                                                        ...currentCriterion,
                                                        conditions:
                                                          parsed as EligibilityRubricCriterion["conditions"],
                                                      }),
                                                    );
                                                  } catch {
                                                    // Keep current value until JSON is valid.
                                                  }
                                                }}
                                                style={{
                                                  fontFamily: "monospace",
                                                }}
                                              />
                                              <div className="form-hint">
                                                Usa condiciones{" "}
                                                <code>field_present</code>,{" "}
                                                <code>file_uploaded</code>,{" "}
                                                <code>number_between</code>,{" "}
                                                <code>ocr_field_in</code>,{" "}
                                                <code>ocr_field_not_in</code> o{" "}
                                                <code>field_matches_ocr</code>.
                                              </div>
                                            </div>
                                          ) : null}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              },
                            )}

                            <div className="rubric-add-criterion">
                              <div className="rubric-add-criterion-row">
                                <select
                                  id={`rubric-new-criterion-kind-${stageCode}`}
                                  value={newRubricCriterionKind}
                                  onChange={(event) =>
                                    setNewRubricCriterionKind(
                                      event.target
                                        .value as EligibilityRubricCriterion["kind"],
                                    )
                                  }
                                >
                                  {RUBRIC_KIND_OPTIONS.map((option) => (
                                    <option
                                      key={option.value}
                                      value={option.value}
                                    >
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  className="btn btn-outline"
                                  onClick={() =>
                                    addGuidedRubricCriterion(
                                      newRubricCriterionKind,
                                    )
                                  }
                                >
                                  + Agregar criterio
                                </button>
                              </div>
                            </div>

                            {settingsEligibilityRubricDraft.criteria.length >
                              0 && (
                              <div className="rubric-summary">
                                {settingsEligibilityRubricDraft.criteria.length}{" "}
                                criterio(s) configurados
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="rubric-empty-state">
                            Rúbrica desactivada. No se ejecutarán reglas
                            automáticas en esta etapa.
                          </div>
                        )}
                      </div>
                    ) : (
                      <>
                        <label htmlFor={`eligibility-rubric-${stageCode}`}>
                          Configuración JSON de rúbrica
                        </label>
                        <textarea
                          id={`eligibility-rubric-${stageCode}`}
                          rows={14}
                          value={settingsEligibilityRubricJson}
                          onChange={(event) =>
                            handleRubricJsonInputChange(event.target.value)
                          }
                          style={{ fontFamily: "monospace" }}
                        />
                        <div className="form-hint">
                          Usa criterios como <code>field_present</code>,{" "}
                          <code>file_uploaded</code>,{" "}
                          <code>recommendations_complete</code> y{" "}
                          <code>ocr_confidence</code>. Cada criterio define{" "}
                          <code>onFail</code> y <code>onMissingData</code>.
                        </div>
                      </>
                    )}
                    {settingsEligibilityRubricErrors.length > 0 ? (
                      <div
                        className="admin-feedback error"
                        style={{ marginTop: "10px" }}
                      >
                        {`Errores de rúbrica: ${settingsEligibilityRubricErrors
                          .slice(0, 4)
                          .join(" | ")}`}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "automations" && (
            <StageAutomationManager
              automations={automations}
              setAutomations={setAutomations}
              cycleId={cycleId}
              stageCode={stageCode}
              onPreviewData={setPreviewData}
              onSwitchToCommunications={() => switchToTab("communications")}
            />
          )}

          {activeTab === "communications" && (
            <div id="tab-communications" className="tab-content active">
              <AdminCommunicationsCenter
                cycleId={cycleId}
                defaultStageCode={stageCode}
              />
            </div>
          )}

          {activeTab === "prompt_studio" && (
            <div id="tab-prompt-studio" className="tab-content active">
              <AdminOcrTestbed
                cycleId={cycleId}
                stageCode={stageCode}
                modelOptions={Object.entries(MODEL_REGISTRY).map(
                  ([id, meta]) => ({
                    id,
                    name: meta.name,
                  }),
                )}
                defaultPrompt={DEFAULT_OCR_PROMPT}
                defaultSystemPrompt={DEFAULT_OCR_SYSTEM_PROMPT}
                defaultExtractionInstructions={
                  DEFAULT_OCR_EXTRACTION_INSTRUCTIONS
                }
                defaultSchemaTemplate={DEFAULT_OCR_SCHEMA_TEMPLATE}
              />
            </div>
          )}

          {activeTab === "stats" && (
            <StageStatsPanel fields={fields} automations={automations} />
          )}
        </div>
      </main>

      {/* Email preview modal */}
      {previewData && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Vista previa del correo"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.45)",
          }}
          onClick={() => setPreviewData(null)}
        >
          <div
            style={{
              background: "var(--surface)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-md)",
              maxWidth: "620px",
              width: "calc(100vw - 32px)",
              maxHeight: "80vh",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                padding: "16px 20px",
                borderBottom: "1px solid var(--sand)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "var(--cream)",
                flexShrink: 0,
              }}
            >
              <div>
                <p style={{ fontWeight: 700, margin: 0, fontSize: "15px" }}>
                  Vista previa del correo
                </p>
                <p
                  style={{
                    margin: "2px 0 0",
                    fontSize: "12px",
                    color: "var(--muted)",
                  }}
                >
                  Asunto: {previewData.subject}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewData(null)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "20px",
                  color: "var(--ink-light)",
                  lineHeight: 1,
                  padding: "2px 6px",
                }}
                aria-label="Cerrar vista previa"
              >
                ×
              </button>
            </div>
            <div
              style={{ overflowY: "auto", flex: 1, padding: "20px" }}
              dangerouslySetInnerHTML={{ __html: previewData.bodyHtml }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
