"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import type {
  Application,
  CommunicationLog,
  CycleStageTemplate,
  SelectionProcess,
  StageCode,
} from "@/types/domain";
import { ErrorCallout } from "@/components/error-callout";
import { AdminOcrTestbed } from "@/components/admin-ocr-testbed";
import { AdminExportBuilder } from "@/components/admin-export-builder";
import {
  DEFAULT_OCR_EXTRACTION_INSTRUCTIONS,
  DEFAULT_OCR_PROMPT,
  DEFAULT_OCR_SCHEMA_TEMPLATE,
  DEFAULT_OCR_SYSTEM_PROMPT,
  MODEL_REGISTRY,
} from "@/lib/server/ocr";

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

function toDateInputValue(value: string | null) {
  if (!value) {
    return "";
  }

  return new Date(value).toISOString().slice(0, 10);
}

function toIsoDate(value: string) {
  return value ? new Date(`${value}T00:00:00.000Z`).toISOString() : undefined;
}

function formatDate(value: string | null) {
  if (!value) {
    return "No configurada";
  }

  return new Date(value).toLocaleDateString();
}

export function AdminDashboard({
  initialApplications,
  cycleTemplates,
  cycle,
  initialWorkspaceSection = "process_config",
}: {
  initialApplications: Application[];
  cycleTemplates: CycleStageTemplate[];
  cycle: SelectionProcess;
  initialWorkspaceSection?: "process_config" | "stages" | "communications" | "ocr_testbed" | "export";
}) {
  const applications = initialApplications;
  const [templates, setTemplates] = useState(cycleTemplates);
  const [error, setError] = useState<ApiError | null>(null);
  const [csvData, setCsvData] = useState(
    "applicant_email,score,passed\napplicant.demo@uwcperu.org,15.7,true",
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [stage1OpenAt, setStage1OpenAt] = useState(
    toDateInputValue(cycle.stage1_open_at),
  );
  const [stage1CloseAt, setStage1CloseAt] = useState(
    toDateInputValue(cycle.stage1_close_at),
  );
  const [stage2OpenAt, setStage2OpenAt] = useState(
    toDateInputValue(cycle.stage2_open_at),
  );
  const [stage2CloseAt, setStage2CloseAt] = useState(
    toDateInputValue(cycle.stage2_close_at),
  );
  const [communications, setCommunications] = useState<CommunicationLog[]>([]);
  const [campaigns, setCampaigns] = useState<CommunicationCampaignSummary[]>([]);
  const [communicationSummary, setCommunicationSummary] = useState({
    ...EMPTY_COMMUNICATION_SUMMARY,
  });
  const [isCommunicationLoading, setIsCommunicationLoading] = useState(false);
  const [processingTargetStatus, setProcessingTargetStatus] = useState<
    "queued" | "failed" | null
  >(null);
  const [activeSection, setActiveSection] = useState<
    "process_config" | "stages" | "communications" | "ocr_testbed" | "export"
  >(initialWorkspaceSection);
  const [broadcastName, setBroadcastName] = useState("Actualización general");
  const [broadcastSubject, setBroadcastSubject] = useState("Actualización de tu postulación UWC Perú");
  const [broadcastBody, setBroadcastBody] = useState(
    "Hola {{full_name}},\n\nQueremos compartirte una actualización sobre tu postulación en {{cycle_name}}.",
  );
  const [broadcastStageFilter, setBroadcastStageFilter] = useState<"all" | StageCode>("all");
  const [broadcastStatusFilter, setBroadcastStatusFilter] = useState<"all" | Application["status"]>("all");
  const [broadcastSearch, setBroadcastSearch] = useState("");
  const [broadcastRecipientCount, setBroadcastRecipientCount] = useState<number | null>(null);
  const [broadcastPreviewHtml, setBroadcastPreviewHtml] = useState<string | null>(null);
  const [broadcastPreviewSubject, setBroadcastPreviewSubject] = useState<string | null>(null);
  const [broadcastReadyCount, setBroadcastReadyCount] = useState<number | null>(null);
  const [broadcastReadyDeduplicated, setBroadcastReadyDeduplicated] = useState(false);
  const [isBroadcastPreviewing, setIsBroadcastPreviewing] = useState(false);
  const [isBroadcastSending, setIsBroadcastSending] = useState(false);
  const [isBroadcastTesting, setIsBroadcastTesting] = useState(false);

  const sections = [
    "process_config",
    "stages",
    "export",
  ] as const;

  const SECTION_LABELS: Record<(typeof sections)[number], string> = {
    process_config: "Reglas generales",
    stages: "Etapas",
    export: "Exportar Datos",
  };

  const pageHeader = useMemo(() => {
    switch (activeSection) {
      case "stages":
        return {
          title: "Etapas del Proceso",
          description:
            "Configura plantillas, hitos y fechas por etapa para el flujo de selección.",
          subnote: null as string | null,
        };
      case "communications":
        return {
          title: "Comunicaciones y Examen",
          description:
            "Administra importación de resultados y el procesamiento de mensajes de esta convocatoria.",
          subnote: null as string | null,
        };
      case "ocr_testbed":
        return {
          title: "Prompt Studio",
          description:
            "Prueba prompts y parámetros del modelo sin tocar la extracción productiva.",
          subnote: null as string | null,
        };
      case "export":
        return {
          title: "Exportar Datos",
          description:
            "Selecciona columnas y descarga las postulaciones en CSV o Excel.",
          subnote: null as string | null,
        };
      case "process_config":
      default:
        return {
          title: "Resumen del Proceso",
          description:
            "Gestiona validaciones, transición de etapas e importación de examen externo.",
          subnote:
            "`Elegible` habilita avance a Stage 2. `No elegible` mantiene la postulación en Stage 1.",
        };
    }
  }, [activeSection]);

  const showSummaryCards = activeSection === "process_config";

  const combinedStages = useMemo(() => {
    return [
      {
        stageNumber: 1,
        stageCode: "documents" as StageCode,
        defaultLabel: "Documentos",
        isPlaceholder: false,
        canEditDates: true,
        template: templates.find((t) => t.stage_code === "documents"),
        openDate: stage1OpenAt,
        closeDate: stage1CloseAt,
      },
      {
        stageNumber: 2,
        stageCode: "exam_placeholder" as StageCode,
        defaultLabel: "Examen",
        isPlaceholder: false,
        canEditDates: true,
        template: templates.find((t) => t.stage_code === "exam_placeholder"),
        openDate: stage2OpenAt,
        closeDate: stage2CloseAt,
      },
      {
        stageNumber: 3,
        defaultLabel: "Entrevistas",
        isPlaceholder: true,
        canEditDates: false,
        template: null,
      },
      {
        stageNumber: 4,
        defaultLabel: "Presencial",
        isPlaceholder: true,
        canEditDates: false,
        template: null,
      },
      {
        stageNumber: 5,
        defaultLabel: "Entrevista final",
        isPlaceholder: true,
        canEditDates: false,
        template: null,
      },
      {
        stageNumber: 6,
        defaultLabel: "Nominación",
        isPlaceholder: true,
        canEditDates: false,
        template: null,
      },
    ];
  }, [
    templates,
    stage1OpenAt,
    stage1CloseAt,
    stage2OpenAt,
    stage2CloseAt,
  ]);

  const statusRollup = useMemo(() => {
    const counts: Record<Application["status"], number> = {
      draft: 0,
      submitted: 0,
      eligible: 0,
      ineligible: 0,
      advanced: 0,
    };

    for (const application of applications) {
      counts[application.status] += 1;
    }

    return counts;
  }, [applications]);

  const refreshCommunications = useCallback(async () => {
    setError(null);
    setIsCommunicationLoading(true);

    try {
      const response = await fetch(
        `/api/communications?cycleId=${cycle.id}&limit=8`,
      );
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
  }, [cycle.id]);

  useEffect(() => {
    if (activeSection !== "communications") {
      return;
    }

    void refreshCommunications();
  }, [activeSection, refreshCommunications]);

  async function saveStageTemplates() {
    setError(null);
    setStatusMessage(null);

    const response = await fetch(`/api/cycles/${cycle.id}/templates`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templates: templates.map((template) => ({
          id: template.id,
          stageLabel: template.stage_label,
          milestoneLabel: template.milestone_label,
          dueAt: template.due_at,
          sortOrder: template.sort_order,
        })),
      }),
    });
    const body = await response.json();

    if (!response.ok) {
      setError(body);
      return;
    }

    setTemplates(body.templates ?? []);
    setStatusMessage("Plantillas de etapa actualizadas.");
  }

  async function saveStageConfiguration() {
    setError(null);
    setStatusMessage(null);

    const response = await fetch(`/api/cycles/${cycle.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stage1OpenAt: toIsoDate(stage1OpenAt),
        stage1CloseAt: toIsoDate(stage1CloseAt),
        stage2OpenAt: toIsoDate(stage2OpenAt),
        stage2CloseAt: toIsoDate(stage2CloseAt),
      }),
    });

    const body = await response.json();

    if (!response.ok) {
      setError(body);
      return;
    }

    setStatusMessage("Fechas del proceso actualizadas.");
  }

  async function importExamCsv() {
    setError(null);
    setStatusMessage(null);

    const response = await fetch("/api/exam-imports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv: csvData }),
    });

    const body = await response.json();

    if (!response.ok) {
      setError(body);
      return;
    }

    setStatusMessage(
      `Simulación completada: ${body.imported} filas válidas, ${body.skipped} omitidas (sin guardar).`,
    );
  }

  async function sendStatusEmails() {
    setError(null);
    setStatusMessage(null);

    const response = await fetch("/api/communications/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cycleId: cycle.id,
        stageCode: "documents",
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
          cycleId: cycle.id,
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

  function updateTemplate(
    templateId: string,
    field: "stage_label" | "milestone_label",
    value: string,
  ) {
    setTemplates((current) =>
      current.map((template) => {
        if (template.id !== templateId) {
          return template;
        }

        return {
          ...template,
          [field]: value,
        };
      }),
      );
  }

  function getBroadcastPayload() {
    return {
      name: broadcastName,
      subject: broadcastSubject,
      bodyTemplate: broadcastBody,
      cycleId: cycle.id,
      stageCode: broadcastStageFilter === "all" ? undefined : broadcastStageFilter,
      status: broadcastStatusFilter === "all" ? undefined : broadcastStatusFilter,
      search: broadcastSearch.trim() || undefined,
    };
  }

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
  ]);

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
      setStatusMessage(`Audiencia estimada: ${countBody.recipientCount ?? 0} destinatario(s).`);
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
      setBroadcastReadyCount(recipientCount);
      setBroadcastReadyDeduplicated(Boolean(dryRunBody.deduplicated));

      if (recipientCount === 0) {
        setStatusMessage("No hay destinatarios que coincidan con los filtros actuales.");
        return;
      }
      setStatusMessage(
        dryRunBody.deduplicated
          ? "Se detectó una campaña idéntica ya registrada. Puedes revisar su estado antes de reenviar."
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

      await processCommunications("queued");
      setBroadcastReadyCount(null);
      setBroadcastReadyDeduplicated(false);
      setStatusMessage(`Campaña encolada para ${body.recipientCount ?? broadcastReadyCount} destinatario(s).`);
      await refreshCommunications();
    } finally {
      setIsBroadcastSending(false);
    }
  }

  return (
    <>
      <aside className="sidebar">
        <div className="sidebar-header">
          <Link href="/admin/processes" className="admin-sidebar-backlink">
            <div className="eyebrow">{"← Volver a procesos"}</div>
          </Link>
          <h2 className="admin-sidebar-title">{cycle.name}</h2>
        </div>
        <div className="sidebar-nav">
          <div className="builder-section-title admin-sidebar-section-title">{"Panel"}</div>
          {sections.map((a) => {
            const c = activeSection === a,
              d =
                "stages" === a
                  ? `${templates.length}/6 plantillas configuradas`
                  : "export" === a
                    ? "Descarga CSV o Excel"
                    : "Reglas y configuración";
            return (
              <button
                key={a}
                className={`stage-item ${c ? "active" : ""}`}
                onClick={() => setActiveSection(a)}
              >
                <div className="stage-icon">
                  {
                    {
                      process_config: "⚙",
                      stages: "📋",
                      communications: "✉",
                      ocr_testbed: "🔬",
                      export: "📥",
                    }[a]
                  }
                </div>
                <div className="stage-info">
                  <div className="stage-title">{SECTION_LABELS[a]}</div>
                  <div className="stage-type">{d}</div>
                </div>
              </button>
            );
          })}
          <Link
            href={`/admin/candidates?cycleId=${cycle.id}`}
            className="stage-item"
          >
            <div className="stage-icon">{"👥"}</div>
            <div className="stage-info">
              <div className="stage-title">{"Postulaciones"}</div>
                  <div className="stage-type">{`${applications.length} resultado(s) en el proceso`}</div>
                </div>
              </Link>
        </div>
      </aside>
      <main className="main">
        {error ? (
          <div className="admin-feedback-wrap">
            <ErrorCallout
              message={error.message}
              errorId={error.errorId}
              context="admin_dashboard"
            />
          </div>
        ) : null}
        {statusMessage ? (
          <div className="admin-feedback-wrap">
            <div className="admin-feedback info" aria-live="polite">
              {statusMessage}
            </div>
          </div>
        ) : null}
        <div className="canvas-header">
          <div className="canvas-title-row">
            <div>
              <h1>{pageHeader.title}</h1>
              <p>{pageHeader.description}</p>
              {pageHeader.subnote ? (
                <p className="admin-subnote">{pageHeader.subnote}</p>
              ) : null}
            </div>
            <div className="admin-header-actions">
              <Link href="/admin/processes" className="btn btn-outline">
                {"Volver al dashboard de procesos"}
              </Link>
              <Link href="/admin/audit" className="btn btn-outline">
                {"Ver auditoría del proceso"}
              </Link>
            </div>
          </div>
        </div>
        <div className="canvas-body wide">
          {showSummaryCards ? (
            <div className="dashboard-grid">
              <div className="stat-card">
                <div className="stat-title">{"Postulaciones Totales"}</div>
                <div className="stat-value">{applications.length}</div>
                <div className="stat-trend neutral">{"En el sistema"}</div>
              </div>
              <div className="stat-card">
                <div className="stat-title">{"Elegibles / Avanzadas"}</div>
                <div className="stat-value">
                  {statusRollup.eligible}
                  {" / "}
                  {statusRollup.advanced}
                </div>
                <div className="stat-trend">{"Pasaron filtro"}</div>
              </div>
              <div className="stat-card">
                <div className="stat-title">{"En progreso"}</div>
                <div className="stat-value">
                  {statusRollup.draft + statusRollup.submitted}
                </div>
                <div className="stat-trend neutral">
                  {"Stage 1: "}
                  {formatDate(cycle.stage1_close_at)}
                </div>
              </div>
            </div>
          ) : null}
          {"process_config" === activeSection ? (
            <div className="settings-card">
              <div className="settings-card-header">
                <h3>{"Reglas generales"}</h3>
                <p>
                  {
                    "Usa esta vista para reglas globales del proceso. Las fechas por etapa se editan en "
                  }
                  <strong>{"Etapas"}</strong>
                  {" para mantener el calendario junto a cada plantilla."}
                </p>
              </div>
              <div className="admin-chip-row">
                <span className="status-pill admin-chip-neutral">
                  {"Máx. postulaciones por usuario: "}
                  {cycle.max_applications_per_user}
                </span>
                <span
                  className={`status-pill ${cycle.is_active ? "complete" : "rejected"}`}
                >
                  {cycle.is_active ? "Proceso activo" : "Proceso inactivo"}
                </span>
                <span className="status-pill admin-chip-neutral">
                  {"Ciclo: "}
                  {cycle.id}
                </span>
              </div>
            </div>
          ) : null}
          {"stages" === activeSection ? (
            <div className="settings-card">
              <div className="settings-card-header">
                <div className="admin-toolbar">
                  <div>
                    <h3>{"Plantillas de etapas"}</h3>
                    <p>
                      {
                        "Personaliza etiquetas, hitos y fechas por etapa. Se incluyen placeholders hasta Stage 6 para planear el flujo completo."
                      }
                    </p>
                  </div>
                  <div className="admin-toolbar-actions">
                    <button className="btn btn-outline" onClick={saveStageTemplates}>
                      {"Guardar plantillas"}
                    </button>
                    <button className="btn btn-outline" onClick={saveStageConfiguration}>
                      {"Guardar fechas activas"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="admin-stage-template-list">
                {combinedStages.map((a) => {
                  const stageBadgeClass =
                    a.stageNumber === 1
                      ? "admin-stage-tag stage-1"
                      : a.stageNumber === 2
                        ? "admin-stage-tag stage-2"
                        : "admin-stage-tag";

                  return (
                    <div
                      key={a.template?.id ?? `placeholder-stage-${a.stageNumber}`}
                      className="admin-stage-template-row"
                    >
                      <div className={stageBadgeClass}>
                        {"Stage "}
                        {a.stageNumber}
                      </div>

                      <div className="admin-stage-template-grid">
                        <div className="form-field">
                          <label>{"Nombre de etapa"}</label>
                          <input
                            type="text"
                            value={a.template?.stage_label ?? a.defaultLabel}
                            onChange={(b) => {
                              if (a.template) {
                                updateTemplate(a.template.id, "stage_label", b.target.value);
                              }
                            }}
                            disabled={a.isPlaceholder}
                          />
                        </div>
                        <div className="form-field">
                          <label>{"Hito"}</label>
                          <input
                            type="text"
                            value={a.template?.milestone_label ?? ""}
                            onChange={(b) => {
                              if (a.template) {
                                updateTemplate(
                                  a.template.id,
                                  "milestone_label",
                                  b.target.value,
                                );
                              }
                            }}
                            disabled={a.isPlaceholder}
                            placeholder={
                              a.isPlaceholder
                                ? "Placeholder para futura etapa"
                                : undefined
                            }
                          />
                        </div>
                        <div className="form-field">
                          <label>{"Inicio"}</label>
                          <input
                            type="date"
                            value={a.openDate}
                            onChange={(b) => {
                              if (a.stageCode === "documents") {
                                setStage1OpenAt(b.target.value);
                              } else if (a.stageCode === "exam_placeholder") {
                                setStage2OpenAt(b.target.value);
                              }
                            }}
                            disabled={!a.canEditDates}
                          />
                        </div>
                        <div className="form-field">
                          <label>{"Cierre"}</label>
                          <input
                            type="date"
                            value={a.closeDate}
                            onChange={(b) => {
                              if (a.stageCode === "documents") {
                                setStage1CloseAt(b.target.value);
                              } else if (a.stageCode === "exam_placeholder") {
                                setStage2CloseAt(b.target.value);
                              }
                            }}
                            disabled={!a.canEditDates}
                          />
                        </div>
                      </div>

                      <div className="admin-stage-template-actions">
                        {a.template && a.stageCode ? (
                          <Link
                            href={`/admin/process/${cycle.id}/stage/${a.template?.id ?? a.stageCode}`}
                            className="btn btn-outline"
                          >
                            {"Editar campos"}
                          </Link>
                        ) : (
                          <button className="btn btn-outline" disabled style={{ opacity: 0.5 }}>
                            {"Próximamente"}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
          {"communications" === activeSection ? (
            <>
              <div className="settings-card">
                <div className="settings-card-header">
                  <h3>{"Importación de examen externo"}</h3>
                  <p>
                    {
                      "Pega tu CSV con columnas: applicant_email, score, passed."
                    }
                  </p>
                  <p
                    style={{
                      fontSize: "0.8rem",
                      color: "var(--muted)",
                      fontStyle: "italic",
                      marginTop: "4px",
                    }}
                  >
                    {
                      "Este módulo está en modo demo: muestra resumen de importación sin persistir notas de examen."
                    }
                  </p>
                </div>
                <div className="form-field full">
                  <textarea
                    value={csvData}
                    onChange={(a) => setCsvData(a.target.value)}
                    rows={4}
                    style={{
                      width: "100%",
                    }}
                  />
                </div>
                <div
                  style={{
                    marginTop: "16px",
                  }}
                >
                  <button className="btn btn-outline" onClick={importExamCsv}>
                    {"Importar CSV"}
                  </button>
                </div>
              </div>
              <div className="settings-card">
                <div className="settings-card-header">
                  <h3>{"Comunicaciones"}</h3>
                  <p>
                    {
                      "Registra correos en cola y ejecútalos con envío real (proveedor configurado)."
                    }
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
                  <span
                    className="status-pill"
                    style={{
                      background: "var(--sand)",
                      color: "var(--ink)",
                    }}
                  >
                    {"Cola: "}
                    {communicationSummary.queued}
                  </span>
                  <span
                    className="status-pill"
                    style={{
                      background: "var(--sand)",
                      color: "var(--ink)",
                    }}
                  >
                    {"Procesando: "}
                    {communicationSummary.processing}
                  </span>
                  <span className="status-pill complete">
                    {"Enviadas: "}
                    {communicationSummary.sent}
                  </span>
                  <span className="status-pill rejected">
                    {"Fallidas: "}
                    {communicationSummary.failed}
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    flexWrap: "wrap",
                    marginBottom: "24px",
                  }}
                >
                  <button
                    className="btn btn-primary"
                    onClick={sendStatusEmails}
                  >
                    {"Enviar resultados"}
                  </button>
                  <button
                    className="btn btn-outline"
                    onClick={() => void processCommunications("queued")}
                    disabled={null !== processingTargetStatus}
                  >
                    {"queued" === processingTargetStatus
                      ? "Procesando..."
                      : "Procesar cola"}
                  </button>
                  <button
                    className="btn btn-outline"
                    onClick={() => void processCommunications("failed")}
                    disabled={null !== processingTargetStatus}
                  >
                    {"failed" === processingTargetStatus
                      ? "Reintentando..."
                      : "Reintentar fallidas"}
                  </button>
                  <button
                    className="btn btn-ghost"
                    onClick={() => void refreshCommunications()}
                    disabled={isCommunicationLoading}
                    style={{
                      color: "var(--maroon)",
                    }}
                  >
                    {isCommunicationLoading
                      ? "Actualizando..."
                      : "Actualizar estado"}
                  </button>
                </div>
                <div className="table-container">
                  <table className="candidates-table">
                    <thead>
                      <tr>
                        <th>{"Destino"}</th>
                        <th>{"Estado"}</th>
                        <th>{"Intentos"}</th>
                        <th>{"Último intento"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {0 === communications.length ? (
                        <tr>
                          <td
                            colSpan={4}
                            style={{
                              textAlign: "center",
                            }}
                          >
                            {"Sin registros todavía. Usa `Actualizar estado`."}
                          </td>
                        </tr>
                      ) : (
                        communications.map((a) => (
                          <tr key={a.id}>
                            <td>{a.recipient_email}</td>
                            <td>{a.status}</td>
                            <td>{a.attempt_count}</td>
                            <td>
                              {a.last_attempt_at
                                ? new Date(a.last_attempt_at).toLocaleString()
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
                  <h3>{"Broadcasts"}</h3>
                  <p>
                    {"Compón un correo, revisa la audiencia y envíalo con trazabilidad por campaña."}
                  </p>
                </div>
                <div className="editor-grid">
                  <div className="form-field">
                    <label>{"Nombre interno de campaña"}</label>
                    <input
                      type="text"
                      value={broadcastName}
                      onChange={(event) => setBroadcastName(event.target.value)}
                      placeholder="Ej: Recordatorio entrega final"
                    />
                  </div>
                  <div className="form-field">
                    <label>{"Filtro por etapa"}</label>
                    <select
                      value={broadcastStageFilter}
                      onChange={(event) => setBroadcastStageFilter(event.target.value as "all" | StageCode)}
                    >
                      <option value="all">Todas</option>
                      <option value="documents">Formulario Principal</option>
                      <option value="exam_placeholder">Examen Académico</option>
                    </select>
                  </div>
                  <div className="form-field">
                    <label>{"Filtro por estado"}</label>
                    <select
                      value={broadcastStatusFilter}
                      onChange={(event) => setBroadcastStatusFilter(event.target.value as "all" | Application["status"])}
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
                    <label>{"Búsqueda opcional"}</label>
                    <input
                      type="text"
                      value={broadcastSearch}
                      onChange={(event) => setBroadcastSearch(event.target.value)}
                      placeholder="Nombre o correo"
                    />
                  </div>
                  <div className="form-field full">
                    <label>{"Asunto"}</label>
                    <input
                      type="text"
                      value={broadcastSubject}
                      onChange={(event) => setBroadcastSubject(event.target.value)}
                      placeholder="Asunto del correo"
                    />
                  </div>
                  <div className="form-field full">
                    <label>{"Cuerpo (Markdown + variables)"}</label>
                    <textarea
                      rows={8}
                      value={broadcastBody}
                      onChange={(event) => setBroadcastBody(event.target.value)}
                      placeholder="Escribe el mensaje en Markdown."
                    />
                    <div className="form-hint">
                      {"Variables: {{full_name}}, {{cycle_name}}, {{application_id}}, {{application_status}}, {{stage_label}}."}
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    flexWrap: "wrap",
                    marginTop: "16px",
                    alignItems: "center",
                  }}
                >
                  <button
                    className="btn btn-outline"
                    onClick={() => void previewBroadcast()}
                    disabled={isBroadcastPreviewing || !broadcastCanRun}
                  >
                    {isBroadcastPreviewing ? "Calculando..." : "Vista previa y conteo"}
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
                    {isBroadcastSending ? "Preparando..." : "Send now"}
                  </button>
                  {broadcastRecipientCount !== null ? (
                    <span className="status-pill admin-chip-neutral">
                      {broadcastRecipientCount} destinatario(s)
                    </span>
                  ) : null}
                </div>
                {broadcastReadyCount !== null ? (
                  <div
                    style={{
                      marginTop: "16px",
                      padding: "16px",
                      borderRadius: "var(--radius)",
                      border: "1px solid var(--sand)",
                      background: "var(--surface)",
                    }}
                  >
                    <div style={{ fontWeight: 700, marginBottom: "6px" }}>
                      {"Confirmación de campaña"}
                    </div>
                    <p style={{ margin: 0, color: "var(--muted)" }}>
                      {broadcastReadyDeduplicated
                        ? "Ya existe una campaña idéntica. Revisa el historial antes de reenviar."
                        : `Esta campaña enviará ${broadcastReadyCount} correo(s) ahora mismo.`}
                    </p>
                    <div
                      style={{
                        display: "flex",
                        gap: "8px",
                        flexWrap: "wrap",
                        marginTop: "12px",
                      }}
                    >
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
                {broadcastPreviewHtml ? (
                  <div
                    style={{
                      marginTop: "20px",
                      border: "1px solid var(--sand)",
                      borderRadius: "var(--radius)",
                      padding: "16px",
                      background: "var(--surface)",
                    }}
                  >
                    <div style={{ fontSize: "0.75rem", color: "var(--muted)", textTransform: "uppercase", marginBottom: "6px" }}>
                      {"Vista previa"}
                    </div>
                    <div style={{ fontWeight: 700, marginBottom: "10px" }}>
                      {broadcastPreviewSubject}
                    </div>
                    <div dangerouslySetInnerHTML={{ __html: broadcastPreviewHtml }} />
                  </div>
                ) : null}
                <div className="table-container" style={{ marginTop: "24px" }}>
                  <table className="candidates-table">
                    <thead>
                      <tr>
                        <th>{"Campaña"}</th>
                        <th>{"Estado"}</th>
                        <th>{"Destinatarios"}</th>
                        <th>{"Entregadas / Fallidas"}</th>
                        <th>{"Creada"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {campaigns.length === 0 ? (
                        <tr>
                          <td colSpan={5} style={{ textAlign: "center" }}>
                            {"Sin campañas registradas todavía."}
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
                              {campaign.sentCount}
                              {" / "}
                              {campaign.failedCount}
                            </td>
                            <td>{new Date(campaign.createdAt).toLocaleString()}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : null}
          {"ocr_testbed" === activeSection ? (
            <AdminOcrTestbed
              cycleId={cycle.id}
              stageCode="documents"
              modelOptions={Object.entries(MODEL_REGISTRY).map(([id, meta]) => ({
                id,
                name: meta.name,
              }))}
              defaultPrompt={DEFAULT_OCR_PROMPT}
              defaultSystemPrompt={DEFAULT_OCR_SYSTEM_PROMPT}
              defaultExtractionInstructions={DEFAULT_OCR_EXTRACTION_INSTRUCTIONS}
              defaultSchemaTemplate={DEFAULT_OCR_SCHEMA_TEMPLATE}
            />
          ) : null}
          {"export" === activeSection ? (
            <AdminExportBuilder cycleId={cycle.id} />
          ) : null}
        </div>
      </main>
    </>
  );
}
