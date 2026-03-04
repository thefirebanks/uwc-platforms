"use client";

import { useCallback, useEffect, useState } from "react";
import type { Application, CommunicationLog, StageCode } from "@/types/domain";
import { ErrorCallout } from "@/components/error-callout";
import { EmailTemplateVariableHintContent } from "@/components/email-template-variable-guide";
import { FieldHint } from "@/components/field-hint";

interface ApiError {
  message: string;
  errorId?: string;
}

type CommunicationCampaignSummary = {
  id: string;
  name: string;
  subject: string;
  status: string;
  createdAt: string;
  sentAt: string | null;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
};

const EMPTY_COMMUNICATION_SUMMARY = {
  queued: 0,
  processing: 0,
  sent: 0,
  failed: 0,
  total: 0,
};

export function AdminCommunicationsCenter({
  cycleId,
  defaultStageCode,
}: {
  cycleId: string;
  defaultStageCode?: StageCode;
}) {
  const campaignFieldIdPrefix = `campaign-${cycleId}`;
  const [error, setError] = useState<ApiError | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [communications, setCommunications] = useState<CommunicationLog[]>([]);
  const [campaigns, setCampaigns] = useState<CommunicationCampaignSummary[]>([]);
  const [communicationSummary, setCommunicationSummary] = useState({
    ...EMPTY_COMMUNICATION_SUMMARY,
  });
  const [isCommunicationLoading, setIsCommunicationLoading] = useState(false);
  const [processingTargetStatus, setProcessingTargetStatus] = useState<
    "queued" | "failed" | null
  >(null);
  const [broadcastName, setBroadcastName] = useState("Actualización general");
  const [broadcastSubject, setBroadcastSubject] = useState(
    "Actualización de tu postulación UWC Perú",
  );
  const [broadcastBody, setBroadcastBody] = useState(
    "Hola {{full_name}},\n\nQueremos compartirte una actualización sobre tu postulación en {{cycle_name}}.",
  );
  const [broadcastStageFilter, setBroadcastStageFilter] = useState<"all" | StageCode>(
    defaultStageCode ?? "all",
  );
  const [broadcastStatusFilter, setBroadcastStatusFilter] = useState<
    "all" | Application["status"]
  >("all");
  const [broadcastSearch, setBroadcastSearch] = useState("");
  const [directRecipientEmail, setDirectRecipientEmail] = useState("");
  const [broadcastRecipientCount, setBroadcastRecipientCount] = useState<number | null>(null);
  const [broadcastPreviewHtml, setBroadcastPreviewHtml] = useState<string | null>(null);
  const [broadcastPreviewSubject, setBroadcastPreviewSubject] = useState<string | null>(null);
  const [broadcastReadyCount, setBroadcastReadyCount] = useState<number | null>(null);
  const [broadcastReadyDeduplicated, setBroadcastReadyDeduplicated] = useState(false);
  const [isBroadcastPreviewing, setIsBroadcastPreviewing] = useState(false);
  const [isBroadcastSending, setIsBroadcastSending] = useState(false);
  const [isBroadcastTesting, setIsBroadcastTesting] = useState(false);

  const refreshCommunications = useCallback(async () => {
    setError(null);
    setIsCommunicationLoading(true);

    try {
      const response = await fetch(`/api/communications?cycleId=${cycleId}&limit=8`);
      const body = await response.json();

      if (!response.ok) {
        setError(body);
        return;
      }

      setCommunications(body.logs ?? []);
      setCampaigns(body.campaigns ?? []);
      setCommunicationSummary({
        ...EMPTY_COMMUNICATION_SUMMARY,
        ...(body.summary ?? {}),
      });
    } finally {
      setIsCommunicationLoading(false);
    }
  }, [cycleId]);

  useEffect(() => {
    void refreshCommunications();
  }, [refreshCommunications]);

  function getBroadcastPayload() {
    return {
      name: broadcastName,
      subject: broadcastSubject,
      bodyTemplate: broadcastBody,
      cycleId,
      stageCode: broadcastStageFilter === "all" ? undefined : broadcastStageFilter,
      status: broadcastStatusFilter === "all" ? undefined : broadcastStatusFilter,
      search: broadcastSearch.trim() || undefined,
      directRecipientEmail: directRecipientEmail.trim() || undefined,
    };
  }

  const isDirectRecipientMode = directRecipientEmail.trim().length > 0;

  const broadcastCanRun =
    broadcastName.trim().length >= 3 &&
    broadcastSubject.trim().length >= 3 &&
    broadcastBody.trim().length >= 10;

  useEffect(() => {
    setBroadcastReadyCount(null);
    setBroadcastReadyDeduplicated(false);
    setBroadcastPreviewHtml(null);
    setBroadcastPreviewSubject(null);
    setBroadcastRecipientCount(null);
  }, [
    broadcastName,
    broadcastSubject,
    broadcastBody,
    broadcastStageFilter,
    broadcastStatusFilter,
    broadcastSearch,
    directRecipientEmail,
  ]);

  async function sendStatusEmails() {
    if (!defaultStageCode) {
      return;
    }

    setError(null);
    setStatusMessage(null);

    const response = await fetch("/api/communications/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cycleId,
        stageCode: defaultStageCode,
        triggerEvent: "stage_result",
      }),
    });

    const body = await response.json();

    if (!response.ok) {
      setError(body);
      return;
    }

    setStatusMessage(`Comunicaciones registradas: ${body.sent}.`);
    await refreshCommunications();
  }

  async function processCommunications(targetStatus: "queued" | "failed") {
    setError(null);
    setStatusMessage(null);
    setProcessingTargetStatus(targetStatus);

    try {
      const response = await fetch("/api/communications/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cycleId,
          targetStatus,
          limit: 30,
        }),
      });
      const body = await response.json();

      if (!response.ok) {
        setError(body);
        return;
      }

      setStatusMessage(
        `Procesadas: ${body.processed}. Enviadas: ${body.sent}. Fallidas: ${body.failed}.`,
      );
      await refreshCommunications();
    } finally {
      setProcessingTargetStatus(null);
    }
  }

  async function previewBroadcast() {
    setError(null);
    setStatusMessage(null);
    setIsBroadcastPreviewing(true);

    try {
      const [previewResponse, countResponse] = await Promise.all([
        fetch("/api/communications/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subjectTemplate: broadcastSubject,
            bodyTemplate: broadcastBody,
            sampleValues: isDirectRecipientMode
              ? {
                  full_name: directRecipientEmail.trim(),
                  applicant_email: directRecipientEmail.trim(),
                }
              : undefined,
          }),
        }),
        fetch("/api/communications/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dryRun: true,
            broadcast: getBroadcastPayload(),
          }),
        }),
      ]);

      const previewBody = await previewResponse.json();
      const countBody = await countResponse.json();

      if (!previewResponse.ok) {
        setError(previewBody);
        return;
      }

      if (!countResponse.ok) {
        setError(countBody);
        return;
      }

      setBroadcastReadyCount(null);
      setBroadcastReadyDeduplicated(false);
      setBroadcastPreviewSubject(previewBody.subject ?? broadcastSubject);
      setBroadcastPreviewHtml(previewBody.bodyHtml ?? null);
      setBroadcastRecipientCount(Number(countBody.recipientCount ?? 0));
    } finally {
      setIsBroadcastPreviewing(false);
    }
  }

  async function testBroadcast() {
    setError(null);
    setStatusMessage(null);
    setIsBroadcastTesting(true);

    try {
      const response = await fetch("/api/communications/test-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectTemplate: broadcastSubject,
          bodyTemplate: broadcastBody,
        }),
      });
      const body = await response.json();

      if (!response.ok) {
        setError(body);
        return;
      }

      setBroadcastReadyCount(null);
      setBroadcastReadyDeduplicated(false);
      setStatusMessage("Se envió un correo de prueba a tu bandeja.");
    } finally {
      setIsBroadcastTesting(false);
    }
  }

  async function prepareBroadcastSend() {
    setError(null);
    setStatusMessage(null);
    setIsBroadcastSending(true);

    try {
      const dryRunResponse = await fetch("/api/communications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dryRun: true,
          broadcast: getBroadcastPayload(),
        }),
      });
      const dryRunBody = await dryRunResponse.json();

      if (!dryRunResponse.ok) {
        setError(dryRunBody);
        return;
      }

      const recipientCount = Number(dryRunBody.recipientCount ?? 0);
      setBroadcastRecipientCount(recipientCount);

      if (recipientCount === 0) {
        setBroadcastReadyCount(null);
        setBroadcastReadyDeduplicated(false);
        setStatusMessage("No hay destinatarios que coincidan con los filtros actuales.");
        return;
      }

      setBroadcastReadyCount(recipientCount);
      setBroadcastReadyDeduplicated(Boolean(dryRunBody.deduplicated));

      setStatusMessage(
        dryRunBody.deduplicated
          ? "Se detectó una campaña idéntica ya registrada. Puedes revisar su estado antes de reenviar."
          : isDirectRecipientMode
            ? `Confirmar envío inmediato a ${directRecipientEmail.trim()}.`
            : `Confirmar envío inmediato a ${recipientCount} destinatario(s).`,
      );
    } finally {
      setIsBroadcastSending(false);
    }
  }

  async function sendBroadcastNow() {
    if (!broadcastReadyCount || broadcastReadyDeduplicated) {
      return;
    }

    setError(null);
    setStatusMessage(null);
    setIsBroadcastSending(true);

    try {
      const response = await fetch("/api/communications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          broadcast: getBroadcastPayload(),
        }),
      });
      const body = await response.json();

      if (!response.ok) {
        setError(body);
        return;
      }

      setBroadcastReadyCount(null);
      setBroadcastReadyDeduplicated(false);
      if (body.deliveryMode === "direct") {
        setStatusMessage(`Correo enviado a ${directRecipientEmail.trim()}.`);
      } else {
        await processCommunications("queued");
        setStatusMessage(
          `Campaña encolada para ${body.recipientCount ?? broadcastReadyCount} destinatario(s).`,
        );
        await refreshCommunications();
      }
    } finally {
      setIsBroadcastSending(false);
    }
  }

  return (
    <div className="admin-stage-integrated-panel">
      {error ? (
        <div style={{ marginBottom: "16px" }}>
          <ErrorCallout message={error.message} errorId={error.errorId} context="communications_center" />
        </div>
      ) : null}
      {statusMessage ? (
        <div className="admin-feedback success" style={{ marginBottom: "16px" }}>
          {statusMessage}
        </div>
      ) : null}

      <div className="settings-card">
        <div className="settings-card-header">
          <h3>Centro de comunicaciones</h3>
          <p>
            Envía resultados automáticos, procesa la cola y compón campañas manuales desde el mismo
            panel.
          </p>
        </div>
        <div
          style={{
            display: "flex",
            gap: "8px",
            flexWrap: "wrap",
            marginBottom: "24px",
          }}
        >
          <span className="status-pill" style={{ background: "var(--sand)", color: "var(--ink)" }}>
            Cola: {communicationSummary.queued}
          </span>
          <span className="status-pill" style={{ background: "var(--sand)", color: "var(--ink)" }}>
            Procesando: {communicationSummary.processing}
          </span>
          <span className="status-pill complete">Enviadas: {communicationSummary.sent}</span>
          <span className="status-pill rejected">Fallidas: {communicationSummary.failed}</span>
        </div>
        <div
          style={{
            display: "flex",
            gap: "8px",
            flexWrap: "wrap",
            marginBottom: "24px",
          }}
        >
          {defaultStageCode ? (
            <button className="btn btn-primary" onClick={sendStatusEmails}>
              Enviar resultados
            </button>
          ) : null}
          <button
            className="btn btn-outline"
            onClick={() => void processCommunications("queued")}
            disabled={processingTargetStatus !== null}
          >
            {processingTargetStatus === "queued" ? "Procesando..." : "Procesar cola"}
          </button>
          <button
            className="btn btn-outline"
            onClick={() => void processCommunications("failed")}
            disabled={processingTargetStatus !== null}
          >
            {processingTargetStatus === "failed" ? "Reintentando..." : "Reintentar fallidas"}
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => void refreshCommunications()}
            disabled={isCommunicationLoading}
            style={{ color: "var(--maroon)" }}
          >
            {isCommunicationLoading ? "Actualizando..." : "Actualizar estado"}
          </button>
        </div>
        <div className="table-container">
          <table className="candidates-table">
            <thead>
              <tr>
                <th>Destino</th>
                <th>Estado</th>
                <th>Intentos</th>
                <th>Último intento</th>
              </tr>
            </thead>
            <tbody>
              {communications.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: "center" }}>
                    Sin registros todavía. Usa `Actualizar estado`.
                  </td>
                </tr>
              ) : (
                communications.map((log) => (
                  <tr key={log.id}>
                    <td>{log.recipient_email}</td>
                    <td>{log.status}</td>
                    <td>{log.attempt_count}</td>
                    <td>
                      {log.last_attempt_at
                        ? new Date(log.last_attempt_at).toLocaleString()
                        : "-"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="settings-card">
        <div className="settings-card-header">
          <h3>Campañas manuales</h3>
          <p>Escribe el correo libremente, revisa la audiencia y encola el envío sin depender de una plantilla fija.</p>
        </div>
        <div className="communications-campaign-layout">
          <div className="communications-compose-pane">
            <section className="communications-compose-section">
              <div className="communications-compose-section__title">Audiencia</div>
              <div className="editor-grid">
                <div className="form-field">
                  <label htmlFor={`${campaignFieldIdPrefix}-name`}>Nombre interno de campaña</label>
                  <input
                    id={`${campaignFieldIdPrefix}-name`}
                    type="text"
                    value={broadcastName}
                    onChange={(event) => setBroadcastName(event.target.value)}
                    placeholder="Ej: Recordatorio entrega final"
                  />
                </div>
                <div className="form-field">
                  <label htmlFor={`${campaignFieldIdPrefix}-stage`}>Filtro por etapa</label>
                  <select
                    id={`${campaignFieldIdPrefix}-stage`}
                    value={broadcastStageFilter}
                    onChange={(event) =>
                      setBroadcastStageFilter(event.target.value as "all" | StageCode)
                    }
                  >
                    <option value="all">Todas</option>
                    <option value="documents">Formulario Principal</option>
                    <option value="exam_placeholder">Examen Académico</option>
                  </select>
                </div>
                <div className="form-field">
                  <label htmlFor={`${campaignFieldIdPrefix}-status`}>Filtro por estado</label>
                  <select
                    id={`${campaignFieldIdPrefix}-status`}
                    value={broadcastStatusFilter}
                    onChange={(event) =>
                      setBroadcastStatusFilter(event.target.value as "all" | Application["status"])
                    }
                  >
                    <option value="all">Todos</option>
                    <option value="draft">Draft</option>
                    <option value="submitted">Submitted</option>
                    <option value="eligible">Eligible</option>
                    <option value="ineligible">Ineligible</option>
                    <option value="advanced">Advanced</option>
                  </select>
                </div>
                <div className="form-field">
                  <label htmlFor={`${campaignFieldIdPrefix}-search`}>
                    Filtrar postulantes por nombre o correo{" "}
                    <FieldHint label="Ayuda para filtro de postulantes">
                      Úsalo para reducir la audiencia solo entre postulantes del proceso que
                      coincidan parcialmente por nombre o correo.
                    </FieldHint>
                  </label>
                  <input
                    id={`${campaignFieldIdPrefix}-search`}
                    type="text"
                    value={broadcastSearch}
                    onChange={(event) => setBroadcastSearch(event.target.value)}
                    placeholder="Ej: María Pérez o maria@example.com"
                  />
                </div>
                <div className="form-field full">
                  <label htmlFor={`${campaignFieldIdPrefix}-direct-recipient`}>
                    Correo puntual (opcional){" "}
                    <FieldHint label="Ayuda para envío puntual">
                      Si completas este campo, el envío irá solo a ese correo y no dependerá de la
                      audiencia de postulantes.
                    </FieldHint>
                  </label>
                  <input
                    id={`${campaignFieldIdPrefix}-direct-recipient`}
                    type="email"
                    value={directRecipientEmail}
                    onChange={(event) => setDirectRecipientEmail(event.target.value)}
                    placeholder="persona@correo.com"
                  />
                </div>
              </div>
            </section>

            <section className="communications-compose-section">
              <div className="communications-compose-section__title">Contenido</div>
              <div className="editor-grid">
                <div className="form-field full">
                  <label htmlFor={`${campaignFieldIdPrefix}-subject`}>Asunto</label>
                  <input
                    id={`${campaignFieldIdPrefix}-subject`}
                    type="text"
                    value={broadcastSubject}
                    onChange={(event) => setBroadcastSubject(event.target.value)}
                    placeholder="Asunto del correo"
                  />
                </div>
                <div className="form-field full">
                  <label htmlFor={`${campaignFieldIdPrefix}-body`}>
                    Cuerpo (Markdown + variables){" "}
                    <FieldHint label="Variables disponibles para correos">
                      <EmailTemplateVariableHintContent />
                    </FieldHint>
                  </label>
                  <textarea
                    id={`${campaignFieldIdPrefix}-body`}
                    rows={8}
                    value={broadcastBody}
                    onChange={(event) => setBroadcastBody(event.target.value)}
                    placeholder="Escribe el mensaje en Markdown."
                  />
                </div>
              </div>
            </section>

            <div className="communications-action-row communications-action-row--sticky">
              <button
                className="btn btn-outline"
                onClick={() => void previewBroadcast()}
                disabled={isBroadcastPreviewing || !broadcastCanRun}
              >
                {isBroadcastPreviewing ? "Calculando..." : "Vista previa de audiencia"}
              </button>
              <button
                className="btn btn-outline"
                onClick={() => void testBroadcast()}
                disabled={isBroadcastTesting || !broadcastCanRun}
              >
                {isBroadcastTesting ? "Enviando..." : "Enviar prueba"}
              </button>
              <button
                className="btn btn-primary"
                onClick={() => void prepareBroadcastSend()}
                disabled={isBroadcastSending}
              >
                {isBroadcastSending ? "Preparando..." : "Preparar envío"}
              </button>
            </div>
          </div>
          <aside className="communications-review-rail">
            {broadcastReadyCount !== null ? (
              <div className="communications-confirmation-card">
                <div className="communications-confirmation-card__title">
                  Confirmación de campaña
                </div>
                <p className="communications-confirmation-card__description">
                  {broadcastReadyDeduplicated
                    ? "Ya existe una campaña idéntica. Revisa el historial antes de reenviar."
                    : isDirectRecipientMode
                      ? `Este envío mandará 1 correo ahora mismo a ${directRecipientEmail.trim()}.`
                      : `Esta campaña enviará ${broadcastReadyCount} correo(s) ahora mismo.`}
                </p>
                <div className="communications-confirmation-card__actions">
                  {!broadcastReadyDeduplicated ? (
                    <button
                      className="btn btn-primary"
                      onClick={() => void sendBroadcastNow()}
                      disabled={isBroadcastSending}
                    >
                      {isBroadcastSending ? "Encolando..." : "Confirmar envío"}
                    </button>
                  ) : null}
                  <button
                    className="btn btn-outline"
                    onClick={() => {
                      setBroadcastReadyCount(null);
                      setBroadcastReadyDeduplicated(false);
                    }}
                  >
                    {broadcastReadyDeduplicated ? "Cerrar" : "Cancelar"}
                  </button>
                </div>
              </div>
            ) : null}
            <div
              className={`communications-preview-card${
                broadcastPreviewHtml || broadcastRecipientCount !== null
                  ? ""
                  : " communications-preview-card--empty"
              }`}
            >
              <div className="communications-preview-card__header">
                <div>
                  <div className="communications-preview-card__eyebrow">Vista previa</div>
                  <div className="communications-preview-card__title">Audiencia y contenido</div>
                </div>
              </div>
              {broadcastRecipientCount !== null ? (
                <div className="communications-preview-card__audience">
                  Audiencia estimada: {broadcastRecipientCount} destinatario(s)
                </div>
              ) : null}
              {broadcastPreviewHtml ? (
                <>
                  <div style={{ fontWeight: 700, marginBottom: "10px" }}>
                    {broadcastPreviewSubject}
                  </div>
                  <div dangerouslySetInnerHTML={{ __html: broadcastPreviewHtml }} />
                </>
              ) : (
                <p className="form-hint" style={{ margin: 0 }}>
                  Ejecuta la vista previa para revisar el cuerpo renderizado antes de encolar el envío.
                </p>
              )}
            </div>
          </aside>
        </div>
        <div className="table-container" style={{ marginTop: "24px" }}>
          <table className="candidates-table">
            <thead>
              <tr>
                <th>Campaña</th>
                <th>Estado</th>
                <th>Destinatarios</th>
                <th>Entregadas / Fallidas</th>
                <th>Creada</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center" }}>
                    Sin campañas registradas todavía.
                  </td>
                </tr>
              ) : (
                campaigns.map((campaign) => (
                  <tr key={campaign.id}>
                    <td>
                      <div style={{ fontWeight: 700 }}>{campaign.name}</div>
                      <div className="candidate-email">{campaign.subject}</div>
                    </td>
                    <td>{campaign.status}</td>
                    <td>{campaign.recipientCount}</td>
                    <td>
                      {campaign.sentCount} / {campaign.failedCount}
                    </td>
                    <td>{new Date(campaign.createdAt).toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
