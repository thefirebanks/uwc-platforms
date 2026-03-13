"use client";

import {
  useLayoutEffect,
  useDeferredValue,
  useMemo,
  useRef,
  type DragEvent,
} from "react";
import type { CycleStageField, StageCode, StageSection } from "@/types/domain";
import { FieldHint } from "@/components/field-hint";
import {
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
  OCR_OUTPUT_FIELD_TYPE_LABELS,
  type EditableField,
  type SectionPlaceholderDraft,
  type FieldAiParserDraft,
  type EditorSection,
} from "./stage-config-editor-types";
import {
  formatFileSize,
  createDefaultFieldAiParserConfig,
  normalizeFieldAiParserConfig,
  deriveEditorSections,
  getFieldTypeLabel,
  getFieldIcon,
  getNewFieldSeedForSection,
  getDefaultSectionTitle,
} from "./stage-config-editor-utils";

export interface StageFieldEditorProps {
  fields: EditableField[];
  setFields: React.Dispatch<React.SetStateAction<EditableField[]>>;
  sections: StageSection[];
  setSections: React.Dispatch<React.SetStateAction<StageSection[]>>;
  sectionPlaceholders: SectionPlaceholderDraft[];
  setSectionPlaceholders: React.Dispatch<
    React.SetStateAction<SectionPlaceholderDraft[]>
  >;
  activeFieldId: string | null;
  setActiveFieldId: React.Dispatch<React.SetStateAction<string | null>>;
  draggedFieldId: string | null;
  setDraggedFieldId: React.Dispatch<React.SetStateAction<string | null>>;
  dragOverFieldId: string | null;
  setDragOverFieldId: React.Dispatch<React.SetStateAction<string | null>>;
  aiReferenceUploadState: Record<
    string,
    { isUploading: boolean; error: string | null }
  >;
  setAiReferenceUploadState: React.Dispatch<
    React.SetStateAction<
      Record<string, { isUploading: boolean; error: string | null }>
    >
  >;
  collapsedSectionIds: string[];
  setCollapsedSectionIds: React.Dispatch<React.SetStateAction<string[]>>;
  setStatusMessage: (message: string | null) => void;
  cycleId: string;
  stageCode: StageCode;
  stageId: string;
  documentsRouteRepresentsMainForm: boolean;
}

export function StageFieldEditor({
  fields,
  setFields,
  sections,
  setSections,
  sectionPlaceholders,
  setSectionPlaceholders,
  activeFieldId,
  setActiveFieldId,
  draggedFieldId,
  setDraggedFieldId,
  dragOverFieldId,
  setDragOverFieldId,
  aiReferenceUploadState,
  setAiReferenceUploadState,
  collapsedSectionIds,
  setCollapsedSectionIds,
  setStatusMessage,
  cycleId,
  stageCode,
  stageId,
  documentsRouteRepresentsMainForm,
}: StageFieldEditorProps) {
  const deferredFields = useDeferredValue(fields);
  const isLargeFormEditor = fields.length >= 80;
  const initializedSectionCollapseRef = useRef(false);

  // --- Handler functions (moved from parent) ---

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
      `Se creó la sección "${newSectionTitle}". Guarda configuración para persistir.`,
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
      `Sección renombrada a "${sanitizedTitle}". Guarda configuración para persistir.`,
    );
  }

  function addFieldToPlaceholder(placeholder: SectionPlaceholderDraft) {
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
        `¿Eliminar el campo "${removedField.field_label}"?\n\nDebes usar "Guardar configuración" para publicar este cambio.`,
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

  // --- Derived memos ---

  const editorSections = useMemo(
    () =>
      deriveEditorSections(
        deferredFields,
        sections,
        documentsRouteRepresentsMainForm,
      ),
    [deferredFields, sections, documentsRouteRepresentsMainForm],
  );

  const displayedEditorFields = useMemo(() => {
    const collapsedSet = new Set(collapsedSectionIds);
    return editorSections.flatMap((section) => {
      const sectionFields = section.fields as EditableField[];
      if (!collapsedSet.has(String(section.id))) {
        return sectionFields;
      }

      return sectionFields.slice(0, 1);
    });
  }, [editorSections, collapsedSectionIds]);

  const emptySections = useMemo(
    () => editorSections.filter((section) => section.fields.length === 0),
    [editorSections],
  );

  const sectionPositionById = useMemo(() => {
    const total = editorSections.length;
    return new Map(
      editorSections.map(
        (section, index) => [section.id, { index, total }] as const,
      ),
    );
  }, [editorSections]);

  const orderedFieldIndexByLocalId = useMemo(
    () =>
      new Map(
        fields.map((field, index) => [field.localId, index] as const),
      ),
    [fields],
  );

  const editorFieldSectionMeta = useMemo(() => {
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
    editorSections,
    collapsedSectionIds,
    orderedFieldIndexByLocalId,
    fields.length,
  ]);

  useLayoutEffect(() => {
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
  }, [editorSections, isLargeFormEditor, setCollapsedSectionIds]);

  const collapsedSectionIdSet = useMemo(
    () => new Set(collapsedSectionIds),
    [collapsedSectionIds],
  );

  // --- Section collapse/expand handlers ---

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

  // --- Render helpers ---

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

  // --- JSX ---

  return (
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
  );
}
