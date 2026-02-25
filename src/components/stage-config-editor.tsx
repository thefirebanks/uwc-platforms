"use client";

import Link from "next/link";
import { useMemo, useState, type DragEvent } from "react";
import type { CycleStageField, StageAutomationTemplate, StageCode } from "@/types/domain";
import { ErrorCallout } from "@/components/error-callout";
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

function mapFieldsWithLocalId(fields: CycleStageField[]) {
  return fields.map((field) => ({
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

export function StageConfigEditor({
  cycleId,
  cycleName,
  stageCode,
  stageLabel,
  initialFields,
  initialAutomations,
  initialOcrPromptTemplate,
}: {
  cycleId: string;
  cycleName: string;
  stageCode: StageCode;
  stageLabel: string;
  initialFields: CycleStageField[];
  initialAutomations: StageAutomationTemplate[];
  initialOcrPromptTemplate: string | null;
}) {
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
    initialOcrPromptTemplate ??
      "Analiza el documento y entrega una validación preliminar para comité. Resume hallazgos clave sobre legibilidad, coherencia y posibles señales de alteración.",
  );

  const orderedFields = useMemo(
    () => [...fields].sort((a, b) => a.sort_order - b.sort_order),
    [fields],
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

  function insertFieldAt(position: number) {
    const safePosition = Math.max(0, Math.min(position, orderedFields.length));
    const nextIndex = orderedFields.length + 1;
    const nextFields = [
      ...orderedFields.slice(0, safePosition),
      createNewField(nextIndex),
      ...orderedFields.slice(safePosition),
    ];

    applyOrderedFields(nextFields);
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
      const response = await fetch(`/api/cycles/${cycleId}/stages/${stageCode}/config`, {
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
        }),
      });
      const body = await response.json();

      if (!response.ok) {
        setError(body);
        return;
      }

      setFields(mapFieldsWithLocalId(body.fields ?? []));
      setAutomations(mapAutomationsWithLocalId(body.automations ?? []));
      setOcrPromptTemplate(body.ocrPromptTemplate ?? "");
      setStatusMessage("Configuración de etapa guardada.");
    } finally {
      setIsSaving(false);
    }
  }

  const [activeTab, setActiveTab] = useState<"editor" | "comms">("editor");
  const [activeFieldId, setActiveFieldId] = useState<string | null>(null);

  return (
    <div id="view-process" className="view active" style={{ flex: 1, width: "100%" }}>
      {/* Contextual Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header" style={{ cursor: "pointer" }}>
          <Link href={`/admin/process/${cycleId}`} style={{ textDecoration: "none" }}>
            <div className="eyebrow" style={{ color: "var(--maroon)", display: "flex", alignItems: "center", gap: "4px" }}>
              ← Volver a procesos
            </div>
          </Link>
          <h2 style={{ marginTop: "8px" }}>{cycleName}</h2>
        </div>
        
        <div className="sidebar-nav">
          <div className="builder-section-title" style={{ padding: "0 20px", marginBottom: "8px", marginTop: "8px" }}>
            Etapas del Proceso
          </div>
          <button className="stage-item active">
            <div className="stage-icon">1</div>
            <div className="stage-info">
              <div className="stage-title">{stageLabel}</div>
              <div className="stage-type">Formulario</div>
            </div>
          </button>
        </div>
      </aside>

      {/* Main Workspace */}
      <main className="main">
        <div className="canvas-header">
          {error && <ErrorCallout message={error.message} errorId={error.errorId} context="stage_config" />}
          {statusMessage && (
            <div style={{ padding: "16px", borderRadius: "8px", backgroundColor: "#DCFCE7", color: "#166534", marginBottom: "16px" }}>
              {statusMessage}
            </div>
          )}
          <div className="stage-status">Etapa Activa</div>
          <div className="canvas-title-row">
            <div>
              <h1>{stageLabel}</h1>
              <p>Configura la captura de datos de esta etapa, reglas de acceso y notificaciones.</p>
            </div>
            <button
              className="btn btn-primary"
              onClick={saveStageConfig}
              disabled={isSaving}
            >
              Guardar configuración
            </button>
          </div>

          <div className="page-tabs">
            <button
              className={`page-tab ${activeTab === "editor" ? "active" : ""}`}
              onClick={() => setActiveTab("editor")}
            >
              Editor de Formulario
            </button>
            <button
              className={`page-tab ${activeTab === "comms" ? "active" : ""}`}
              onClick={() => setActiveTab("comms")}
            >
              Comunicaciones y OCR
            </button>
          </div>
        </div>

        <div className="canvas-body">
          {activeTab === "editor" && (
            <div id="tab-editor" className="tab-content active">
              <div className="builder-section-title">Campos requeridos</div>
              
              <div className="field-list">
                {orderedFields.map((field, index) => {
                  const isEditing = activeFieldId === field.localId;

                  return (
                    <div key={field.localId}>
                      <button
                        className="add-field-btn"
                        style={{ margin: "8px 0", padding: "8px", border: "1px dashed var(--sand)", background: "transparent" }}
                        onClick={() => insertFieldAt(index)}
                      >
                        Agregar campo en posición {index + 1}
                      </button>

                      <div
                        className={`field-card ${isEditing ? "editing" : ""}`}
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
                        style={{
                           borderColor: dragOverFieldId === field.localId ? "var(--uwc-maroon)" : undefined,
                           backgroundColor: draggedFieldId === field.localId ? "var(--cream)" : undefined,
                        }}
                      >
                        <div
                          className="field-header"
                          onClick={() => setActiveFieldId(isEditing ? null : field.localId)}
                        >
                          <div className="drag-handle" style={{ cursor: draggedFieldId === field.localId ? "grabbing" : "grab" }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/></svg>
                          </div>
                          <div className="field-icon">
                            {field.field_type === "short_text" ? "T" : 
                             field.field_type === "long_text" ? "T≡" :
                             field.field_type === "number" ? "#" :
                             field.field_type === "date" ? "📅" :
                             field.field_type === "email" ? "@" : "📄"}
                          </div>
                          <div className="field-details">
                            <div className="field-name">
                              {field.field_label} {field.is_required && <span className="req-star">*</span>}
                              {isEditing && <span className="editing-badge">Editando</span>}
                            </div>
                            <div className="field-type">
                              {field.field_type} • id: <code>{field.field_key}</code>
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
                          <div className="field-editor" style={{ display: "block" }}>
                            <div className="editor-grid">
                              <div className="form-field full">
                                <label htmlFor={`title-${field.localId}`}>Título</label>
                                <input
                                  id={`title-${field.localId}`}
                                  type="text"
                                  value={field.field_label}
                                  onChange={(event) => {
                                    const value = event.target.value;
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
                                  onChange={(event) =>
                                    setFields((current) =>
                                      current.map((item) =>
                                        item.localId === field.localId
                                          ? {
                                              ...item,
                                              field_key: normalizeFieldKey(event.target.value),
                                            }
                                          : item,
                                      ),
                                    )
                                  }
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
                            <div style={{ marginTop: "24px", paddingTop: "24px", borderTop: "1px solid var(--sand-light)", display: "flex", justifyContent: "flex-end", gap: "12px" }}>
                              <button
                                className="btn btn-primary"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveFieldId(null);
                                }}
                              >
                                Listo
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                <button
                  className="add-field-btn"
                  onClick={() => insertFieldAt(orderedFields.length)}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: "8px" }}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Agregar campo al final
                </button>
              </div>
            </div>
          )}

          {activeTab === "comms" && (
            <div id="tab-comms" className="tab-content active">
              <div className="builder-section-title">Automatizaciones de correo</div>
              <div style={{ marginBottom: "24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <p style={{ fontSize: "0.85rem", color: "var(--muted)" }}>Define plantillas por evento. Mantén solo las necesarias.</p>
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
        </div>
      </main>
    </div>
  );
}
