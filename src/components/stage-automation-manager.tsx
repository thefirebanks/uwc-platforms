"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import type { StageAutomationTemplate } from "@/types/domain";
import { EmailTemplateVariableHintContent } from "@/components/email-template-variable-guide";
import { FieldHint } from "@/components/field-hint";

type EditableAutomation = StageAutomationTemplate & {
  localId: string;
};

interface StageAutomationManagerProps {
  automations: EditableAutomation[];
  setAutomations: Dispatch<SetStateAction<EditableAutomation[]>>;
  cycleId: string;
  stageCode: string;
  onPreviewData: (data: { subject: string; bodyHtml: string }) => void;
  onSwitchToCommunications: () => void;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

/**
 * Manages email automation templates for a stage.
 * Displays a list of automation cards with event, subject, body editing
 * and actions for preview, test send, and deletion.
 */
export function StageAutomationManager({
  automations,
  setAutomations,
  cycleId,
  stageCode,
  onPreviewData,
  onSwitchToCommunications,
}: StageAutomationManagerProps) {
  const [previewLoading, setPreviewLoading] = useState<string | null>(null);
  const [testSendLoading, setTestSendLoading] = useState<string | null>(null);
  const [testSendResult, setTestSendResult] = useState<
    Record<string, "sent" | "error">
  >({});

  function addAutomation() {
    const baseTrigger = automations.some(
      (automation) => automation.trigger_event === "application_submitted",
    )
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

  function removeAutomation(localId: string) {
    setAutomations((current) =>
      current.filter((automation) => automation.localId !== localId),
    );
  }

  async function handlePreviewEmail(automationId: string) {
    if (!automationId || previewLoading) return;
    setPreviewLoading(automationId);
    try {
      const res = await fetch("/api/communications/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ automationTemplateId: automationId }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { subject: string; bodyHtml: string };
      onPreviewData(data);
    } finally {
      setPreviewLoading(null);
    }
  }

  async function handleTestSendEmail(automationId: string) {
    if (!automationId || testSendLoading) return;
    setTestSendLoading(automationId);
    try {
      const res = await fetch("/api/communications/test-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ automationTemplateId: automationId }),
      });
      setTestSendResult((prev) => ({
        ...prev,
        [automationId]: res.ok ? "sent" : "error",
      }));
      setTimeout(() => {
        setTestSendResult((prev) => {
          const next = { ...prev };
          delete next[automationId];
          return next;
        });
      }, 4000);
    } finally {
      setTestSendLoading(null);
    }
  }

  return (
    <div id="tab-automations" className="tab-content active">
      <div className="builder-section-title">
        Automatizaciones de correo
      </div>
      <div className="admin-stage-comms-toolbar">
        <p className="admin-stage-comms-copy">
          Estas plantillas se disparan automáticamente por evento. Para
          envíos manuales o broadcasts, usa el centro de comunicaciones
          del proceso.
        </p>
        <div className="admin-stage-comms-toolbar-actions">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onSwitchToCommunications}
          >
            Abrir centro de comunicaciones
          </button>
          <button className="btn btn-outline" onClick={addAutomation}>
            + Nueva Notificación
          </button>
        </div>
      </div>

      {automations.map((automation) => (
        <div className="comm-card" key={automation.localId}>
          <div className="comm-icon">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
          </div>
          <div className="comm-content">
            <div className="editor-grid">
              <div className="form-field automation-event-field">
                <label htmlFor={`event-${automation.localId}`}>
                  Evento
                </label>
                <select
                  id={`event-${automation.localId}`}
                  value={automation.trigger_event}
                  onChange={(event) =>
                    setAutomations((current) =>
                      current.map((item) =>
                        item.localId === automation.localId
                          ? {
                              ...item,
                              trigger_event: event.target
                                .value as StageAutomationTemplate["trigger_event"],
                            }
                          : item,
                      ),
                    )
                  }
                >
                  <option value="application_submitted">
                    Postulación enviada
                  </option>
                  <option value="stage_result">
                    Resultado de etapa
                  </option>
                </select>
              </div>
              <div className="form-field automation-toggle-field">
                <div className="automation-toggle-control">
                  <span className="automation-toggle-label">
                    Habilitada
                  </span>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={automation.is_enabled}
                      onChange={(event) =>
                        setAutomations((current) =>
                          current.map((item) =>
                            item.localId === automation.localId
                              ? {
                                  ...item,
                                  is_enabled: event.target.checked,
                                }
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
                <label htmlFor={`subject-${automation.localId}`}>
                  Asunto{" "}
                  <FieldHint label="Variables disponibles para el asunto">
                    <EmailTemplateVariableHintContent />
                  </FieldHint>
                </label>
                <input
                  id={`subject-${automation.localId}`}
                  type="text"
                  value={automation.template_subject}
                  onChange={(event) =>
                    setAutomations((current) =>
                      current.map((item) =>
                        item.localId === automation.localId
                          ? {
                              ...item,
                              template_subject: event.target.value,
                            }
                          : item,
                      ),
                    )
                  }
                />
              </div>
              <div className="form-field full">
                <label htmlFor={`body-${automation.localId}`}>
                  Cuerpo{" "}
                  <FieldHint label="Variables disponibles para el cuerpo">
                    <EmailTemplateVariableHintContent />
                  </FieldHint>
                </label>
                <textarea
                  id={`body-${automation.localId}`}
                  rows={4}
                  value={automation.template_body}
                  onChange={(event) =>
                    setAutomations((current) =>
                      current.map((item) =>
                        item.localId === automation.localId
                          ? {
                              ...item,
                              template_body: event.target.value,
                            }
                          : item,
                      ),
                    )
                  }
                />
              </div>
            </div>
            <div className="comm-actions comm-actions--row">
              {isUuid(automation.id) && (
                <>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ fontSize: "13px", padding: "5px 12px" }}
                    onClick={() => handlePreviewEmail(automation.id)}
                    disabled={previewLoading === automation.id}
                    title="Vista previa del correo"
                  >
                    {previewLoading === automation.id
                      ? "Cargando…"
                      : "Vista previa"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{
                      fontSize: "13px",
                      padding: "5px 12px",
                      color:
                        testSendResult[automation.id] === "sent"
                          ? "var(--success)"
                          : testSendResult[automation.id] === "error"
                            ? "var(--danger)"
                            : undefined,
                    }}
                    onClick={() => handleTestSendEmail(automation.id)}
                    disabled={testSendLoading === automation.id}
                    title="Enviar correo de prueba a tu email"
                  >
                    {testSendLoading === automation.id
                      ? "Enviando…"
                      : testSendResult[automation.id] === "sent"
                        ? "✓ Enviado"
                        : testSendResult[automation.id] === "error"
                          ? "✗ Error"
                          : "Enviar prueba"}
                  </button>
                </>
              )}
              <button
                className="btn-icon danger"
                onClick={() => removeAutomation(automation.localId)}
                title="Eliminar automatización"
              >
                <svg
                  width="16"
                  height="16"
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
        </div>
      ))}
    </div>
  );
}

export type { EditableAutomation };
