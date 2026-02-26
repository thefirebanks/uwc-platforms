"use client";
import { useDeferredValue, useMemo, useState } from "react";
import Link from "next/link";

import type {
  Application,
  ApplicationOcrCheck,
  CommunicationLog,
  CycleStageTemplate,
  SelectionProcess,
  StageCode,
} from "@/types/domain";
import { ErrorCallout } from "@/components/error-callout";
import { canTransition } from "@/lib/stages/transition";

interface ApiError {
  message: string;
  errorId?: string;
}

type StageFilter = StageCode | "all";
type StatusFilter = Application["status"] | "all";
type EligibilityFilter =
  | "all"
  | "eligible"
  | "ineligible"
  | "pending"
  | "advanced";

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

function getApplicationFiles(application: Application) {
  const files =
    (application.files as Record<string, unknown> | undefined) ?? {};
  const normalized: Record<string, string> = {};

  for (const [key, value] of Object.entries(files)) {
    if (typeof value === "string") {
      normalized[key] = value;
      continue;
    }

    if (
      value &&
      typeof value === "object" &&
      typeof (value as Record<string, unknown>).path === "string"
    ) {
      normalized[key] = (value as Record<string, unknown>).path as string;
    }
  }

  return normalized;
}

function getDefaultOcrFileKey(application: Application) {
  const files = getApplicationFiles(application);
  if (files.identificationDocument) {
    return "identificationDocument";
  }

  const keys = Object.keys(files).filter((key) => Boolean(files[key]));
  return keys[0] ?? null;
}

function getPayloadString(
  payload: Application["payload"],
  candidates: string[],
): string | null {
  for (const key of candidates) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function getApplicationDisplayName(application: Application) {
  const payload = application.payload ?? {};
  const firstName =
    getPayloadString(payload, ["firstName", "givenName", "name"]) ?? "";
  const paternalLastName =
    getPayloadString(payload, ["paternalLastName", "lastName", "surname"]) ??
    "";
  const maternalLastName =
    getPayloadString(payload, ["maternalLastName", "secondLastName"]) ?? "";

  const fullName = [firstName, paternalLastName, maternalLastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (fullName) {
    return fullName;
  }

  return getPayloadString(payload, ["fullName"]) ?? `Postulación ${application.id.slice(0, 8)}`;
}

function getApplicationDisplayEmail(application: Application) {
  return (
    getPayloadString(application.payload ?? {}, [
      "email",
      "personalEmail",
      "applicantEmail",
      "guardian1Email",
    ]) ?? `${application.id.slice(0, 8)}@sin-correo.local`
  );
}

function getApplicationRegion(application: Application) {
  return (
    getPayloadString(application.payload ?? {}, [
      "department",
      "region",
      "city",
      "schoolRegion",
    ]) ?? "Sin región"
  );
}

function getApplicationInitials(application: Application) {
  const name = getApplicationDisplayName(application)
    .replace(/\s+/g, " ")
    .trim();
  const parts = name.split(" ").filter(Boolean);

  if (parts.length === 0) {
    return "AP";
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function getStageLabel(stage: StageCode) {
  if (stage === "documents") {
    return "Stage 1: Documentos";
  }

  return "Stage 2: Examen (placeholder)";
}

function getStageShortLabel(stage: StageCode) {
  return stage === "documents" ? "Stage 1" : "Stage 2";
}

function getStatusDisplayLabel(status: Application["status"]) {
  switch (status) {
    case "draft":
      return "Borrador";
    case "submitted":
      return "Submitted";
    case "eligible":
      return "Elegible";
    case "ineligible":
      return "No elegible";
    case "advanced":
      return "Avanzada";
    default:
      return status;
  }
}

function getStatusPillClass(status: Application["status"]) {
  if (status === "ineligible") {
    return "rejected";
  }

  if (status === "draft") {
    return "progress";
  }

  return "complete";
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
  initialWorkspaceSection?: "process_config" | "stages" | "applications" | "communications";
}) {
  const [applications, setApplications] = useState(initialApplications);
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
  const [communicationSummary, setCommunicationSummary] = useState({
    ...EMPTY_COMMUNICATION_SUMMARY,
  });
  const [isCommunicationLoading, setIsCommunicationLoading] = useState(false);
  const [processingTargetStatus, setProcessingTargetStatus] = useState<
    "queued" | "failed" | null
  >(null);
  const [ocrLoadingApplicationId, setOcrLoadingApplicationId] = useState<
    string | null
  >(null);
  const [selectedOcrApplicationId, setSelectedOcrApplicationId] = useState<
    string | null
  >(null);
  const [ocrChecks, setOcrChecks] = useState<ApplicationOcrCheck[]>([]);
  const [isOcrHistoryLoading, setIsOcrHistoryLoading] = useState(false);
  const [stageFilter, setStageFilter] = useState<StageFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [eligibilityFilter, setEligibilityFilter] =
    useState<EligibilityFilter>("all");
  const [activeSection, setActiveSection] = useState<
    "process_config" | "stages" | "applications" | "communications"
  >(initialWorkspaceSection);
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery.trim().toLowerCase());

  const sections = [
    "process_config",
    "stages",
    "applications",
    "communications",
  ] as const;

  const SECTION_LABELS: Record<(typeof sections)[number], string> = {
    process_config: "Reglas generales",
    stages: "Etapas",
    applications: "Postulaciones",
    communications: "Comunicaciones y Examen",
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
      case "applications":
        return {
          title: "Candidatos",
          description: cycle.name,
          subnote: null as string | null,
        };
      case "communications":
        return {
          title: "Comunicaciones y Examen",
          description:
            "Administra importación de resultados y el procesamiento de mensajes de esta convocatoria.",
          subnote: null as string | null,
        };
      case "process_config":
      default:
        return {
          title: "Resumen del Proceso",
          description:
            "Gestiona validaciones, transición de etapas (2 etapas MVP) e importación de examen externo.",
          subnote:
            "`Elegible` habilita avance a Stage 2. `No elegible` mantiene la postulación en Stage 1.",
        };
    }
  }, [activeSection, cycle.name]);

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

  const orderedApplications = useMemo(
    () =>
      [...applications].sort((a, b) =>
        b.updated_at.localeCompare(a.updated_at),
      ),
    [applications],
  );
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

  const filteredApplications = useMemo(() => {
    return orderedApplications.filter((application) => {
      if (stageFilter !== "all" && application.stage_code !== stageFilter) {
        return false;
      }

      if (statusFilter !== "all" && application.status !== statusFilter) {
        return false;
      }

      if (
        eligibilityFilter === "eligible" &&
        application.status !== "eligible"
      ) {
        return false;
      }

      if (
        eligibilityFilter === "ineligible" &&
        application.status !== "ineligible"
      ) {
        return false;
      }

      if (
        eligibilityFilter === "advanced" &&
        application.status !== "advanced"
      ) {
        return false;
      }

      if (
        eligibilityFilter === "pending" &&
        application.status !== "draft" &&
        application.status !== "submitted"
      ) {
        return false;
      }

      if (deferredSearchQuery) {
        const payloadValues = Object.values(application.payload ?? {}).map((value) =>
          String(value ?? "").toLowerCase(),
        );
        const searchableValues = [
          application.id,
          application.applicant_id,
          application.stage_code,
          application.status,
          ...payloadValues,
        ];

        if (
          !searchableValues.some((value) =>
            value.toLowerCase().includes(deferredSearchQuery),
          )
        ) {
          return false;
        }
      }

      return true;
    });
  }, [
    deferredSearchQuery,
    eligibilityFilter,
    orderedApplications,
    stageFilter,
    statusFilter,
  ]);
  const exportCsvHref = useMemo(() => {
    const query = new URLSearchParams({
      cycleId: cycle.id,
    });

    if (stageFilter !== "all") {
      query.set("stageCode", stageFilter);
    }

    if (statusFilter !== "all") {
      query.set("status", statusFilter);
    } else if (eligibilityFilter !== "all") {
      query.set("eligibility", eligibilityFilter);
    }

    return `/api/exports?${query.toString()}`;
  }, [cycle.id, eligibilityFilter, stageFilter, statusFilter]);

  async function refreshData() {
    const response = await fetch(`/api/applications?cycleId=${cycle.id}`);
    const body = await response.json();

    if (!response.ok) {
      setError(body);
      return;
    }

    setApplications(body.applications ?? []);
  }

  async function refreshCommunications() {
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
      setCommunicationSummary({
        ...EMPTY_COMMUNICATION_SUMMARY,
        ...(body.summary ?? {}),
      });
    } finally {
      setIsCommunicationLoading(false);
    }
  }

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

  async function validateApplication(
    applicationId: string,
    status: "eligible" | "ineligible",
  ) {
    setError(null);
    setStatusMessage(null);

    const response = await fetch(
      `/api/applications/${applicationId}/validate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, notes: "Revisión manual del comité." }),
      },
    );

    const body = await response.json();

    if (!response.ok) {
      setError(body);
      return;
    }

    setStatusMessage("Validación guardada.");
    await refreshData();
  }

  async function transition(applicationId: string, toStage: StageCode) {
    setError(null);
    setStatusMessage(null);

    const response = await fetch(
      `/api/applications/${applicationId}/transition`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toStage,
          reason: "Cambio ejecutado desde panel admin.",
        }),
      },
    );

    const body = await response.json();

    if (!response.ok) {
      setError(body);
      return;
    }

    setStatusMessage("Etapa actualizada.");
    await refreshData();
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

  async function loadOcrHistory(
    applicationId: string,
    options?: { forceOpen?: boolean },
  ) {
    setError(null);

    if (!options?.forceOpen && selectedOcrApplicationId === applicationId) {
      setSelectedOcrApplicationId(null);
      setOcrChecks([]);
      return;
    }

    setSelectedOcrApplicationId(applicationId);
    setIsOcrHistoryLoading(true);

    try {
      const response = await fetch(
        `/api/applications/${applicationId}/ocr-check?limit=10`,
      );
      const body = await response.json();

      if (!response.ok) {
        setError(body);
        setOcrChecks([]);
        return;
      }

      setOcrChecks(body.checks ?? []);
    } finally {
      setIsOcrHistoryLoading(false);
    }
  }

  async function runOcrValidation(application: Application) {
    setError(null);
    setStatusMessage(null);

    const fileKey = getDefaultOcrFileKey(application);
    if (!fileKey) {
      setError({
        message: "Esta postulación no tiene archivos para validar con OCR.",
      });
      return;
    }

    setOcrLoadingApplicationId(application.id);

    try {
      const response = await fetch(
        `/api/applications/${application.id}/ocr-check`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileKey }),
        },
      );
      const body = await response.json();

      if (!response.ok) {
        setError(body);
        return;
      }

      setStatusMessage(
        `OCR completado (${Math.round((body.confidence ?? 0) * 100)}% confianza).`,
      );
      await loadOcrHistory(application.id, { forceOpen: true });
    } finally {
      setOcrLoadingApplicationId(null);
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
                  : "applications" === a
                    ? `${filteredApplications.length} resultado(s) filtrados`
                    : "communications" === a
                      ? `${communicationSummary.total} registros`
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
                      applications: "👥",
                      communications: "✉",
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
        <div className={`canvas-body ${activeSection === "applications" ? "full" : "wide"}`}>
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
                        "Personaliza etiquetas, hitos y fechas por etapa. Se incluyen placeholders hasta Stage 6 para planear el flujo completo, aunque el MVP tenga menos etapas activas."
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
          {"applications" === activeSection ? (
            <>
              <div className="settings-card">
                <div className="settings-card-header">
                  <div className="admin-toolbar">
                    <div>
                      <h3>{"Postulaciones"}</h3>
                    </div>
                    <div className="admin-toolbar-actions">
                      <a href={exportCsvHref} className="btn btn-outline">
                        {"Exportar CSV filtrado"}
                      </a>
                      <button onClick={refreshData} className="btn btn-outline">
                        {"Refrescar"}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="candidates-toolbar admin-candidates-toolbar">
                  <input
                    type="text"
                    className="search-input"
                    placeholder="Buscar por nombre, email o documento..."
                    value={searchQuery}
                    onChange={(a) => setSearchQuery(a.target.value)}
                  />
                  <div className="filters-group admin-candidates-filters">
                    <select
                      className="filter-select"
                      value={stageFilter}
                      onChange={(a) => setStageFilter(a.target.value as StageFilter)}
                    >
                      <option value="all">{"Todas las etapas"}</option>
                      <option value="documents">{"1. Documentos"}</option>
                      <option value="exam_placeholder">{"2. Examen"}</option>
                    </select>
                    <select
                      className="filter-select"
                      value={statusFilter}
                      onChange={(a) => {
                        const b = a.target.value as StatusFilter;
                        setStatusFilter(b);
                        if (b !== "all") {
                          setEligibilityFilter("all");
                        }
                      }}
                    >
                      <option value="all">{"Todos los estados"}</option>
                      <option value="draft">{"Borrador"}</option>
                      <option value="submitted">{"Enviada"}</option>
                      <option value="eligible">{"Elegible"}</option>
                      <option value="ineligible">{"No elegible"}</option>
                      <option value="advanced">{"Avanzada"}</option>
                    </select>
                    <select
                      className="filter-select"
                      value={eligibilityFilter}
                      onChange={(a) => {
                        const b = a.target.value as EligibilityFilter;
                        setEligibilityFilter(b);
                        if (b !== "all") {
                          setStatusFilter("all");
                        }
                      }}
                    >
                      <option value="all">{"Todas las elegibilidades"}</option>
                      <option value="pending">{"Pendiente de decisión"}</option>
                      <option value="eligible">{"Elegible"}</option>
                      <option value="ineligible">{"No elegible"}</option>
                      <option value="advanced">{"Avanzada"}</option>
                    </select>
                  </div>
                </div>

                <div className="table-container">
                  <table className="candidates-table admin-candidates-table">
                    <thead>
                      <tr>
                        <th>{"Candidato"}</th>
                        <th>{"Región"}</th>
                        <th>{"Etapa actual"}</th>
                        <th>{"Estado"}</th>
                        <th>{"Última actividad"}</th>
                        <th>{"Acciones"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredApplications.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="admin-empty-cell">
                            {"No hay postulaciones para los filtros seleccionados."}
                          </td>
                        </tr>
                      ) : (
                        filteredApplications.map((a, index) => {
                          const avatarToneClass =
                            index % 3 === 0
                              ? "tone-blue"
                              : index % 3 === 1
                                ? "tone-maroon"
                                : "tone-green";

                          return (
                            <tr key={a.id}>
                              <td>
                                <div className="candidate-name">
                                  <div className={`candidate-avatar ${avatarToneClass}`}>
                                    {getApplicationInitials(a)}
                                  </div>
                                  <div>
                                    <div>{getApplicationDisplayName(a)}</div>
                                    <div className="candidate-email">
                                      {getApplicationDisplayEmail(a)}
                                    </div>
                                    <div className="candidate-email admin-mono">
                                      {a.id.slice(0, 8)}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td>{getApplicationRegion(a)}</td>
                              <td>
                                <span className="status-pill progress admin-stage-pill">
                                  {getStageLabel(a.stage_code)}
                                </span>
                              </td>
                              <td>
                                <span className={`status-pill ${getStatusPillClass(a.status)}`}>
                                  {getStatusDisplayLabel(a.status)}
                                </span>
                              </td>
                              <td>{new Date(a.updated_at).toLocaleString()}</td>
                              <td>
                                <div className="admin-application-actions">
                                  <div className="admin-application-actions-row">
                                    <button
                                      className="btn btn-outline admin-btn-success"
                                      onClick={() => validateApplication(a.id, "eligible")}
                                    >
                                      {"Elegible"}
                                    </button>
                                    <button
                                      className="btn btn-outline admin-btn-warning"
                                      onClick={() => validateApplication(a.id, "ineligible")}
                                    >
                                      {"No elegible"}
                                    </button>
                                  </div>

                                  <div className="admin-application-actions-row">
                                    <select
                                      className="filter-select admin-inline-select"
                                      value={a.stage_code}
                                      onChange={(b) =>
                                        transition(a.id, b.target.value as StageCode)
                                      }
                                    >
                                      <option value="documents">{getStageShortLabel("documents")}</option>
                                      <option
                                        value="exam_placeholder"
                                        disabled={
                                          !canTransition({
                                            fromStage: a.stage_code,
                                            toStage: "exam_placeholder",
                                            status: a.status,
                                          })
                                        }
                                      >
                                        {getStageShortLabel("exam_placeholder")}
                                      </option>
                                    </select>
                                    <button
                                      className="btn btn-ghost admin-maroon-text"
                                      onClick={() => void loadOcrHistory(a.id)}
                                    >
                                      {selectedOcrApplicationId === a.id ? "Ocultar OCR" : "Ver OCR"}
                                    </button>
                                  </div>

                                  <div className="admin-application-actions-row">
                                    <button
                                      className="btn btn-outline"
                                      onClick={() => void runOcrValidation(a)}
                                      disabled={
                                        !getDefaultOcrFileKey(a) ||
                                        ocrLoadingApplicationId === a.id
                                      }
                                    >
                                      {ocrLoadingApplicationId === a.id ? "OCR..." : "OCR"}
                                    </button>
                                    <a
                                      href={`/api/exports?applicationId=${a.id}`}
                                      className="btn btn-ghost"
                                    >
                                      {"Exportar JSON"}
                                    </a>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              {selectedOcrApplicationId ? (
                <div
                  className="settings-card"
                  style={{
                    marginTop: "24px",
                  }}
                >
                  <div className="settings-card-header">
                    <h3>{"Historial OCR"}</h3>
                    <p>
                      {"Postulación seleccionada: "}
                      <span
                        style={{
                          fontFamily: "monospace",
                        }}
                      >
                        {selectedOcrApplicationId.slice(0, 8)}
                      </span>
                    </p>
                  </div>
                  {isOcrHistoryLoading ? (
                    <p
                      style={{
                        color: "var(--muted)",
                      }}
                    >
                      {"Cargando historial OCR..."}
                    </p>
                  ) : 0 === ocrChecks.length ? (
                    <p
                      style={{
                        color: "var(--muted)",
                      }}
                    >
                      {"Aún no existen validaciones OCR para esta postulación."}
                    </p>
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "12px",
                      }}
                    >
                      {ocrChecks.map((a) => (
                        <div
                          key={a.id}
                          style={{
                            border: "1px solid var(--sand)",
                            borderRadius: "var(--radius)",
                            padding: "16px",
                            background: "var(--paper)",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              marginBottom: "8px",
                            }}
                          >
                            <span
                              style={{
                                fontFamily: "monospace",
                                fontSize: "0.85rem",
                              }}
                            >
                              {new Date(a.created_at).toLocaleString()}
                            </span>
                            <span className="status-pill complete">
                              {"Confianza "}
                              {Math.round(100 * a.confidence)}
                              {"%"}
                            </span>
                          </div>
                          <div
                            style={{
                              fontSize: "0.85rem",
                              color: "var(--muted)",
                              marginBottom: "8px",
                            }}
                          >
                            {"Archivo: "}
                            {a.file_key}
                          </div>
                          <p
                            style={{
                              fontSize: "0.9rem",
                            }}
                          >
                            {a.summary}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </>
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
            </>
          ) : null}
        </div>
      </main>
    </>
  );
}
