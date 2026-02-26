"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  startTransition,
  useEffect,
  useDeferredValue,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import type {
  CycleStageField,
  CycleStageTemplate,
  StageAutomationTemplate,
  StageCode,
} from "@/types/domain";
import { ErrorCallout } from "@/components/error-callout";
import {
  groupApplicantFormFields,
  type ApplicantFormSectionId,
} from "@/lib/stages/applicant-sections";
import { normalizeFieldKey } from "@/lib/stages/form-schema";

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
  sectionId: ApplicantFormSectionId | "custom";
};

type StageEditorSettingsDraft = {
  stageName: string;
  description: string;
  openDate: string;
  closeDate: string;
  previousStageRequirement: string;
  blockIfPreviousNotMet: boolean;
};

type StageAdminConfigPayload = {
  stageName?: string;
  description?: string;
  openDate?: string | null;
  closeDate?: string | null;
  previousStageRequirement?: string;
  blockIfPreviousNotMet?: boolean;
  customSections?: PersistedCustomSection[];
  fieldSectionAssignments?: Record<string, string>;
};

type PersistedCustomSection = {
  id: string;
  title: string;
  order: number;
};

type EditorSectionId = ApplicantFormSectionId | `custom:${string}`;

type EditorSection = {
  id: EditorSectionId;
  title: string;
  description: string;
  fields: EditableField[];
};

const DEFAULT_OCR_PROMPT_TEMPLATE =
  "Analiza el documento y entrega una validación preliminar para comité. Resume hallazgos clave sobre legibilidad, coherencia y posibles señales de alteración.";

function mapFieldsWithLocalId(fields: CycleStageField[]) {
  return [...fields]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((field) => ({
      ...field,
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

function serializePersistedCustomSections(customSections: PersistedCustomSection[]) {
  return JSON.stringify(
    [...customSections]
      .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
      .map((section) => ({
        id: section.id,
        title: section.title.trim(),
        order: section.order,
      })),
  );
}

function serializeFieldSectionAssignments(assignments: Record<string, string>) {
  return JSON.stringify(
    Object.entries(assignments)
      .filter(([fieldKey, sectionId]) => fieldKey.trim().length > 0 && sectionId.trim().length > 0)
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

function normalizePersistedCustomSections(
  sections: PersistedCustomSection[],
): PersistedCustomSection[] {
  return [...sections]
    .map((section) => ({
      id: section.id.trim(),
      title: section.title.trim() || "Nueva sección",
      order: Number.isFinite(section.order) ? section.order : 0,
    }))
    .filter((section) => section.id.length > 0)
    .sort((a, b) => a.order - b.order)
    .map((section, index) => ({ ...section, order: index + 1 }));
}

function sanitizeFieldSectionAssignments(
  assignments: Record<string, string>,
  customSections: PersistedCustomSection[],
) {
  const allowedIds = new Set(customSections.map((section) => section.id));
  return Object.fromEntries(
    Object.entries(assignments).filter(
      ([fieldKey, sectionId]) =>
        fieldKey.trim().length > 0 &&
        sectionId.trim().length > 0 &&
        allowedIds.has(sectionId),
    ),
  );
}

function deriveEditorSections(
  fieldsForEditor: EditableField[],
  documentsRouteRepresentsMainForm: boolean,
  customSections: PersistedCustomSection[],
  fieldSectionAssignments: Record<string, string>,
): EditorSection[] {
  const normalizedCustomSections = normalizePersistedCustomSections(customSections);
  const customSectionIds = new Set(normalizedCustomSections.map((section) => section.id));
  const normalizedAssignments = sanitizeFieldSectionAssignments(
    fieldSectionAssignments,
    normalizedCustomSections,
  );
  const customAssignedFieldKeys = new Set(
    Object.entries(normalizedAssignments)
      .filter(([, sectionId]) => customSectionIds.has(sectionId))
      .map(([fieldKey]) => fieldKey),
  );

  const grouped = groupApplicantFormFields(
    fieldsForEditor.filter((field) => !customAssignedFieldKeys.has(field.field_key)),
    {
    includeInactive: true,
    includeFileFields: true,
  });

  const builtinSections = (
    documentsRouteRepresentsMainForm
      ? grouped.filter((section) => section.id !== "eligibility")
      : grouped
  ) as EditorSection[];

  const otherSection = builtinSections.find((section) => section.id === "other");
  const builtinWithoutOther = builtinSections.filter((section) => section.id !== "other");

  const customSectionsWithFields: EditorSection[] = normalizedCustomSections
    .map((section) => ({
      id: `custom:${section.id}` as const,
      title: section.title,
      description: "Campos personalizados adicionales de esta etapa.",
      fields: fieldsForEditor.filter(
        (field) => normalizedAssignments[field.field_key] === section.id,
      ),
    }));

  return otherSection
    ? [...builtinWithoutOther, ...customSectionsWithFields, otherSection]
    : [...builtinWithoutOther, ...customSectionsWithFields];
}

function isCustomEditorSectionId(sectionId: EditorSectionId): sectionId is `custom:${string}` {
  return String(sectionId).startsWith("custom:");
}

function getCustomSectionIdFromEditorSectionId(sectionId: EditorSectionId): string | null {
  if (!isCustomEditorSectionId(sectionId)) {
    return null;
  }

  return sectionId.slice("custom:".length);
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

function toDateInputValue(value: string | null) {
  if (!value) {
    return "";
  }

  return value.slice(0, 10);
}

function getBuiltinSectionTitle(sectionId: ApplicantFormSectionId) {
  switch (sectionId) {
    case "identity":
      return "Datos personales";
    case "family":
      return "Familia y apoderados";
    case "school":
      return "Colegio y rendimiento académico";
    case "motivation":
      return "Motivación y perfil";
    case "recommenders":
      return "Contexto de recomendadores";
    case "documents":
      return "Documentos y pagos";
    case "eligibility":
      return "Elegibilidad";
    case "other":
    default:
      return "Otros campos";
  }
}

function getNewFieldSeedForSection({
  sectionId,
  suffix,
}: {
  sectionId: ApplicantFormSectionId | "custom";
  suffix: number;
}) {
  switch (sectionId) {
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
    case "custom":
      return {
        field_key: `customSectionField${suffix}`,
        field_label: "Nuevo campo de sección adicional",
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
      sort_order: field.sort_order,
      is_active: field.is_active,
    })),
  );
}

function serializePersistedComms({
  automations,
  ocrPromptTemplate,
}: {
  automations: EditableAutomation[];
  ocrPromptTemplate: string;
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
    ocrPromptTemplate: ocrPromptTemplate.trim(),
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
  });
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
    customSections: Array.isArray(value.customSections)
      ? normalizePersistedCustomSections(
          value.customSections.flatMap((item, index) => {
            if (!isRecord(item)) {
              return [];
            }

            const id = typeof item.id === "string" ? item.id : "";
            const title = typeof item.title === "string" ? item.title : "";
            const order =
              typeof item.order === "number" && Number.isFinite(item.order)
                ? item.order
                : index + 1;

            if (!id.trim()) {
              return [];
            }

            return [{ id, title, order }];
          }),
        )
      : undefined,
    fieldSectionAssignments: isRecord(value.fieldSectionAssignments)
      ? Object.fromEntries(
          Object.entries(value.fieldSectionAssignments).flatMap(([fieldKey, sectionId]) => {
            if (typeof sectionId !== "string" || !fieldKey.trim() || !sectionId.trim()) {
              return [];
            }

            return [[fieldKey, sectionId]];
          }),
        )
      : undefined,
  };
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
  initialAutomations,
  initialOcrPromptTemplate,
  initialStageAdminConfig,
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
  initialAutomations: StageAutomationTemplate[];
  initialOcrPromptTemplate: string | null;
  initialStageAdminConfig?: Record<string, unknown> | null;
}) {
  const router = useRouter();
  const [fields, setFields] = useState<EditableField[]>(mapFieldsWithLocalId(initialFields));
  const [automations, setAutomations] = useState<EditableAutomation[]>(
    mapAutomationsWithLocalId(initialAutomations),
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [draggedFieldId, setDraggedFieldId] = useState<string | null>(null);
  const [dragOverFieldId, setDragOverFieldId] = useState<string | null>(null);
  const [ocrPromptTemplate, setOcrPromptTemplate] = useState(
    initialOcrPromptTemplate ?? DEFAULT_OCR_PROMPT_TEMPLATE,
  );
  const [activeTab, setActiveTab] = useState<
    "editor" | "settings" | "comms" | "stats"
  >("editor");
  const [activeFieldId, setActiveFieldId] = useState<string | null>(null);
  const [sectionPlaceholders, setSectionPlaceholders] = useState<SectionPlaceholderDraft[]>([]);
  const [isCreatingStage, setIsCreatingStage] = useState(false);
  const parsedStageAdminConfigRef = useRef(parseStageAdminConfig(initialStageAdminConfig));
  const initialCustomSections = useMemo(
    () =>
      normalizePersistedCustomSections(
        parsedStageAdminConfigRef.current.customSections ?? [],
      ),
    [],
  );
  const initialFieldSectionAssignments = useMemo(
    () =>
      sanitizeFieldSectionAssignments(
        parsedStageAdminConfigRef.current.fieldSectionAssignments ?? {},
        initialCustomSections,
      ),
    [initialCustomSections],
  );
  const [customSections, setCustomSections] = useState<PersistedCustomSection[]>(
    initialCustomSections,
  );
  const [fieldSectionAssignments, setFieldSectionAssignments] = useState<Record<string, string>>(
    initialFieldSectionAssignments,
  );
  const [collapsedSectionIds, setCollapsedSectionIds] = useState<string[]>([]);
  const initializedSectionCollapseRef = useRef(false);

  const savedFieldsSnapshotRef = useRef(
    serializePersistedFields(mapFieldsWithLocalId(initialFields)),
  );
  const savedCustomSectionsSnapshotRef = useRef(
    serializePersistedCustomSections(initialCustomSections),
  );
  const savedFieldSectionAssignmentsSnapshotRef = useRef(
    serializeFieldSectionAssignments(initialFieldSectionAssignments),
  );
  const savedCommsSnapshotRef = useRef(
    serializePersistedComms({
      automations: mapAutomationsWithLocalId(initialAutomations),
      ocrPromptTemplate: initialOcrPromptTemplate ?? DEFAULT_OCR_PROMPT_TEMPLATE,
    }),
  );
  const savedSettingsSnapshotRef = useRef<string | null>(null);

  const orderedFields = fields;
  const deferredOrderedFields = useDeferredValue(orderedFields);
  const persistedFieldsSnapshot = useMemo(
    () => serializePersistedFields(orderedFields),
    [orderedFields],
  );
  const persistedCustomSectionsSnapshot = useMemo(
    () => serializePersistedCustomSections(customSections),
    [customSections],
  );
  const persistedFieldSectionAssignmentsSnapshot = useMemo(
    () =>
      serializeFieldSectionAssignments(
        sanitizeFieldSectionAssignments(fieldSectionAssignments, customSections),
      ),
    [customSections, fieldSectionAssignments],
  );
  const persistedCommsSnapshot = useMemo(
    () =>
      serializePersistedComms({
        automations,
        ocrPromptTemplate,
      }),
    [automations, ocrPromptTemplate],
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
      sort_order: nextIndex,
      is_active: true,
      created_at: new Date().toISOString(),
    };
  }

  function applyOrderedFields(nextFields: EditableField[]) {
    setFields(nextFields.map((field, index) => ({ ...field, sort_order: index + 1 })));
  }

  function insertFieldAt(
    position: number,
    seed?:
      | Partial<
          Pick<
            EditableField,
            "field_key" | "field_label" | "field_type" | "is_required" | "placeholder" | "help_text" | "is_active"
          >
        >
      | undefined,
    options?: {
      customSectionId?: string | null;
    },
  ) {
    const safePosition = Math.max(0, Math.min(position, orderedFields.length));
    const nextIndex = orderedFields.length + 1;
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
    const nextFields = [
      ...orderedFields.slice(0, safePosition),
      insertedField,
      ...orderedFields.slice(safePosition),
    ];

    applyOrderedFields(nextFields);
    if (options?.customSectionId) {
      setFieldSectionAssignments((current) => ({
        ...current,
        [insertedField.field_key]: options.customSectionId as string,
      }));
    }
    setActiveFieldId(insertedField.localId);
    setStatusMessage("Campo agregado localmente. Guarda configuración para persistir cambios.");
  }

  function addNextSection() {
    const sectionOrder: ApplicantFormSectionId[] = documentsRouteRepresentsMainForm
      ? ["identity", "family", "school", "motivation", "recommenders", "documents", "other"]
      : ["eligibility", "identity", "family", "school", "motivation", "recommenders", "documents", "other"];
    const existingSectionIds = new Set<ApplicantFormSectionId>(
      deriveEditorSections(
        orderedFields,
        documentsRouteRepresentsMainForm,
        customSections,
        fieldSectionAssignments,
      )
        .map((section) => section.id)
        .filter(
          (sectionId): sectionId is ApplicantFormSectionId => !isCustomEditorSectionId(sectionId),
        ),
    );
    const placeholderSectionIds = new Set(
      sectionPlaceholders
        .map((draft) => (draft.sectionId === "custom" ? null : draft.sectionId))
        .filter(Boolean) as ApplicantFormSectionId[],
    );
    const nextMissingSectionId = sectionOrder.find(
      (sectionId) =>
        !existingSectionIds.has(sectionId) && !placeholderSectionIds.has(sectionId),
    );

    const nextPlaceholder: SectionPlaceholderDraft | null = nextMissingSectionId
      ? {
          localId: `section-${crypto.randomUUID()}`,
          title: getBuiltinSectionTitle(nextMissingSectionId),
          sectionId: nextMissingSectionId,
        }
      : null;

    if (nextPlaceholder) {
      setSectionPlaceholders((current) => [...current, nextPlaceholder]);
      setStatusMessage(
        `Se creó la sección “${nextPlaceholder.title}”. Agrega campos dentro de esa sección y luego guarda configuración.`,
      );
      return;
    }

    const customSectionCount = customSections.length + 1;
    const newCustomSection: PersistedCustomSection = {
      id: `custom-section-${crypto.randomUUID()}`,
      title: `Nueva sección ${customSectionCount}`,
      order: customSectionCount,
    };
    setCustomSections((current) =>
      normalizePersistedCustomSections([...current, newCustomSection]),
    );
    setStatusMessage(
      `Se creó la sección “${newCustomSection.title}”. Guarda configuración para persistir su estructura.`,
    );
  }

  function openPreview() {
    router.push(`/admin/process/${cycleId}/stage/${stageId}/preview`);
  }

  function switchToTab(nextTab: "editor" | "settings" | "comms" | "stats") {
    startTransition(() => setActiveTab(nextTab));
  }

  async function createStage() {
    setError(null);
    setStatusMessage(null);
    setIsCreatingStage(true);

    try {
      const response = await fetch(`/api/cycles/${cycleId}/templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const body = await response.json();

      if (!response.ok) {
        setError(body);
        return;
      }

      const createdTemplate = body.template as CycleStageTemplate;
      setStatusMessage("Nueva etapa creada. Abriendo editor de etapa...");
      router.push(`/admin/process/${cycleId}/stage/${createdTemplate.id}`);
      router.refresh();
    } finally {
      setIsCreatingStage(false);
    }
  }

  function addFieldToPlaceholder(placeholder: SectionPlaceholderDraft) {
    const suffix = orderedFields.length + 1;
    const seed = getNewFieldSeedForSection({ sectionId: placeholder.sectionId, suffix });
    insertFieldAt(orderedFields.length, {
      field_key: seed.field_key,
      field_label: seed.field_label,
      field_type: seed.field_type,
      is_required: false,
      placeholder: "",
      help_text: "",
      is_active: true,
    });
    setSectionPlaceholders((current) =>
      current.filter((draft) => draft.localId !== placeholder.localId),
    );
  }

  function remapFieldSectionAssignmentKey(previousKey: string, nextKey: string) {
    if (previousKey === nextKey) {
      return;
    }

    setFieldSectionAssignments((current) => {
      const sectionId = current[previousKey];
      if (!sectionId) {
        return current;
      }

      const nextAssignments = { ...current };
      delete nextAssignments[previousKey];
      nextAssignments[nextKey] = sectionId;
      return nextAssignments;
    });
  }

  function removeFieldSectionAssignment(fieldKey: string) {
    setFieldSectionAssignments((current) => {
      if (!current[fieldKey]) {
        return current;
      }

      const nextAssignments = { ...current };
      delete nextAssignments[fieldKey];
      return nextAssignments;
    });
  }

  function reorderDraggedField(targetLocalId: string) {
    if (!draggedFieldId || draggedFieldId === targetLocalId) {
      return;
    }

    const draggingIndex = orderedFields.findIndex((field) => field.localId === draggedFieldId);
    const targetIndex = orderedFields.findIndex((field) => field.localId === targetLocalId);

    if (draggingIndex < 0 || targetIndex < 0) {
      return;
    }

    const nextFields = [...orderedFields];
    const [draggingField] = nextFields.splice(draggingIndex, 1);
    nextFields.splice(targetIndex, 0, draggingField);
    applyOrderedFields(nextFields);
  }

  function handleFieldDrop(event: DragEvent<HTMLDivElement>, targetLocalId: string) {
    event.preventDefault();
    reorderDraggedField(targetLocalId);
    setDragOverFieldId(null);
    setDraggedFieldId(null);
  }

  function addAutomation() {
    const baseTrigger = automations.some((automation) => automation.trigger_event === "application_submitted")
      ? "stage_result"
      : "application_submitted";
    setAutomations((current) => [
      ...current,
      {
        id: `new-${crypto.randomUUID()}`,
        localId: `new-${crypto.randomUUID()}`,
        cycle_id: cycleId,
        stage_code: stageCode,
        trigger_event: baseTrigger,
        channel: "email",
        is_enabled: false,
        template_subject: "Nuevo asunto",
        template_body: "Nuevo cuerpo de automatización",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]);
  }

  function removeField(localId: string) {
    const removedField = orderedFields.find((field) => field.localId === localId);
    if (removedField) {
      removeFieldSectionAssignment(removedField.field_key);
    }
    applyOrderedFields(orderedFields.filter((field) => field.localId !== localId));
  }

  function removeAutomation(localId: string) {
    setAutomations((current) => current.filter((automation) => automation.localId !== localId));
  }

  async function saveStageConfig() {
    setError(null);
    setStatusMessage(null);
    setIsSaving(true);

    try {
      const response = await fetch(`/api/cycles/${cycleId}/stages/${stageId}/config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fields: orderedFields.map((field, index) => ({
            id: isUuid(field.id) ? field.id : undefined,
            fieldKey: field.field_key,
            fieldLabel: field.field_label,
            fieldType: field.field_type,
            isRequired: field.is_required,
            placeholder: field.placeholder,
            helpText: field.help_text,
            sortOrder: index + 1,
            isActive: field.is_active,
          })),
          customSections: customSections.map((section, index) => ({
            id: section.id,
            title: section.title.trim() || `Nueva sección ${index + 1}`,
            order: index + 1,
          })),
          fieldSectionAssignments: sanitizeFieldSectionAssignments(
            fieldSectionAssignments,
            customSections,
          ),
          automations: automations.map((automation) => ({
            id: isUuid(automation.id) ? automation.id : undefined,
            triggerEvent: automation.trigger_event,
            channel: automation.channel,
            isEnabled: automation.is_enabled,
            templateSubject: automation.template_subject,
            templateBody: automation.template_body,
          })),
          ocrPromptTemplate:
            ocrPromptTemplate.trim().length > 0 ? ocrPromptTemplate.trim() : null,
          settings: {
            stageName: settingsStageName.trim(),
            description: settingsDescription.trim(),
            openDate: settingsOpenDate || null,
            closeDate: settingsCloseDate || null,
            previousStageRequirement,
            blockIfPreviousNotMet,
          },
        }),
      });
      const body = await response.json();

      if (!response.ok) {
        setError(body);
        return;
      }

      const nextSavedFields = mapFieldsWithLocalId(body.fields ?? []);
      const nextSavedAutomations = mapAutomationsWithLocalId(body.automations ?? []);
      const nextSavedOcrPrompt = body.ocrPromptTemplate ?? "";
      const nextSavedCustomSections = normalizePersistedCustomSections(
        Array.isArray(body.customSections) ? body.customSections : customSections,
      );
      const nextSavedFieldSectionAssignments = sanitizeFieldSectionAssignments(
        typeof body.fieldSectionAssignments === "object" &&
          body.fieldSectionAssignments &&
          !Array.isArray(body.fieldSectionAssignments)
          ? (body.fieldSectionAssignments as Record<string, string>)
          : fieldSectionAssignments,
        nextSavedCustomSections,
      );
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
          typeof body.settings?.openDate === "string" ? body.settings.openDate : "",
        closeDate:
          typeof body.settings?.closeDate === "string" ? body.settings.closeDate : "",
        previousStageRequirement:
          typeof body.settings?.previousStageRequirement === "string"
            ? body.settings.previousStageRequirement
            : previousStageRequirement,
        blockIfPreviousNotMet:
          typeof body.settings?.blockIfPreviousNotMet === "boolean"
            ? body.settings.blockIfPreviousNotMet
            : blockIfPreviousNotMet,
      } satisfies StageEditorSettingsDraft;

      setFields(nextSavedFields);
      setCustomSections(nextSavedCustomSections);
      setFieldSectionAssignments(nextSavedFieldSectionAssignments);
      setAutomations(nextSavedAutomations);
      setOcrPromptTemplate(nextSavedOcrPrompt);
      setSettingsStageName(nextSavedSettings.stageName);
      setSettingsDescription(nextSavedSettings.description);
      setSettingsOpenDate(nextSavedSettings.openDate);
      setSettingsCloseDate(nextSavedSettings.closeDate);
      setPreviousStageRequirement(nextSavedSettings.previousStageRequirement);
      setBlockIfPreviousNotMet(nextSavedSettings.blockIfPreviousNotMet);
      savedFieldsSnapshotRef.current = serializePersistedFields(nextSavedFields);
      savedCustomSectionsSnapshotRef.current =
        serializePersistedCustomSections(nextSavedCustomSections);
      savedFieldSectionAssignmentsSnapshotRef.current =
        serializeFieldSectionAssignments(nextSavedFieldSectionAssignments);
      savedCommsSnapshotRef.current = serializePersistedComms({
        automations: nextSavedAutomations,
        ocrPromptTemplate: nextSavedOcrPrompt,
      });
      savedSettingsSnapshotRef.current = serializeSettingsDraft(nextSavedSettings);
      setStatusMessage("Configuración de etapa guardada.");
    } finally {
      setIsSaving(false);
    }
  }
  const documentsRouteRepresentsMainForm = stageCode === "documents";
  const displayStageLabel = documentsRouteRepresentsMainForm
    ? "Formulario Principal"
    : stageCode === "exam_placeholder"
      ? "Examen Académico"
      : stageLabel;
  const parsedStageAdminConfig = parsedStageAdminConfigRef.current;
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
    parsedStageAdminConfig.blockIfPreviousNotMet ?? documentsRouteRepresentsMainForm,
  );
  const settingsDraftSnapshot = useMemo(
    () =>
      serializeSettingsDraft({
        stageName: settingsStageName,
        description: settingsDescription,
        openDate: settingsOpenDate,
        closeDate: settingsCloseDate,
        previousStageRequirement,
        blockIfPreviousNotMet,
      }),
    [
      settingsStageName,
      settingsDescription,
      settingsOpenDate,
      settingsCloseDate,
      previousStageRequirement,
      blockIfPreviousNotMet,
    ],
  );
  if (savedSettingsSnapshotRef.current === null) {
    savedSettingsSnapshotRef.current = settingsDraftSnapshot;
  }
  const hasUnsavedCustomSectionsChanges =
    persistedCustomSectionsSnapshot !== savedCustomSectionsSnapshotRef.current;
  const hasUnsavedFieldSectionAssignmentsChanges =
    persistedFieldSectionAssignmentsSnapshot !==
    savedFieldSectionAssignmentsSnapshotRef.current;
  const hasUnsavedFieldConfigChanges =
    persistedFieldsSnapshot !== savedFieldsSnapshotRef.current ||
    hasUnsavedCustomSectionsChanges ||
    hasUnsavedFieldSectionAssignmentsChanges;
  const hasUnsavedCommsConfigChanges =
    persistedCommsSnapshot !== savedCommsSnapshotRef.current;
  const hasUnsavedSettingsConfigChanges =
    settingsDraftSnapshot !== savedSettingsSnapshotRef.current;
  const hasUnsavedSectionDraftChanges = sectionPlaceholders.length > 0;
  const hasUnsavedConfigChanges =
    hasUnsavedFieldConfigChanges ||
    hasUnsavedCommsConfigChanges ||
    hasUnsavedSettingsConfigChanges;
  const canSavePersistedConfig = hasUnsavedConfigChanges && !isSaving;
  const isLargeFormEditor = orderedFields.length >= 80;
  const saveableChangeLabels = [
    hasUnsavedFieldConfigChanges ? "Editor de Formulario" : null,
    hasUnsavedSettingsConfigChanges ? "Ajustes y Reglas" : null,
    hasUnsavedCommsConfigChanges ? "Comunicaciones" : null,
  ].filter(Boolean) as string[];
  const draftOnlyChangeLabels = [
    hasUnsavedSectionDraftChanges ? "Secciones nuevas (placeholder)" : null,
  ].filter(Boolean) as string[];

  const editorSections = useMemo(
    () => {
      if (activeTab !== "editor") {
        return [];
      }

      return deriveEditorSections(
        deferredOrderedFields,
        documentsRouteRepresentsMainForm,
        customSections,
        fieldSectionAssignments,
      );
    },
    [
      activeTab,
      deferredOrderedFields,
      documentsRouteRepresentsMainForm,
      customSections,
      fieldSectionAssignments,
    ],
  );

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
  const emptyCustomEditorSections = useMemo(
    () =>
      activeTab === "editor"
        ? editorSections.filter(
            (section) =>
              isCustomEditorSectionId(section.id) && section.fields.length === 0,
          )
        : [],
    [activeTab, editorSections],
  );
  const editorHasOtherSection = useMemo(
    () => activeTab === "editor" && editorSections.some((section) => section.id === "other"),
    [activeTab, editorSections],
  );
  const customSectionPositionById = useMemo(() => {
    const normalized = normalizePersistedCustomSections(customSections);
    const total = normalized.length;
    return new Map(
      normalized.map((section, index) => [section.id, { index, total }] as const),
    );
  }, [customSections]);

  const orderedFieldIndexByLocalId = useMemo(
    () => {
      if (activeTab !== "editor") {
        return new Map<string, number>();
      }

      return new Map(
        orderedFields.map((field, index) => [field.localId, index] as const),
      );
    },
    [activeTab, orderedFields],
  );

  const editorFieldSectionMeta = useMemo(() => {
    if (activeTab !== "editor") {
      return {
        headingByFieldId: new Map<string, string>(),
        firstFieldIds: new Set<string>(),
        lastFieldIds: new Set<string>(),
        insertPositionByLastFieldId: new Map<string, number>(),
        insertPositionBySectionId: new Map<EditorSectionId, number>(),
        sectionIdByLastFieldId: new Map<string, EditorSectionId>(),
        sectionIdByFieldId: new Map<string, EditorSectionId>(),
      };
    }

    const headingByFieldId = new Map<string, string>();
    const firstFieldIds = new Set<string>();
    const lastFieldIds = new Set<string>();
    const insertPositionByLastFieldId = new Map<string, number>();
    const insertPositionBySectionId = new Map<EditorSectionId, number>();
    const sectionIdByLastFieldId = new Map<string, EditorSectionId>();
    const sectionIdByFieldId = new Map<string, EditorSectionId>();
    const collapsedSet = new Set(collapsedSectionIds);

    editorSections.forEach((section, index) => {
      const sectionFields = section.fields as EditableField[];
      const heading = `Sección ${index + 1}: ${section.title}`;
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
          typeof lastIndex === "number" ? lastIndex + 1 : orderedFields.length,
        );
        insertPositionBySectionId.set(
          section.id,
          typeof lastIndex === "number" ? lastIndex + 1 : orderedFields.length,
        );
      } else {
        insertPositionBySectionId.set(section.id, orderedFields.length);
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
    orderedFields.length,
  ]);

  useEffect(() => {
    if (activeTab !== "editor") {
      return;
    }

    const availableSectionIds = new Set(editorSections.map((section) => String(section.id)));
    setCollapsedSectionIds((current) => current.filter((id) => availableSectionIds.has(id)));

    if (initializedSectionCollapseRef.current || editorSections.length === 0) {
      return;
    }

    initializedSectionCollapseRef.current = true;
    if (!isLargeFormEditor) {
      return;
    }

    setCollapsedSectionIds(editorSections.slice(1).map((section) => String(section.id)));
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

  function moveCustomSection(sectionId: string, direction: "up" | "down") {
    setCustomSections((current) => {
      const normalized = normalizePersistedCustomSections(current);
      const currentIndex = normalized.findIndex((section) => section.id === sectionId);
      if (currentIndex < 0) {
        return current;
      }

      const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
      if (targetIndex < 0 || targetIndex >= normalized.length) {
        return current;
      }

      const next = [...normalized];
      const [moved] = next.splice(currentIndex, 1);
      next.splice(targetIndex, 0, moved);
      const reordered = next.map((section, index) => ({ ...section, order: index + 1 }));
      return normalizePersistedCustomSections(reordered);
    });
    setStatusMessage("Orden de sección actualizado localmente. Guarda configuración para persistir.");
  }

  function renderSectionHeading(
    heading: string,
    sectionId: EditorSectionId,
    options?: { canCollapse?: boolean },
  ) {
    const customSectionId = getCustomSectionIdFromEditorSectionId(sectionId);
    const customSectionPosition = customSectionId
      ? customSectionPositionById.get(customSectionId)
      : undefined;
    const sectionKey = String(sectionId);
    const isCollapsed = collapsedSectionIdSet.has(sectionKey);
    const canCollapse = options?.canCollapse ?? true;

    return (
      <div className="admin-stage-section-heading-row">
        <div className="builder-section-title">{heading}</div>
        <div className="admin-stage-section-header-actions" role="group" aria-label="Acciones de sección">
          <button
            type="button"
            className="admin-stage-section-header-btn"
            onClick={() => {
              if (customSectionId) {
                moveCustomSection(customSectionId, "up");
              }
            }}
            disabled={!customSectionPosition || customSectionPosition.index === 0}
            title={
              customSectionId
                ? "Subir sección"
                : "Las secciones base no se reordenan desde aquí"
            }
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
            onClick={() => {
              if (customSectionId) {
                moveCustomSection(customSectionId, "down");
              }
            }}
            disabled={
              !customSectionPosition ||
              customSectionPosition.index === customSectionPosition.total - 1
            }
            title={
              customSectionId
                ? "Bajar sección"
                : "Las secciones base no se reordenan desde aquí"
            }
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
          {canCollapse ? (
            <button
              type="button"
              className={`admin-stage-section-header-btn ${isCollapsed ? "" : "is-active"}`.trim()}
              onClick={() => toggleSectionCollapse(sectionKey)}
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

  function renderPersistedEmptyCustomSection(section: EditorSection) {
    const customSectionId = getCustomSectionIdFromEditorSectionId(section.id);
    if (!customSectionId) {
      return null;
    }

    const sectionNumber = editorSections.findIndex((candidate) => candidate.id === section.id) + 1;

    return (
      <div key={section.id} className="admin-stage-section-placeholder">
        {renderSectionHeading(`Sección ${sectionNumber}: ${section.title}`, section.id, {
          canCollapse: false,
        })}
        <div className="settings-card admin-stage-empty-section-card">
          <div className="editor-grid">
            <div className="form-field full">
              <label htmlFor={`custom-section-title-${customSectionId}`}>
                Nombre de la sección
              </label>
              <input
                id={`custom-section-title-${customSectionId}`}
                type="text"
                value={section.title}
                onChange={(event) =>
                  setCustomSections((current) =>
                    normalizePersistedCustomSections(
                      current.map((item) =>
                        item.id === customSectionId
                          ? { ...item, title: event.target.value }
                          : item,
                      ),
                    ),
                  )
                }
              />
              <small className="admin-text-muted">
                Guarda configuración para persistir esta sección personalizada.
              </small>
            </div>
          </div>
          <button
            type="button"
            className="add-field-btn"
            onClick={() => {
              const suffix = orderedFields.length + 1;
              const seed = getNewFieldSeedForSection({
                sectionId: "custom",
                suffix,
              });
              insertFieldAt(
                orderedFields.length,
                {
                  field_key: seed.field_key,
                  field_label: seed.field_label,
                  field_type: seed.field_type,
                  is_required: false,
                  placeholder: "",
                  help_text: "",
                  is_active: true,
                },
                { customSectionId },
              );
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Añadir nuevo campo en esta sección
          </button>
        </div>
      </div>
    );
  }

  const sidebarTemplateStages = useMemo(
    () =>
      [...stageTemplates]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((template, index) => ({
          key: template.id,
          number: index + 1,
          title:
            template.stage_code === "documents"
              ? "Formulario Principal"
              : template.stage_code === "exam_placeholder"
                ? "Examen Académico"
                : template.stage_label,
          subtitle:
            template.stage_code === "documents"
              ? "Formulario extenso"
              : template.stage_code === "exam_placeholder"
                ? "Evaluación externa"
                : "Etapa personalizada",
          active: template.id === stageId,
          templateId: template.id,
        })),
    [stageId, stageTemplates],
  );

  return (
    <div id="view-process" className="view active admin-stage-editor-view">
      {/* Contextual Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <Link href="/admin/processes" className="admin-sidebar-backlink">
            <div className="eyebrow">← Volver a procesos</div>
          </Link>
          <h2 className="admin-sidebar-title">{cycleName}</h2>
        </div>
        
        <div className="sidebar-nav">
          <div className="builder-section-title admin-sidebar-section-title">
            Etapas del Proceso
          </div>
          {sidebarTemplateStages.map((item) => (
            <button
              key={item.key}
              className={`stage-item ${item.active ? "active" : ""}`}
              type="button"
              onClick={() => router.push(`/admin/process/${cycleId}/stage/${item.templateId}`)}
            >
              <div className="stage-icon">{item.number}</div>
              <div className="stage-info">
                <div className="stage-title">{item.title}</div>
                <div className="stage-type">{item.subtitle}</div>
              </div>
            </button>
          ))}
          <div className="admin-sidebar-footer">
            <button
              type="button"
              className="btn btn-ghost admin-sidebar-add-stage"
              onClick={() => void createStage()}
              disabled={isCreatingStage}
            >
              {isCreatingStage ? "Creando etapa..." : "+ Añadir etapa"}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Workspace */}
      <main className="main">
        <div className="canvas-header">
          {error && <ErrorCallout message={error.message} errorId={error.errorId} context="stage_config" />}
          {statusMessage && (
            <div className="admin-feedback success" style={{ marginBottom: "16px" }}>
              {statusMessage}
            </div>
          )}
          <div className="stage-status">Etapa Activa</div>
          <div className="canvas-title-row">
            <div>
              <h1>{settingsStageName.trim() || displayStageLabel}</h1>
              <p>Configura la captura de datos de esta etapa, reglas de acceso y notificaciones.</p>
            </div>
            <div className="admin-stage-header-actions">
              <button
                type="button"
                className="btn btn-outline admin-stage-preview-btn"
                onClick={openPreview}
              >
                Previsualizar Formulario
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={saveStageConfig}
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
          <div className="admin-stage-save-hint" aria-live="polite">
            {hasUnsavedConfigChanges
              ? "Cambios sin guardar (editor, ajustes y/o comunicaciones)."
              : "Sin cambios pendientes en configuración persistente."}
          </div>
          {(saveableChangeLabels.length > 0 || draftOnlyChangeLabels.length > 0) && (
            <div className="admin-stage-save-scope" aria-live="polite">
              {saveableChangeLabels.length > 0 ? (
                <div>
                  <strong>Guardar configuración guardará:</strong>{" "}
                  {saveableChangeLabels.join(", ")}.
                </div>
              ) : null}
              {draftOnlyChangeLabels.length > 0 ? (
                <div>
                  <strong>Cambios detectados pero aún no persistidos por este botón:</strong>{" "}
                  {draftOnlyChangeLabels.join(", ")}.
                </div>
              ) : null}
            </div>
          )}

          <div className="page-tabs">
            <button
              className={`page-tab ${activeTab === "editor" ? "active" : ""}`}
              onClick={() => switchToTab("editor")}
            >
              Editor de Formulario
              {(hasUnsavedFieldConfigChanges || hasUnsavedSectionDraftChanges) ? " •" : ""}
            </button>
            <button
              className={`page-tab ${activeTab === "settings" ? "active" : ""}`}
              onClick={() => switchToTab("settings")}
            >
              Ajustes y Reglas
              {hasUnsavedSettingsConfigChanges ? " •" : ""}
            </button>
            <button
              className={`page-tab ${activeTab === "comms" ? "active" : ""}`}
              onClick={() => switchToTab("comms")}
            >
              Comunicaciones
              {hasUnsavedCommsConfigChanges ? " •" : ""}
            </button>
            <button
              className={`page-tab ${activeTab === "stats" ? "active" : ""}`}
              onClick={() => switchToTab("stats")}
            >
              Estadísticas
            </button>
          </div>
        </div>

        <div className="canvas-body">
          {activeTab === "editor" && (
            <div id="tab-editor" className="tab-content active">
              <div className="field-list">
                {displayedEditorFields.length === 0 ? (
                  <>
                    <div className="builder-section-title">Sección 1: Datos Personales</div>
                    <button
                      className="add-field-btn admin-stage-empty-add-field"
                      onClick={() => insertFieldAt(0)}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      Añadir nuevo campo
                    </button>
                  </>
                ) : null}
                {displayedEditorFields.map((field) => {
                  const isEditing = activeFieldId === field.localId;
                  const isSectionStart = editorFieldSectionMeta.firstFieldIds.has(
                    field.localId,
                  );
                  const isSectionEnd = editorFieldSectionMeta.lastFieldIds.has(
                    field.localId,
                  );
                  const sectionHeading =
                    editorFieldSectionMeta.headingByFieldId.get(field.localId) ??
                    "Sección: Otros campos";
                  const sectionInsertPosition =
                    editorFieldSectionMeta.insertPositionByLastFieldId.get(
                      field.localId,
                    ) ?? orderedFields.length;
                  const sectionIdForInsert =
                    editorFieldSectionMeta.sectionIdByLastFieldId.get(field.localId) ?? "other";
                  const sectionId =
                    editorFieldSectionMeta.sectionIdByFieldId.get(field.localId) ?? "other";
                  const sectionKey = String(sectionId);
                  const isSectionCollapsed = collapsedSectionIdSet.has(sectionKey);

                  if (isSectionCollapsed && !isSectionStart) {
                    return null;
                  }

                  return (
                    <div key={field.localId}>
                      {isSectionStart && sectionId === "other" && emptyCustomEditorSections.length > 0
                        ? emptyCustomEditorSections.map((section) =>
                            renderPersistedEmptyCustomSection(section),
                          )
                        : null}
                      {isSectionStart ? renderSectionHeading(sectionHeading, sectionId) : null}
                      {isSectionStart && isSectionCollapsed ? (
                        null
                      ) : null}
                      {isSectionCollapsed ? null : (
                      <div
                        className={[
                          "field-card",
                          isEditing ? "editing" : "",
                          dragOverFieldId === field.localId ? "is-drag-over" : "",
                          draggedFieldId === field.localId ? "is-dragging" : "",
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
                          setDragOverFieldId((current) => (current === field.localId ? null : current));
                        }}
                        onDrop={(event) => handleFieldDrop(event, field.localId)}
                        onDragEnd={() => {
                          setDraggedFieldId(null);
                          setDragOverFieldId(null);
                        }}
                      >
                        <div
                          className="field-header"
                          onClick={() => setActiveFieldId(isEditing ? null : field.localId)}
                        >
                          <div
                            className={`drag-handle ${draggedFieldId === field.localId ? "dragging" : ""}`}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/></svg>
                          </div>
                          <div className="field-icon">
                            {getFieldIcon(field.field_type)}
                          </div>
                          <div className="field-details">
                            <div className="field-name">
                              {field.field_label} {field.is_required && <span className="req-star">*</span>}
                              {isEditing && <span className="editing-badge">Editando</span>}
                            </div>
                            <div className="field-type">
                              {getFieldTypeLabel(field.field_type)} • id: <code>{field.field_key}</code>
                            </div>
                          </div>
                          <div className="field-actions">
                            <button
                              className="btn-icon"
                              title="Editar"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveFieldId(isEditing ? null : field.localId);
                              }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>
                            <button
                              className="btn-icon danger"
                              title="Eliminar"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeField(field.localId);
                              }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                            </button>
                          </div>
                        </div>

                        {isEditing && (
                          <div className="field-editor">
                            <div className="editor-grid">
                              <div className="form-field full">
                                <label htmlFor={`title-${field.localId}`}>Título</label>
                                <input
                                  id={`title-${field.localId}`}
                                  type="text"
                                  value={field.field_label}
                                  onChange={(event) => {
                                    const value = event.target.value;
                                    const nextFieldKey =
                                      field.id.startsWith("new-") || field.field_key.startsWith("nuevoCampo")
                                        ? normalizeFieldKey(value)
                                        : field.field_key;
                                    remapFieldSectionAssignmentKey(field.field_key, nextFieldKey);
                                    setFields((current) =>
                                      current.map((item) =>
                                        item.localId === field.localId
                                          ? {
                                              ...item,
                                              field_label: value,
                                              field_key:
                                                item.id.startsWith("new-") || item.field_key.startsWith("nuevoCampo")
                                                  ? normalizeFieldKey(value)
                                                  : item.field_key,
                                            }
                                          : item,
                                      ),
                                    );
                                  }}
                                />
                              </div>
                              <div className="form-field">
                                <label htmlFor={`key-${field.localId}`}>Identificador interno (Clave)</label>
                                <input
                                  id={`key-${field.localId}`}
                                  type="text"
                                  value={field.field_key}
                                  onChange={(event) => {
                                    const nextFieldKey = normalizeFieldKey(event.target.value);
                                    remapFieldSectionAssignmentKey(field.field_key, nextFieldKey);
                                    setFields((current) =>
                                      current.map((item) =>
                                        item.localId === field.localId
                                          ? {
                                              ...item,
                                              field_key: normalizeFieldKey(event.target.value),
                                            }
                                          : item,
                                      ),
                                    );
                                  }}
                                  style={{ fontFamily: "monospace", color: "var(--muted)", background: "var(--paper)" }}
                                />
                              </div>
                              <div className="form-field">
                                <label htmlFor={`type-${field.localId}`}>Tipo de campo</label>
                                <select
                                  id={`type-${field.localId}`}
                                  value={field.field_type}
                                  onChange={(event) =>
                                    setFields((current) =>
                                      current.map((item) =>
                                        item.localId === field.localId
                                          ? {
                                              ...item,
                                              field_type: event.target.value as CycleStageField["field_type"],
                                            }
                                          : item,
                                      ),
                                    )
                                  }
                                >
                                  <option value="short_text">Texto corto</option>
                                  <option value="long_text">Texto largo</option>
                                  <option value="number">Número</option>
                                  <option value="date">Fecha</option>
                                  <option value="email">Correo</option>
                                  <option value="file">Archivo</option>
                                </select>
                              </div>
                              <div className="form-field full">
                                <label htmlFor={`placeholder-${field.localId}`}>Placeholder</label>
                                <input
                                  id={`placeholder-${field.localId}`}
                                  type="text"
                                  value={field.placeholder ?? ""}
                                  onChange={(event) =>
                                    setFields((current) =>
                                      current.map((item) =>
                                        item.localId === field.localId ? { ...item, placeholder: event.target.value } : item,
                                      ),
                                    )
                                  }
                                />
                              </div>
                              <div className="form-field full">
                                <label htmlFor={`help-${field.localId}`}>Ayuda</label>
                                <input
                                  id={`help-${field.localId}`}
                                  type="text"
                                  value={field.help_text ?? ""}
                                  onChange={(event) =>
                                    setFields((current) =>
                                      current.map((item) =>
                                        item.localId === field.localId ? { ...item, help_text: event.target.value } : item,
                                      ),
                                    )
                                  }
                                />
                              </div>

                              <div className="form-field full" style={{ marginTop: "16px" }}>
                                <div className="switch-wrapper" style={{ borderColor: "var(--maroon-soft)", background: "var(--paper)", marginBottom: "8px" }}>
                                  <div>
                                    <div style={{ fontSize: "0.8rem", fontWeight: 500, color: "var(--ink)" }}>Campo obligatorio</div>
                                    <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>El postulante no podrá avanzar si no responde.</div>
                                  </div>
                                  <label className="switch">
                                    <input
                                      type="checkbox"
                                      checked={field.is_required}
                                      onChange={(event) =>
                                        setFields((current) =>
                                          current.map((item) =>
                                            item.localId === field.localId
                                              ? { ...item, is_required: event.target.checked }
                                              : item,
                                          ),
                                        )
                                      }
                                    />
                                    <span className="slider"></span>
                                  </label>
                                </div>
                                <div className="switch-wrapper" style={{ borderColor: "var(--maroon-soft)", background: "var(--paper)" }}>
                                  <div>
                                    <div style={{ fontSize: "0.8rem", fontWeight: 500, color: "var(--ink)" }}>Campo visible</div>
                                    <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>Si está oculto, los postulantes no lo verán.</div>
                                  </div>
                                  <label className="switch">
                                    <input
                                      type="checkbox"
                                      checked={field.is_active}
                                      onChange={(event) =>
                                        setFields((current) =>
                                          current.map((item) =>
                                            item.localId === field.localId
                                              ? { ...item, is_active: event.target.checked }
                                              : item,
                                          ),
                                        )
                                      }
                                    />
                                    <span className="slider"></span>
                                  </label>
                                </div>
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
                                Guardar Campo
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                      )}
                      {isSectionEnd ? (
                        <button
                          className="add-field-btn admin-stage-section-add-field"
                          style={isSectionCollapsed ? { display: "none" } : undefined}
                          onClick={() => {
                            const suffix = orderedFields.length + 1;
                            const customSectionId =
                              getCustomSectionIdFromEditorSectionId(sectionIdForInsert);
                            const seed = getNewFieldSeedForSection(
                              customSectionId
                                ? {
                                    sectionId: "custom",
                                    suffix,
                                  }
                                : {
                                    sectionId: sectionIdForInsert as ApplicantFormSectionId,
                                    suffix,
                                  },
                            );
                            insertFieldAt(sectionInsertPosition, {
                              field_key: seed.field_key,
                              field_label: seed.field_label,
                              field_type: seed.field_type,
                              is_required: false,
                              placeholder: "",
                              help_text: "",
                              is_active: true,
                            }, { customSectionId });
                          }}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                          Añadir nuevo campo
                        </button>
                      ) : null}
                    </div>
                  );
                })}
                {sectionPlaceholders.map((placeholder, index) => (
                    <div key={placeholder.localId} className="admin-stage-section-placeholder">
                    <div className="admin-stage-section-heading-row">
                      <div className="builder-section-title">
                        {`Sección ${editorSections.length + index + 1}: ${placeholder.title}`}
                      </div>
                    </div>
                    <div className="settings-card admin-stage-empty-section-card">
                      <div className="editor-grid">
                        <div className="form-field full">
                          <label htmlFor={`section-title-${placeholder.localId}`}>
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
                            La sección quedará visible cuando agregues al menos un campo.
                          </small>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="add-field-btn"
                        onClick={() => addFieldToPlaceholder(placeholder)}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        Añadir nuevo campo en esta sección
                      </button>
                    </div>
                  </div>
                ))}
                {!editorHasOtherSection
                  ? emptyCustomEditorSections.map((section) =>
                      renderPersistedEmptyCustomSection(section),
                    )
                  : null}
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
                    <label htmlFor={`stage-name-${stageCode}`}>Nombre de la etapa</label>
                    <input
                      id={`stage-name-${stageCode}`}
                      type="text"
                      value={settingsStageName}
                      onChange={(event) => setSettingsStageName(event.target.value)}
                    />
                  </div>
                  <div className="form-field full">
                    <label htmlFor={`stage-description-${stageCode}`}>Descripción corta</label>
                    <textarea
                      id={`stage-description-${stageCode}`}
                      rows={2}
                      value={settingsDescription}
                      onChange={(event) => setSettingsDescription(event.target.value)}
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor={`stage-open-date-${stageCode}`}>Fecha de apertura</label>
                    <input
                      id={`stage-open-date-${stageCode}`}
                      type="date"
                      value={settingsOpenDate}
                      onChange={(event) => setSettingsOpenDate(event.target.value)}
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor={`stage-close-date-${stageCode}`}>Fecha de cierre</label>
                    <input
                      id={`stage-close-date-${stageCode}`}
                      type="date"
                      value={settingsCloseDate}
                      onChange={(event) => setSettingsCloseDate(event.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="settings-card">
                <div className="settings-card-header">
                  <h3>Reglas de Acceso</h3>
                  <p>Condiciones para que un postulante pueda ingresar a esta etapa.</p>
                </div>
                <div className="admin-stage-settings-stack">
                  <div className="form-field">
                    <label htmlFor={`prev-stage-${stageCode}`}>Etapa previa requerida</label>
                    <select
                      id={`prev-stage-${stageCode}`}
                      value={previousStageRequirement}
                      onChange={(event) =>
                        setPreviousStageRequirement(event.target.value)
                      }
                    >
                      <option value="none">Ninguna (acceso directo)</option>
                      <option value="main_form">1. Formulario Principal</option>
                      <option value="exam_placeholder">2. Examen Académico</option>
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
                      <div className="admin-switch-label">Bloquear si no cumple requisitos</div>
                      <div className="admin-switch-help">
                        El postulante no podrá ver esta etapa si fue rechazado en la etapa previa.
                      </div>
                    </div>
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={blockIfPreviousNotMet}
                        onChange={(event) => setBlockIfPreviousNotMet(event.target.checked)}
                      />
                      <span className="slider"></span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "comms" && (
            <div id="tab-comms" className="tab-content active">
              <div className="builder-section-title">Automatizaciones de correo</div>
              <div className="admin-stage-comms-toolbar">
                <p className="admin-stage-comms-copy">
                  Define plantillas por evento. Mantén solo las necesarias.
                </p>
                <button className="btn btn-outline" onClick={addAutomation}>+ Nueva Notificación</button>
              </div>

              {automations.map((automation) => (
                <div className="comm-card" key={automation.localId}>
                  <div className="comm-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                  </div>
                  <div className="comm-content">
                    <div className="editor-grid">
                      <div className="form-field">
                        <label htmlFor={`event-${automation.localId}`}>Evento</label>
                        <select
                          id={`event-${automation.localId}`}
                          value={automation.trigger_event}
                          onChange={(event) =>
                            setAutomations((current) =>
                              current.map((item) =>
                                item.localId === automation.localId
                                  ? { ...item, trigger_event: event.target.value as StageAutomationTemplate["trigger_event"] }
                                  : item,
                              ),
                            )
                          }
                        >
                          <option value="application_submitted">Postulación enviada</option>
                          <option value="stage_result">Resultado de etapa</option>
                        </select>
                      </div>
                      <div className="form-field" style={{ display: "flex", alignItems: "flex-end" }}>
                         <div className="switch-wrapper" style={{ border: "none", background: "none", padding: "0", width: "100%" }}>
                           <span style={{ fontSize: "0.85rem", fontWeight: 500, marginRight: "12px" }}>Habilitada</span>
                           <label className="switch">
                             <input
                               type="checkbox"
                               checked={automation.is_enabled}
                               onChange={(event) =>
                                 setAutomations((current) =>
                                   current.map((item) =>
                                     item.localId === automation.localId
                                       ? { ...item, is_enabled: event.target.checked }
                                       : item,
                                   ),
                                 )
                               }
                             />
                             <span className="slider"></span>
                           </label>
                         </div>
                      </div>
                      <div className="form-field full">
                        <label htmlFor={`subject-${automation.localId}`}>Asunto</label>
                        <input
                          id={`subject-${automation.localId}`}
                          type="text"
                          value={automation.template_subject}
                          onChange={(event) =>
                            setAutomations((current) =>
                              current.map((item) =>
                                item.localId === automation.localId ? { ...item, template_subject: event.target.value } : item,
                              ),
                            )
                          }
                        />
                      </div>
                      <div className="form-field full">
                        <label htmlFor={`body-${automation.localId}`}>Cuerpo</label>
                        <textarea
                          id={`body-${automation.localId}`}
                          rows={4}
                          value={automation.template_body}
                          onChange={(event) =>
                            setAutomations((current) =>
                              current.map((item) =>
                                item.localId === automation.localId ? { ...item, template_body: event.target.value } : item,
                              ),
                            )
                          }
                        />
                      </div>
                    </div>
                    <div className="comm-actions" style={{ marginTop: "16px" }}>
                      <button
                        className="btn-icon danger"
                        onClick={() => removeAutomation(automation.localId)}
                        title="Eliminar automatización"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              <div className="builder-section-title" style={{ marginTop: "32px" }}>Prompt OCR (Gemini)</div>
              <p style={{ fontSize: "0.85rem", color: "var(--muted)", marginBottom: "16px" }}>
                Define instrucciones para extraer señales útiles desde documentos. Mantén el prompt claro y en español.
              </p>
              <div className="form-field full">
                <label htmlFor="ocr-prompt">Prompt OCR de la etapa</label>
                <textarea
                  id="ocr-prompt"
                  rows={6}
                  value={ocrPromptTemplate}
                  onChange={(event) => setOcrPromptTemplate(event.target.value)}
                />
                <div className="hint" style={{ marginTop: "8px" }}>Nota: el sistema siempre fuerza salida JSON con `summary` y `confidence`.</div>
              </div>
            </div>
          )}

          {activeTab === "stats" && (
            <div id="tab-stats" className="tab-content active">
              <div className="dashboard-grid admin-stage-stats-grid">
                <div className="stat-card">
                  <div className="stat-title">Campos totales</div>
                  <div className="stat-value">{orderedFields.length}</div>
                  <div className="stat-trend neutral">Definidos para esta etapa</div>
                </div>
                <div className="stat-card">
                  <div className="stat-title">Campos obligatorios</div>
                  <div className="stat-value">
                    {orderedFields.filter((field) => field.is_required).length}
                  </div>
                  <div className="stat-trend">Afectan validación</div>
                </div>
                <div className="stat-card">
                  <div className="stat-title">Automatizaciones activas</div>
                  <div className="stat-value">
                    {automations.filter((automation) => automation.is_enabled).length}
                  </div>
                  <div className="stat-trend neutral">Correos habilitados</div>
                </div>
              </div>

              <div className="section-title">Embudo de configuración</div>
              <div className="funnel-container">
                <div className="funnel-bar">
                  <div className="funnel-label">Campos definidos</div>
                  <div className="funnel-track">
                    <div className="funnel-fill" style={{ width: "100%" }}></div>
                  </div>
                  <div className="funnel-value">{orderedFields.length}</div>
                </div>
                <div className="funnel-bar">
                  <div className="funnel-label">Campos activos</div>
                  <div className="funnel-track">
                    <div
                      className="funnel-fill blue"
                      style={{
                        width:
                          orderedFields.length === 0
                            ? "0%"
                            : `${Math.round(
                                (orderedFields.filter((field) => field.is_active).length /
                                  orderedFields.length) *
                                  100,
                              )}%`,
                      }}
                    ></div>
                  </div>
                  <div className="funnel-value">
                    {orderedFields.filter((field) => field.is_active).length}
                  </div>
                </div>
                <div className="funnel-bar">
                  <div className="funnel-label">Campos obligatorios</div>
                  <div className="funnel-track">
                    <div
                      className="funnel-fill success"
                      style={{
                        width:
                          orderedFields.length === 0
                            ? "0%"
                            : `${Math.round(
                                (orderedFields.filter((field) => field.is_required).length /
                                  orderedFields.length) *
                                  100,
                              )}%`,
                      }}
                    ></div>
                  </div>
                  <div className="funnel-value">
                    {orderedFields.filter((field) => field.is_required).length}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
