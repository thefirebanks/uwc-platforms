import type {
  CycleStageField,
  EligibilityRubricCriterion,
  RubricBlueprintV1,
  RubricMeta,
  StageAutomationTemplate,
  StageSection,
} from "@/types/domain";
import {
  normalizeExpectedOutputFields,
  parseExpectedOutputFieldsFromSchemaTemplate,
} from "@/lib/ocr/expected-output-schema";
import {
  normalizeFieldAiReferenceFiles,
  type FieldAiReferenceFile,
} from "@/lib/ocr/field-ai-parser";
import {
  DEFAULT_OCR_EXTRACTION_INSTRUCTIONS,
  DEFAULT_OCR_SCHEMA_TEMPLATE,
} from "@/lib/server/ocr";
import {
  parseRubricBlueprintV1,
  type UwcStageOnePresetDraft,
} from "@/lib/rubric/default-rubric-presets";
import {
  parseEligibilityRubricConfig,
  validateEligibilityRubricConfig,
} from "@/lib/rubric/eligibility-rubric";
import {
  RUBRIC_KIND_OPTIONS,
  type EditableAutomation,
  type EditableField,
  type EditorSection,
  type FieldAiParserDraft,
  type StageAdminConfigPayload,
  type StageEditorSettingsDraft,
} from "./stage-config-editor-types";

export function parseCommaSeparatedList(raw: string) {
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

export function formatCommaSeparatedList(values: string[] | undefined) {
  return (values ?? []).join(", ");
}

export function formatFileSize(bytes: number | null | undefined) {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes <= 0) {
    return "Tamano desconocido";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  return `${(bytes / 1024).toFixed(0)} KB`;
}

export function parseCommaSeparatedNumbers(raw: string) {
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

export function presetDraftFromBlueprint(
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

export function createUniqueCriterionId(
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

export function createDefaultRubricCriterion({
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

export function createDefaultFieldAiParserConfig(): FieldAiParserDraft {
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

export function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeFieldAiParserConfig(
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

export function mapFieldsWithLocalId(fields: CycleStageField[]) {
  return [...fields]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((field) => ({
      ...field,
      ai_parser_config: normalizeFieldAiParserConfig(field.ai_parser_config),
      localId: field.id,
    }));
}

export function mapAutomationsWithLocalId(
  automations: StageAutomationTemplate[],
) {
  return automations.map((automation) => ({
    ...automation,
    localId: automation.id,
  }));
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export function serializeSections(sections: StageSection[]): string {
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

export function deriveEditorSections(
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

export function getFieldTypeLabel(fieldType: CycleStageField["field_type"]) {
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

export function getFieldIcon(fieldType: CycleStageField["field_type"]) {
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

export function getNewFieldSeedForSection({
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

export function getDefaultSectionTitle(
  sectionKey: string,
  sectionNumber: number,
) {
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

export function serializePersistedFields(fields: EditableField[]) {
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

export function serializePersistedAutomations({
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

export function serializeSettingsDraft(settings: StageEditorSettingsDraft) {
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

export function parseRubricMeta(value: unknown): RubricMeta | null {
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

export function parseStageAdminConfig(
  value: unknown,
): StageAdminConfigPayload {
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

export function validateRubricJsonText(raw: string) {
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
