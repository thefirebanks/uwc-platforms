"use client";

import { useRouter } from "next/navigation";
import {
  startTransition,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  CycleStageField,
  CycleStageTemplate,
  EligibilityRubricConfig,
  EligibilityRubricCriterion,
  RubricBlueprintV1,
  RubricMeta,
  StageAutomationTemplate,
  StageCode,
  StageSection,
} from "@/types/domain";
import { ErrorCallout } from "@/components/error-callout";
import { AdminCommunicationsCenter } from "@/components/admin-communications-center";
import { AdminOcrTestbed } from "@/components/admin-ocr-testbed";
import { StageStatsPanel } from "@/components/stage-stats-panel";
import { StageAutomationManager } from "@/components/stage-automation-manager";
import { StageSettingsPanel } from "@/components/stage-settings-panel";
import { StageFieldEditor } from "@/components/stage-field-editor";
import {
  fetchApi,
  toNormalizedApiError,
  type NormalizedApiError,
} from "@/lib/client/api-client";
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
import {
  DEFAULT_OCR_PROMPT_TEMPLATE,
  RUBRIC_OUTCOME_OPTIONS,
  RUBRIC_KIND_OPTIONS,
  type EditableField,
  type EditableAutomation,
  type SectionPlaceholderDraft,
  type StageEditorSettingsDraft,
  type RubricEditorMode,
  type StageAdminConfigPayload,
} from "./stage-config-editor-types";
import {
  parseCommaSeparatedList,
  formatCommaSeparatedList,
  parseCommaSeparatedNumbers,
  presetDraftFromBlueprint,
  createDefaultRubricCriterion,
  normalizeFieldAiParserConfig,
  mapFieldsWithLocalId,
  mapAutomationsWithLocalId,
  isUuid,
  serializeSections,
  getDefaultSectionTitle,
  serializePersistedFields,
  serializePersistedAutomations,
  serializeSettingsDraft,
  parseRubricMeta,
  parseStageAdminConfig,
  validateRubricJsonText,
} from "./stage-config-editor-utils";

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
  const [error, setError] = useState<NormalizedApiError | null>(null);
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
            <StageFieldEditor
              fields={fields}
              setFields={setFields}
              sections={sections}
              setSections={setSections}
              sectionPlaceholders={sectionPlaceholders}
              setSectionPlaceholders={setSectionPlaceholders}
              activeFieldId={activeFieldId}
              setActiveFieldId={setActiveFieldId}
              draggedFieldId={draggedFieldId}
              setDraggedFieldId={setDraggedFieldId}
              dragOverFieldId={dragOverFieldId}
              setDragOverFieldId={setDragOverFieldId}
              aiReferenceUploadState={aiReferenceUploadState}
              setAiReferenceUploadState={setAiReferenceUploadState}
              collapsedSectionIds={collapsedSectionIds}
              setCollapsedSectionIds={setCollapsedSectionIds}
              setStatusMessage={setStatusMessage}
              cycleId={cycleId}
              stageCode={stageCode}
              stageId={stageId}
              documentsRouteRepresentsMainForm={documentsRouteRepresentsMainForm}
            />
          )}

          {activeTab === "settings" && (
            <StageSettingsPanel
              stageCode={stageCode}
              stageId={stageId}
              stageTemplates={stageTemplates}
              settingsStageName={settingsStageName}
              setSettingsStageName={setSettingsStageName}
              settingsDescription={settingsDescription}
              setSettingsDescription={setSettingsDescription}
              settingsOpenDate={settingsOpenDate}
              setSettingsOpenDate={setSettingsOpenDate}
              settingsCloseDate={settingsCloseDate}
              setSettingsCloseDate={setSettingsCloseDate}
              previousStageRequirement={previousStageRequirement}
              setPreviousStageRequirement={setPreviousStageRequirement}
              blockIfPreviousNotMet={blockIfPreviousNotMet}
              setBlockIfPreviousNotMet={setBlockIfPreviousNotMet}
              rubricEditorMode={rubricEditorMode}
              newRubricCriterionKind={newRubricCriterionKind}
              setNewRubricCriterionKind={setNewRubricCriterionKind}
              collapsedCriteria={collapsedCriteria}
              settingsEligibilityRubricDraft={settingsEligibilityRubricDraft}
              settingsEligibilityRubricJson={settingsEligibilityRubricJson}
              settingsEligibilityRubricErrors={settingsEligibilityRubricErrors}
              uwcPresetDraft={uwcPresetDraft}
              setUwcPresetDraft={setUwcPresetDraft}
              suggestedUwcPresetDraft={suggestedUwcPresetDraft}
              rubricFeedback={rubricFeedback}
              rubricFieldOptions={rubricFieldOptions}
              rubricFileFieldOptions={rubricFileFieldOptions}
              rubricNumberFieldOptions={rubricNumberFieldOptions}
              defaultRubricFieldKey={defaultRubricFieldKey}
              defaultRubricFileKey={defaultRubricFileKey}
              defaultRubricNumberFieldKey={defaultRubricNumberFieldKey}
              togglePresetFileKey={togglePresetFileKey}
              applyUwcPeruTemplate={applyUwcPeruTemplate}
              syncGuidedRubricDraft={syncGuidedRubricDraft}
              handleRubricModeChange={handleRubricModeChange}
              validateRubricFromEditor={validateRubricFromEditor}
              handleRubricJsonInputChange={handleRubricJsonInputChange}
              updateGuidedRubricCriterion={updateGuidedRubricCriterion}
              removeGuidedRubricCriterion={removeGuidedRubricCriterion}
              moveGuidedRubricCriterion={moveGuidedRubricCriterion}
              toggleCriterionCollapsed={toggleCriterionCollapsed}
              addGuidedRubricCriterion={addGuidedRubricCriterion}
            />
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
