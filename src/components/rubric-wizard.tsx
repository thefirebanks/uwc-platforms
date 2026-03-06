"use client";

import { useMemo, useState } from "react";
import type { UwcStageOnePresetDraft } from "@/lib/rubric/default-rubric-presets";
import {
  buildRubricChecklistItems,
  classifyOcrOption,
  type RubricChecklistItem,
  type RubricChecklistItemId,
  type RubricOcrOptionKind,
} from "@/lib/rubric/wizard-review";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RubricWizardStep = 1 | 2 | 3;

export type RubricOcrPathOption = {
  value: string;
  label: string;
  fieldLabel: string;
  fieldKey: string;
  kind: RubricOcrOptionKind;
};

type FieldOption = { value: string; label: string };

type RubricOcrSlotKey =
  | "ocrNamePath"
  | "ocrBirthYearPath"
  | "ocrDocumentTypePath"
  | "ocrDocumentIssuePath";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WIZARD_OCR_SLOTS: Array<{
  key: RubricOcrSlotKey;
  label: string;
  warningLabel: string;
}> = [
  { key: "ocrNamePath", label: "Nombre en documento", warningLabel: "nombre en documento" },
  { key: "ocrBirthYearPath", label: "Año de nacimiento", warningLabel: "año de nacimiento" },
  { key: "ocrDocumentTypePath", label: "Tipo de documento", warningLabel: "tipo de documento" },
  { key: "ocrDocumentIssuePath", label: "Excepción de documento", warningLabel: "excepción de documento" },
];

const RECOMMENDATION_POLICY_OPTIONS: Array<{
  value: UwcStageOnePresetDraft["recommendationCompleteness"];
  label: string;
  description: string;
}> = [
  {
    value: "strict_form_valid",
    label: "Formulario completo validado",
    description: "Solo cuenta si la recomendación fue enviada por el flujo oficial.",
  },
  {
    value: "minimum_answers",
    label: "Mínimo de respuestas",
    description: "Cuenta cuando se cumple un mínimo de respuestas no vacías.",
  },
];

const GRADES_COMBINATION_POLICY_OPTIONS: Array<{
  value: UwcStageOnePresetDraft["gradesCombinationRule"];
  label: string;
}> = [
  { value: "single_or_review", label: "Varios certificados → revisión manual" },
  { value: "single_or_not_eligible", label: "Varios certificados → no elegible" },
  { value: "allow_multiple", label: "Permitir varios certificados" },
];

const ID_EXCEPTION_POLICY_OPTIONS: Array<{
  value: UwcStageOnePresetDraft["idExceptionRule"];
  label: string;
}> = [
  { value: "review", label: "Excepción → revisión manual" },
  { value: "not_eligible", label: "Excepción → no elegible" },
];

const CHECKLIST_STATUS_LABEL: Record<RubricChecklistItem["status"], string> = {
  ok: "Listo",
  missing: "Falta",
  review: "Revisar",
};

function parseCommaSeparatedNumbers(raw: string) {
  const seen = new Set<number>();
  const values: number[] = [];
  for (const candidate of raw.split(/[,\s;]+/)) {
    const trimmed = candidate.trim();
    if (!trimmed) continue;
    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed) || seen.has(parsed)) continue;
    seen.add(parsed);
    values.push(parsed);
  }
  return values;
}

/** Strip the parenthesized field key from labels like "Nombre completo (fullName)" */
function cleanLabel(label: string): string {
  return label.replace(/\s*\([^)]+\)\s*$/, "").trim();
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface RubricWizardProps {
  stageCode: string;
  draft: UwcStageOnePresetDraft;
  onDraftChange: (next: UwcStageOnePresetDraft) => void;

  /** Validation from parent (step1/step2 errors, blueprint availability) */
  validation: {
    step1Errors: string[];
    step1Warnings: string[];
    step2Errors: string[];
    hasBlueprint: boolean;
    compilerErrors: string[];
  };

  /** Field option lists derived from the form schema */
  fieldOptions: FieldOption[];
  fileFieldOptions: FieldOption[];
  numberFieldOptions: FieldOption[];
  ocrPathOptions: RubricOcrPathOption[];

  /** Whether the advanced mode has diverged from the wizard */
  advancedCustomized: boolean;

  /** Callbacks */
  onActivate: () => void;
  onResetSuggestions: () => void;
  onEditOcrFields: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RubricWizard({
  stageCode,
  draft,
  onDraftChange,
  validation,
  fieldOptions,
  fileFieldOptions,
  numberFieldOptions,
  ocrPathOptions,
  advancedCustomized,
  onActivate,
  onResetSuggestions,
  onEditOcrFields,
}: RubricWizardProps) {
  const [step, setStep] = useState<RubricWizardStep>(1);
  const [reviewDetailOpenById, setReviewDetailOpenById] = useState<
    Partial<Record<RubricChecklistItemId, boolean>>
  >({});
  const [birthYearsInput, setBirthYearsInput] = useState(
    draft.allowedBirthYears.join(", "),
  );
  const [ocrExpanded, setOcrExpanded] = useState(false);

  // Derived blocking errors — no effect needed
  const blockingErrors = useMemo(() => {
    if (step === 1) return validation.step1Errors;
    if (step === 2) return validation.step2Errors;
    return [];
  }, [step, validation.step1Errors, validation.step2Errors]);

  // Track previously-seen birth years to detect external changes (e.g. reset suggestions).
  // Uses React's "storing info from previous renders" pattern with state instead of a ref.
  const [prevBirthYears, setPrevBirthYears] = useState(draft.allowedBirthYears);
  if (prevBirthYears !== draft.allowedBirthYears) {
    setPrevBirthYears(draft.allowedBirthYears);
    const parsed = parseCommaSeparatedNumbers(birthYearsInput);
    const hasSameValues =
      parsed.length === draft.allowedBirthYears.length &&
      parsed.every((v, i) => v === draft.allowedBirthYears[i]);
    if (!hasSameValues) {
      setBirthYearsInput(draft.allowedBirthYears.join(", "));
    }
  }

  // Clean labels (strip field key suffixes)
  const cleanFileOptions = useMemo(
    () => fileFieldOptions.map((o) => ({ value: o.value, label: cleanLabel(o.label) })),
    [fileFieldOptions],
  );
  const cleanFieldOptions = useMemo(
    () => fieldOptions.map((o) => ({ value: o.value, label: cleanLabel(o.label) })),
    [fieldOptions],
  );
  const cleanNumberOptions = useMemo(
    () => numberFieldOptions.map((o) => ({ value: o.value, label: cleanLabel(o.label) })),
    [numberFieldOptions],
  );

  // OCR option lookup
  const ocrOptionByValue = useMemo(
    () => new Map(ocrPathOptions.map((o) => [o.value, o] as const)),
    [ocrPathOptions],
  );

  // -- Helpers --

  function toggleFileKey(
    listKey: "idDocumentFileKeys" | "gradesDocumentFileKeys",
    fieldKey: string,
  ) {
    const currentValues = draft[listKey];
    const exists = currentValues.includes(fieldKey);
    onDraftChange({
      ...draft,
      [listKey]: exists
        ? currentValues.filter((v) => v !== fieldKey)
        : [...currentValues, fieldKey],
    });
  }

  function updateBirthYearsInput(rawValue: string) {
    setBirthYearsInput(rawValue);
    onDraftChange({
      ...draft,
      allowedBirthYears: parseCommaSeparatedNumbers(rawValue),
    });
  }

  function adjustMinAverage(delta: number) {
    const nextValue = Math.min(
      20,
      Math.max(0, Number((draft.minAverageGrade + delta).toFixed(1))),
    );
    onDraftChange({ ...draft, minAverageGrade: nextValue });
  }

  function setOcrPath(slotKey: RubricOcrSlotKey, value: string) {
    onDraftChange({ ...draft, [slotKey]: value });
  }

  function buildOcrDropdownOptions(currentPath: string) {
    if (!currentPath.trim()) return ocrPathOptions;
    if (ocrPathOptions.some((o) => o.value === currentPath.trim())) return ocrPathOptions;
    return [
      {
        value: currentPath.trim(),
        label: `${currentPath.trim()} (actual)`,
        fieldLabel: "Configuración actual",
        fieldKey: "custom",
        kind: classifyOcrOption(currentPath.trim()),
      },
      ...ocrPathOptions,
    ];
  }

  function moveToNextStep() {
    const currentStepErrors =
      step === 1
        ? validation.step1Errors
        : step === 2
          ? validation.step2Errors
          : [];

    if (currentStepErrors.length > 0) return;
    setStep((s) => (s === 1 ? 2 : 3) as RubricWizardStep);
  }

  function moveToPreviousStep() {
    setReviewDetailOpenById({});
    setStep((s) => (s === 3 ? 2 : 1) as RubricWizardStep);
  }

  function toggleReviewDetail(itemId: RubricChecklistItemId) {
    setReviewDetailOpenById((current) => ({
      ...current,
      [itemId]: !current[itemId],
    }));
  }

  // -- Review summary (step 3) --

  const reviewSummary = useMemo(() => {
    const formatFileList = (keys: string[]) =>
      keys.length > 0
        ? keys
            .map((key) => {
              const opt = cleanFileOptions.find((o) => o.value === key);
              return opt ? opt.label : key;
            })
            .join(", ")
        : "—";
    const formatSingleFile = (key: string | null) =>
      key
        ? (cleanFileOptions.find((o) => o.value === key)?.label ?? key)
        : "—";
    const formatField = (key: string | null) =>
      key
        ? (cleanFieldOptions.find((o) => o.value === key)?.label ?? key)
        : "—";

    const gradePolicyLabel =
      GRADES_COMBINATION_POLICY_OPTIONS.find(
        (o) => o.value === draft.gradesCombinationRule,
      )?.label ?? draft.gradesCombinationRule;
    const idExceptionPolicyLabel =
      ID_EXCEPTION_POLICY_OPTIONS.find(
        (o) => o.value === draft.idExceptionRule,
      )?.label ?? draft.idExceptionRule;
    const recommendationPolicyLabel =
      RECOMMENDATION_POLICY_OPTIONS.find(
        (o) => o.value === draft.recommendationCompleteness,
      )?.label ?? draft.recommendationCompleteness;

    const availableOcrFieldSet = new Set(ocrPathOptions.map((o) => o.value));

    const ocrMappings = WIZARD_OCR_SLOTS.map((slot) => {
      const path = draft[slot.key].trim();
      const option = path ? ocrOptionByValue.get(path) : null;
      const kind = option?.kind ?? classifyOcrOption(path);
      return {
        id: slot.key,
        label: slot.label,
        path,
        value: path || "—",
        kind,
        source: option?.fieldLabel ?? "Configuración actual",
        isMissing:
          !path ||
          (availableOcrFieldSet.size > 0 && !availableOcrFieldSet.has(path)),
      };
    });

    const technicalOcrMappings = ocrMappings.filter(
      (m) => !m.isMissing && m.kind === "technical",
    );

    const evidenceMissingCount = [
      draft.idDocumentFileKeys.length === 0,
      draft.gradesDocumentFileKeys.length === 0,
      !draft.applicantNameFieldKey,
      !draft.averageGradeFieldKey,
      !draft.signedAuthorizationFileKey,
      !draft.applicantPhotoFileKey,
    ].filter(Boolean).length;

    const minAverageValid =
      Number.isFinite(draft.minAverageGrade) &&
      draft.minAverageGrade >= 0 &&
      draft.minAverageGrade <= 20;
    const minRecommendationValid =
      draft.recommendationCompleteness !== "minimum_answers" ||
      (Number.isInteger(draft.minRecommendationResponses) &&
        draft.minRecommendationResponses >= 1 &&
        draft.minRecommendationResponses <= 20);

    const policyMissingCount = [
      draft.allowedBirthYears.length === 0,
      !minAverageValid,
      !minRecommendationValid,
    ].filter(Boolean).length;
    const ocrMissingCount = ocrMappings.filter((m) => m.isMissing).length;

    const checklistItems = buildRubricChecklistItems({
      evidenceMissingCount,
      ocrMissingCount,
      policyMissingCount,
      hasTechnicalOcrSelection: technicalOcrMappings.length > 0,
    });

    return {
      evidenceRows: [
        { label: "Documentos de identidad", value: formatFileList(draft.idDocumentFileKeys) },
        { label: "Documentos de notas", value: formatFileList(draft.gradesDocumentFileKeys) },
        { label: "Nombre del postulante", value: formatField(draft.applicantNameFieldKey) },
        { label: "Promedio manual", value: formatField(draft.averageGradeFieldKey) },
        { label: "Tercio superior", value: formatSingleFile(draft.topThirdProofFileKey) },
        { label: "Autorización firmada", value: formatSingleFile(draft.signedAuthorizationFileKey) },
        { label: "Foto del postulante", value: formatSingleFile(draft.applicantPhotoFileKey) },
      ],
      ocrRows: ocrMappings,
      policyRows: [
        {
          label: "Años de nacimiento",
          value:
            draft.allowedBirthYears.length > 0
              ? draft.allowedBirthYears.join(", ")
              : "—",
        },
        {
          label: "Promedio mínimo",
          value: draft.minAverageGrade.toFixed(1).replace(/\.0$/, ""),
        },
        {
          label: "Recomendaciones",
          value: `${recommendationPolicyLabel}${
            draft.recommendationCompleteness === "minimum_answers"
              ? ` (mín. ${Math.max(0, Math.trunc(draft.minRecommendationResponses))})`
              : ""
          }`,
        },
        { label: "Múltiples certificados", value: gradePolicyLabel },
        { label: "Excepciones de identidad", value: idExceptionPolicyLabel },
      ],
      availableOcrFields: ocrPathOptions,
      checklistItems,
    };
  }, [draft, cleanFileOptions, cleanFieldOptions, ocrOptionByValue, ocrPathOptions]);

  const checklistHasMissing = reviewSummary.checklistItems.some(
    (item) => item.status === "missing",
  );
  const checklistHasReview = reviewSummary.checklistItems.some(
    (item) => item.status === "review",
  );

  // -- Count configured OCR fields --
  const ocrConfiguredCount = WIZARD_OCR_SLOTS.filter(
    (slot) => draft[slot.key].trim().length > 0,
  ).length;

  // -- Render --

  return (
    <div className="rw-shell">
      {advancedCustomized && (
        <div className="admin-feedback warning" style={{ marginBottom: "10px" }}>
          Esta etapa fue personalizada fuera del asistente. Puedes configurar aquí para restablecer.
        </div>
      )}

      {/* Step indicators */}
      <div className="rw-steps">
        {[
          { num: 1, label: "Evidencia" },
          { num: 2, label: "Políticas" },
          { num: 3, label: "Activar" },
        ].map(({ num, label }) => (
          <button
            key={num}
            type="button"
            className={`rw-step-btn ${step === num ? "is-active" : ""} ${
              num < step ? "is-done" : ""
            }`}
            onClick={() => {
              if (num < step) {
                setReviewDetailOpenById({});
                setStep(num as RubricWizardStep);
              }
            }}
            disabled={num > step}
          >
            <span className="rw-step-num">{num < step ? "✓" : num}</span>
            {label}
          </button>
        ))}
      </div>

      {/* ────── Step 1: Evidence mapping ────── */}
      {step === 1 && (
        <div className="rw-card" data-wizard-step="1">
          <div className="rw-card-header">
            <h3>Mapear evidencia</h3>
            <p>Selecciona los campos del formulario que usa la rúbrica.</p>
          </div>

          <div className="rw-grid">
            {/* Identity documents */}
            <div className="rw-field rw-field--full">
              <label>Documentos de identidad</label>
              <div className="rw-pill-grid">
                {cleanFileOptions.length > 0 ? (
                  cleanFileOptions.map((option) => (
                    <label
                      key={`rw-id-${option.value}`}
                      className="rw-pill"
                    >
                      <input
                        type="checkbox"
                        checked={draft.idDocumentFileKeys.includes(option.value)}
                        onChange={() =>
                          toggleFileKey("idDocumentFileKeys", option.value)
                        }
                      />
                      {option.label}
                    </label>
                  ))
                ) : (
                  <span className="rw-hint">
                    No hay campos de archivo en el formulario.
                  </span>
                )}
              </div>
            </div>

            {/* Grade documents */}
            <div className="rw-field rw-field--full">
              <label>Documentos de notas</label>
              <div className="rw-pill-grid">
                {cleanFileOptions.length > 0 ? (
                  cleanFileOptions.map((option) => (
                    <label
                      key={`rw-grades-${option.value}`}
                      className="rw-pill"
                    >
                      <input
                        type="checkbox"
                        checked={draft.gradesDocumentFileKeys.includes(option.value)}
                        onChange={() =>
                          toggleFileKey("gradesDocumentFileKeys", option.value)
                        }
                      />
                      {option.label}
                    </label>
                  ))
                ) : (
                  <span className="rw-hint">
                    No hay campos de archivo en el formulario.
                  </span>
                )}
              </div>
            </div>

            {/* Dropdowns in 2-column grid */}
            <div className="rw-field">
              <label htmlFor={`wizard-name-${stageCode}`}>Nombre del postulante</label>
              <select
                id={`wizard-name-${stageCode}`}
                value={draft.applicantNameFieldKey ?? ""}
                onChange={(e) =>
                  onDraftChange({
                    ...draft,
                    applicantNameFieldKey: e.target.value || null,
                  })
                }
              >
                <option value="">Selecciona un campo</option>
                {cleanFieldOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="rw-field">
              <label htmlFor={`wizard-average-${stageCode}`}>Promedio de notas</label>
              <select
                id={`wizard-average-${stageCode}`}
                value={draft.averageGradeFieldKey ?? ""}
                onChange={(e) =>
                  onDraftChange({
                    ...draft,
                    averageGradeFieldKey: e.target.value || null,
                  })
                }
              >
                <option value="">Selecciona un campo numérico</option>
                {cleanNumberOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="rw-field">
              <label htmlFor={`wizard-authorization-${stageCode}`}>Autorización firmada</label>
              <select
                id={`wizard-authorization-${stageCode}`}
                value={draft.signedAuthorizationFileKey ?? ""}
                onChange={(e) =>
                  onDraftChange({
                    ...draft,
                    signedAuthorizationFileKey: e.target.value || null,
                  })
                }
              >
                <option value="">Selecciona un campo</option>
                {cleanFileOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="rw-field">
              <label htmlFor={`wizard-photo-${stageCode}`}>Foto del postulante</label>
              <select
                id={`wizard-photo-${stageCode}`}
                value={draft.applicantPhotoFileKey ?? ""}
                onChange={(e) =>
                  onDraftChange({
                    ...draft,
                    applicantPhotoFileKey: e.target.value || null,
                  })
                }
              >
                <option value="">Selecciona un campo</option>
                {cleanFileOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="rw-field">
              <label htmlFor={`wizard-top-third-${stageCode}`}>
                Tercio superior <span className="rw-optional">Opcional</span>
              </label>
              <select
                id={`wizard-top-third-${stageCode}`}
                value={draft.topThirdProofFileKey ?? ""}
                onChange={(e) =>
                  onDraftChange({
                    ...draft,
                    topThirdProofFileKey: e.target.value || null,
                  })
                }
              >
                <option value="">Sin archivo dedicado</option>
                {cleanFileOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            {/* OCR Section - collapsible */}
            <div className="rw-field rw-field--full">
              <button
                type="button"
                className="rw-ocr-toggle"
                onClick={() => setOcrExpanded((v) => !v)}
                aria-expanded={ocrExpanded}
              >
                <span className="rw-ocr-toggle-label">
                  Verificación OCR
                  <span className="rw-ocr-toggle-count">
                    {ocrConfiguredCount}/{WIZARD_OCR_SLOTS.length} campos
                  </span>
                </span>
                <span className={`rw-chevron ${ocrExpanded ? "is-open" : ""}`}>▸</span>
              </button>

              {ocrExpanded && (
                <div className="rw-ocr-panel">
                  <div className="rw-ocr-header">
                    <p className="rw-hint">
                      Los campos provienen de Parsing con IA en los documentos de identidad.
                    </p>
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={onEditOcrFields}
                    >
                      Editar campos OCR
                    </button>
                  </div>

                  <div className="rw-ocr-slots">
                    {WIZARD_OCR_SLOTS.map((slot) => {
                      const currentPath = draft[slot.key].trim();
                      const selectedOption = currentPath
                        ? ocrOptionByValue.get(currentPath)
                        : null;
                      const selectedKind = currentPath
                        ? selectedOption?.kind ?? classifyOcrOption(currentPath)
                        : null;

                      return (
                        <div key={slot.key} className="rw-ocr-slot">
                          <label htmlFor={`wizard-ocr-${slot.key}-${stageCode}`}>
                            {slot.label}
                            {selectedKind && (
                              <span
                                className={`rw-tag ${
                                  selectedKind === "technical"
                                    ? "rw-tag--warn"
                                    : "rw-tag--ok"
                                }`}
                              >
                                {selectedKind === "technical" ? "Técnico" : "Dato"}
                              </span>
                            )}
                          </label>
                          <select
                            id={`wizard-ocr-${slot.key}-${stageCode}`}
                            value={draft[slot.key]}
                            onChange={(e) => setOcrPath(slot.key, e.target.value)}
                          >
                            <option value="">Selecciona un campo</option>
                            {buildOcrDropdownOptions(currentPath).map((o) => (
                              <option key={`${slot.key}-${o.value}`} value={o.value}>
                                {o.value}
                              </option>
                            ))}
                          </select>
                          {selectedKind === "technical" && (
                            <span className="rw-inline-warn">
                              Confirma que este campo técnico representa {slot.warningLabel}.
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {ocrPathOptions.length === 0 && (
                    <p className="rw-hint">
                      Activa Parsing con IA en un documento de identidad para ver opciones.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ────── Step 2: Policies ────── */}
      {step === 2 && (
        <div className="rw-card" data-wizard-step="2">
          <div className="rw-card-header">
            <h3>Definir políticas</h3>
            <p>Configura umbrales y reglas de decisión.</p>
          </div>

          <div className="rw-policy-sections">
            {/* Thresholds */}
            <section className="rw-policy-section">
              <h4>Umbrales</h4>
              <div className="rw-policy-row">
                <label htmlFor={`wizard-birth-years-${stageCode}`}>
                  Años de nacimiento permitidos
                </label>
                <input
                  id={`wizard-birth-years-${stageCode}`}
                  type="text"
                  value={birthYearsInput}
                  placeholder="2008, 2009, 2010"
                  onChange={(e) => updateBirthYearsInput(e.target.value)}
                />
              </div>
              <div className="rw-policy-row">
                <label htmlFor={`wizard-min-average-${stageCode}`}>
                  Promedio mínimo (0–20)
                </label>
                <div className="rw-stepper">
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => adjustMinAverage(-0.1)}
                    aria-label="Disminuir promedio mínimo"
                  >
                    −
                  </button>
                  <input
                    id={`wizard-min-average-${stageCode}`}
                    className="rw-stepper-input"
                    type="number"
                    min={0}
                    max={20}
                    step={0.1}
                    value={String(draft.minAverageGrade)}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      onDraftChange({
                        ...draft,
                        minAverageGrade: Number.isFinite(v)
                          ? Math.min(20, Math.max(0, v))
                          : 0,
                      });
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => adjustMinAverage(0.1)}
                    aria-label="Aumentar promedio mínimo"
                  >
                    +
                  </button>
                </div>
              </div>
            </section>

            {/* Recommendations */}
            <section className="rw-policy-section">
              <h4>Recomendaciones</h4>
              <div className="rw-policy-row">
                <label htmlFor={`wizard-recommendation-policy-${stageCode}`}>
                  Política de completitud
                </label>
                <select
                  id={`wizard-recommendation-policy-${stageCode}`}
                  value={draft.recommendationCompleteness}
                  onChange={(e) =>
                    onDraftChange({
                      ...draft,
                      recommendationCompleteness:
                        e.target.value as UwcStageOnePresetDraft["recommendationCompleteness"],
                      minRecommendationResponses:
                        e.target.value === "minimum_answers"
                          ? Math.max(1, draft.minRecommendationResponses)
                          : draft.minRecommendationResponses,
                    })
                  }
                >
                  {RECOMMENDATION_POLICY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <span className="rw-hint">
                  {RECOMMENDATION_POLICY_OPTIONS.find(
                    (o) => o.value === draft.recommendationCompleteness,
                  )?.description}
                </span>
              </div>
              {draft.recommendationCompleteness === "minimum_answers" && (
                <div className="rw-policy-row">
                  <label htmlFor={`wizard-recommendation-min-${stageCode}`}>
                    Respuestas mínimas por recomendación
                  </label>
                  <input
                    id={`wizard-recommendation-min-${stageCode}`}
                    type="number"
                    min={1}
                    max={20}
                    step={1}
                    value={String(draft.minRecommendationResponses)}
                    onChange={(e) =>
                      onDraftChange({
                        ...draft,
                        minRecommendationResponses: Math.max(
                          0,
                          Math.trunc(Number(e.target.value) || 0),
                        ),
                      })
                    }
                  />
                </div>
              )}
            </section>

            {/* Document exceptions */}
            <section className="rw-policy-section">
              <h4>Excepciones</h4>
              <div className="rw-policy-row">
                <label htmlFor={`wizard-grades-policy-${stageCode}`}>
                  Múltiples certificados de notas
                </label>
                <select
                  id={`wizard-grades-policy-${stageCode}`}
                  value={draft.gradesCombinationRule}
                  onChange={(e) =>
                    onDraftChange({
                      ...draft,
                      gradesCombinationRule:
                        e.target.value as UwcStageOnePresetDraft["gradesCombinationRule"],
                      limitGradesDocumentToSingleUpload:
                        e.target.value !== "allow_multiple",
                    })
                  }
                >
                  {GRADES_COMBINATION_POLICY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="rw-policy-row">
                <label htmlFor={`wizard-id-exception-policy-${stageCode}`}>
                  Excepciones de identidad
                </label>
                <select
                  id={`wizard-id-exception-policy-${stageCode}`}
                  value={draft.idExceptionRule}
                  onChange={(e) =>
                    onDraftChange({
                      ...draft,
                      idExceptionRule:
                        e.target.value as UwcStageOnePresetDraft["idExceptionRule"],
                    })
                  }
                >
                  {ID_EXCEPTION_POLICY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </section>
          </div>
        </div>
      )}

      {/* ────── Step 3: Review & activate ────── */}
      {step === 3 && (
        <div className="rw-card" data-wizard-step="3">
          <div className="rw-card-header">
            <h3>Revisar y activar</h3>
            <p>Confirma que todo esté completo antes de activar.</p>
          </div>

          <div className="rw-checklist">
            {reviewSummary.checklistItems.map((item) => {
              const isOpen = Boolean(reviewDetailOpenById[item.id]);
              return (
                <div
                  key={`rw-check-${item.id}`}
                  className={`rw-check-item is-${item.status}`}
                >
                  <div className="rw-check-row">
                    <div className="rw-check-info">
                      <div className="rw-check-top">
                        <span className="rw-check-label">{item.label}</span>
                        <span className={`rw-check-badge is-${item.status}`}>
                          {CHECKLIST_STATUS_LABEL[item.status]}
                        </span>
                      </div>
                      <p>{item.reason}</p>
                    </div>
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => toggleReviewDetail(item.id)}
                    >
                      {isOpen ? "Ocultar" : "Detalle"}
                    </button>
                  </div>

                  {isOpen && (
                    <div className="rw-check-detail">
                      {item.id === "evidence" && (
                        <div className="rw-detail-table">
                          {reviewSummary.evidenceRows.map((row) => (
                            <div key={row.label} className="rw-detail-row">
                              <span>{row.label}</span>
                              <strong title={row.value}>{row.value}</strong>
                            </div>
                          ))}
                        </div>
                      )}
                      {item.id === "ocr" && (
                        <div className="rw-detail-stack">
                          <div className="rw-detail-table">
                            {reviewSummary.ocrRows.map((row) => (
                              <div key={row.id} className="rw-detail-row">
                                <span>{row.label}</span>
                                <strong title={`${row.value} · ${row.source}`}>
                                  {row.value}
                                </strong>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {item.id === "policies" && (
                        <div className="rw-detail-table">
                          {reviewSummary.policyRows.map((row) => (
                            <div key={row.label} className="rw-detail-row">
                              <span>{row.label}</span>
                              <strong title={row.value}>{row.value}</strong>
                            </div>
                          ))}
                        </div>
                      )}
                      {item.id === "result" && (
                        <div className="rw-outcomes">
                          <div className="rw-outcome rw-outcome--ok">
                            <span>eligible</span>
                            Todo correcto, pasa a la siguiente etapa.
                          </div>
                          <div className="rw-outcome rw-outcome--fail">
                            <span>not_eligible</span>
                            Falla crítica en criterios obligatorios.
                          </div>
                          <div className="rw-outcome rw-outcome--review">
                            <span>needs_review</span>
                            Falta evidencia o hay ambigüedad; requiere revisión humana.
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Step 3 feedback */}
          {checklistHasMissing ? (
            <div className="admin-feedback error">
              Hay elementos pendientes. Completa los marcados como «Falta» antes de activar.
            </div>
          ) : checklistHasReview ? (
            <div className="admin-feedback warning">
              Puedes activar, pero conviene revisar los elementos marcados.
            </div>
          ) : (
            <div className="admin-feedback success">
              Todo listo. La rúbrica está lista para activarse.
            </div>
          )}
        </div>
      )}

      {/* Error banner (all steps) */}
      {blockingErrors.length > 0 && (
        <div className="admin-feedback error">
          {blockingErrors.length <= 3
            ? blockingErrors.map((err, i) => (
                <div key={i} className="rw-error-line">
                  {err}
                </div>
              ))
            : <>
                {blockingErrors.slice(0, 3).map((err, i) => (
                  <div key={i} className="rw-error-line">
                    {err}
                  </div>
                ))}
                <div className="rw-error-line rw-error-more">
                  +{blockingErrors.length - 3} más
                </div>
              </>
          }
        </div>
      )}

      {/* Step 1 warnings (non-blocking, e.g. OCR path mismatch) */}
      {step === 1 && blockingErrors.length === 0 && validation.step1Warnings.length > 0 && (
        <div className="admin-feedback warning">
          {validation.step1Warnings.map((w, i) => (
            <div key={i} className="rw-error-line">{w}</div>
          ))}
        </div>
      )}

      {/* Footer actions */}
      <div className="rw-actions">
        <div className="rw-actions-left">
          {step > 1 && (
            <button
              type="button"
              className="btn btn-outline"
              onClick={moveToPreviousStep}
            >
              Volver
            </button>
          )}
          {step === 1 && (
            <button
              type="button"
              className="btn btn-ghost rw-reset-btn"
              onClick={onResetSuggestions}
            >
              Recargar sugerencias desde campos
            </button>
          )}
        </div>
        <div className="rw-actions-right">
          {step < 3 ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={moveToNextStep}
            >
              Continuar
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={onActivate}
            >
              Activar rúbrica de esta etapa
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
