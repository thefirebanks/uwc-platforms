"use client";

import React from "react";
import { FieldHint } from "@/components/field-hint";
import {
  RUBRIC_KIND_OPTIONS,
  RUBRIC_OUTCOME_OPTIONS,
  type RubricEditorMode,
} from "./stage-config-editor-types";
import {
  parseCommaSeparatedList,
  formatCommaSeparatedList,
  parseCommaSeparatedNumbers,
  createDefaultRubricCriterion,
} from "./stage-config-editor-utils";
import type {
  CycleStageTemplate,
  EligibilityRubricConfig,
  EligibilityRubricCriterion,
  RubricBlueprintV1,
  RubricMeta,
  StageCode,
} from "@/types/domain";
import type { UwcStageOnePresetDraft } from "@/lib/rubric/default-rubric-presets";

export interface StageSettingsPanelProps {
  // Component props (from parent)
  stageCode: StageCode;
  stageId: string;
  stageTemplates: CycleStageTemplate[];

  // State variables + setters
  settingsStageName: string;
  setSettingsStageName: (v: string) => void;
  settingsDescription: string;
  setSettingsDescription: (v: string) => void;
  settingsOpenDate: string;
  setSettingsOpenDate: (v: string) => void;
  settingsCloseDate: string;
  setSettingsCloseDate: (v: string) => void;
  previousStageRequirement: string;
  setPreviousStageRequirement: (v: string) => void;
  blockIfPreviousNotMet: boolean;
  setBlockIfPreviousNotMet: (v: boolean) => void;
  rubricEditorMode: RubricEditorMode;
  newRubricCriterionKind: EligibilityRubricCriterion["kind"];
  setNewRubricCriterionKind: (v: EligibilityRubricCriterion["kind"]) => void;
  collapsedCriteria: Set<number>;
  settingsEligibilityRubricDraft: EligibilityRubricConfig;
  settingsEligibilityRubricJson: string;
  settingsEligibilityRubricErrors: string[];
  uwcPresetDraft: UwcStageOnePresetDraft;
  setUwcPresetDraft: React.Dispatch<
    React.SetStateAction<UwcStageOnePresetDraft>
  >;
  rubricFeedback: { type: "success" | "error"; message: string } | null;

  // Derived/memoized values
  suggestedUwcPresetDraft: UwcStageOnePresetDraft;
  rubricFieldOptions: Array<{ value: string; label: string }>;
  rubricFileFieldOptions: Array<{ value: string; label: string }>;
  rubricNumberFieldOptions: Array<{ value: string; label: string }>;
  defaultRubricFieldKey: string;
  defaultRubricFileKey: string;
  defaultRubricNumberFieldKey: string;

  // Handler functions
  togglePresetFileKey: (
    listKey: "idDocumentFileKeys" | "gradesDocumentFileKeys",
    fieldKey: string,
  ) => void;
  applyUwcPeruTemplate: () => void;
  syncGuidedRubricDraft: (
    nextDraft: EligibilityRubricConfig,
    options?: { source?: RubricMeta["source"]; blueprint?: RubricBlueprintV1 | null },
  ) => void;
  handleRubricModeChange: (nextMode: RubricEditorMode) => void;
  validateRubricFromEditor: () => void;
  handleRubricJsonInputChange: (nextJson: string) => void;
  updateGuidedRubricCriterion: (
    criterionIndex: number,
    updater: (
      criterion: EligibilityRubricCriterion,
    ) => EligibilityRubricCriterion,
  ) => void;
  removeGuidedRubricCriterion: (criterionIndex: number) => void;
  moveGuidedRubricCriterion: (
    criterionIndex: number,
    direction: "up" | "down",
  ) => void;
  toggleCriterionCollapsed: (criterionIndex: number) => void;
  addGuidedRubricCriterion: (
    kind: EligibilityRubricCriterion["kind"],
  ) => void;
}

export function StageSettingsPanel({
  stageCode,
  stageId,
  stageTemplates,
  settingsStageName,
  setSettingsStageName,
  settingsDescription,
  setSettingsDescription,
  settingsOpenDate,
  setSettingsOpenDate,
  settingsCloseDate,
  setSettingsCloseDate,
  previousStageRequirement,
  setPreviousStageRequirement,
  blockIfPreviousNotMet,
  setBlockIfPreviousNotMet,
  rubricEditorMode,
  newRubricCriterionKind,
  setNewRubricCriterionKind,
  collapsedCriteria,
  settingsEligibilityRubricDraft,
  settingsEligibilityRubricJson,
  settingsEligibilityRubricErrors,
  uwcPresetDraft,
  setUwcPresetDraft,
  rubricFeedback,
  suggestedUwcPresetDraft,
  rubricFieldOptions,
  rubricFileFieldOptions,
  rubricNumberFieldOptions,
  defaultRubricFieldKey,
  defaultRubricFileKey,
  defaultRubricNumberFieldKey,
  togglePresetFileKey,
  applyUwcPeruTemplate,
  syncGuidedRubricDraft,
  handleRubricModeChange,
  validateRubricFromEditor,
  handleRubricJsonInputChange,
  updateGuidedRubricCriterion,
  removeGuidedRubricCriterion,
  moveGuidedRubricCriterion,
  toggleCriterionCollapsed,
  addGuidedRubricCriterion,
}: StageSettingsPanelProps) {
  return (
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
  );
}
