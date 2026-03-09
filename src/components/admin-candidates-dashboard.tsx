"use client";

import { useCallback, useDeferredValue, useEffect, useRef, useState } from "react";
import { AdminExportBuilder } from "./admin-export-builder";
import { AdminApplicationViewer } from "./admin-application-viewer";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

type AdminCandidateRow = {
  id: string;
  cycleId: string;
  cycleName: string;
  applicantId: string;
  candidateName: string;
  candidateEmail: string;
  region: string;
  stageCode: string;
  status: "draft" | "submitted" | "eligible" | "ineligible" | "advanced";
  reviewOutcome: "eligible" | "not_eligible" | "needs_review" | null;
  reviewEvaluatedAt: string | null;
  updatedAt: string;
};

type CycleOption = {
  id: string;
  name: string;
  isActive: boolean;
};

type CandidatesView = "list" | "export";

type SearchResult = {
  rows: AdminCandidateRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

type Stage1Blocker = {
  code: string;
  label: string;
  detail: string;
  count: number;
};

type Stage1FunnelApplication = {
  applicationId: string;
  status: AdminCandidateRow["status"];
  blockers: Stage1Blocker[];
  blockerCodes: string[];
  isReadyForReview: boolean;
};

type Stage1FunnelSummary = {
  totalApplications: number;
  readyForReview: number;
  blocked: number;
  notSubmitted: number;
  missingRequiredFields: number;
  missingRequiredFiles: number;
  recommendationsNotRequested: number;
  recommendationsPending: number;
};

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function getStageLabel(stageCode: string) {
  if (stageCode === "documents") return "1. Formulario Principal";
  if (stageCode === "exam_placeholder") return "2. Examen Academico";
  return "Etapa personalizada";
}

function getStatusLabel(status: AdminCandidateRow["status"]) {
  switch (status) {
    case "draft":
      return "En progreso";
    case "submitted":
      return "Submitted";
    case "eligible":
      return "Completado";
    case "ineligible":
      return "No elegible";
    case "advanced":
      return "Completado";
    default:
      return status;
  }
}

function getStatusClass(status: AdminCandidateRow["status"]) {
  if (status === "ineligible") return "status-pill rejected";
  if (status === "draft") return "status-pill progress";
  return "status-pill complete";
}

function getReviewOutcomeLabel(outcome: AdminCandidateRow["reviewOutcome"]) {
  if (outcome === "eligible") return "Elegible";
  if (outcome === "not_eligible") return "No elegible";
  if (outcome === "needs_review") return "Revisión manual";
  return "Sin dictamen";
}

function getReviewOutcomeClass(outcome: AdminCandidateRow["reviewOutcome"]) {
  if (outcome === "eligible") return "status-pill complete";
  if (outcome === "not_eligible") return "status-pill rejected";
  if (outcome === "needs_review") return "status-pill progress";
  return "status-pill admin-chip-neutral";
}

function getAvatarTone(index: number) {
  if (index % 3 === 0) return "tone-blue";
  if (index % 3 === 1) return "tone-maroon";
  return "tone-green";
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? "A") + (parts[1]?.[0] ?? "");
}

/* -------------------------------------------------------------------------- */
/*  Sort icon                                                                 */
/* -------------------------------------------------------------------------- */

function SortIcon({ active, direction }: { active: boolean; direction: "asc" | "desc" }) {
  if (!active) {
    return (
      <span style={{ opacity: 0.3, marginLeft: "4px", fontSize: "0.6875rem" }}>
        {"↕"}
      </span>
    );
  }
  return (
    <span style={{ marginLeft: "4px", fontSize: "0.6875rem" }}>
      {direction === "asc" ? "↑" : "↓"}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main Component                                                            */
/* -------------------------------------------------------------------------- */

export function AdminCandidatesDashboard({
  cycleOptions,
  defaultCycleId,
  defaultSearch = "",
  defaultView = "list",
  focusApplicationId = "",
}: {
  cycleOptions: CycleOption[];
  defaultCycleId: string | "all";
  defaultSearch?: string;
  defaultView?: CandidatesView;
  focusApplicationId?: string;
}) {
  /* ---- State ---- */
  const [activeView, setActiveView] = useState<CandidatesView>(defaultView);
  const [search, setSearch] = useState(defaultSearch);
  const [cycleFilter, setCycleFilter] = useState<string>(defaultCycleId);
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [sortBy, setSortBy] = useState<string>("updated_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const [rows, setRows] = useState<AdminCandidateRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [stage1Summary, setStage1Summary] = useState<Stage1FunnelSummary | null>(null);
  const [stage1ByApplication, setStage1ByApplication] = useState<Record<string, Stage1FunnelApplication>>({});
  const [stage1Loading, setStage1Loading] = useState(false);
  const [fetchTrigger, setFetchTrigger] = useState(0);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [rubricRunning, setRubricRunning] = useState(false);
  const [rubricMessage, setRubricMessage] = useState<string | null>(null);
  const [rubricMessageTone, setRubricMessageTone] = useState<"success" | "error">("success");

  // Drawer
  const [viewerApplicationId, setViewerApplicationId] = useState<string | null>(
    focusApplicationId || null,
  );

  useEffect(() => {
    if (loading || !viewerApplicationId) {
      return;
    }

    const existsInCurrentRows = rows.some((row) => row.id === viewerApplicationId);
    if (!existsInCurrentRows) {
      setViewerApplicationId(null);
    }
  }, [loading, rows, viewerApplicationId]);

  const deferredSearch = useDeferredValue(search.trim());

  // Reset to page 1 when filters change
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setPage(1);
    setSelectedIds(new Set());
  }, [cycleFilter, deferredSearch, stageFilter, statusFilter, sortBy, sortOrder]);

  /* ---- Data fetching ---- */
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setFetchError(null);

    const params = new URLSearchParams();
    if (cycleFilter !== "all") params.set("cycleId", cycleFilter);
    if (deferredSearch) params.set("q", deferredSearch);
    if (stageFilter !== "all") params.set("stageCode", stageFilter);
    if (statusFilter !== "all") params.set("status", statusFilter);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    params.set("sortBy", sortBy);
    params.set("sortOrder", sortOrder);

    void (async () => {
      try {
        const r = await fetch(`/api/applications/search?${params}`, { signal: controller.signal });
        const body = await r.json();
        if (!r.ok) {
          throw new Error(
            typeof body?.userMessage === "string" ? body.userMessage : (body?.message ?? "Error al buscar candidatos"),
          );
        }
        const data = body as SearchResult;
        setRows(data.rows);
        setTotal(data.total);
        setTotalPages(data.totalPages);
        setLoading(false);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        setFetchError(String(err instanceof Error ? err.message : err));
        setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [cycleFilter, deferredSearch, stageFilter, statusFilter, page, sortBy, sortOrder, fetchTrigger]);

  useEffect(() => {
    if (cycleFilter === "all") {
      setStage1Summary(null);
      setStage1ByApplication({});
      return;
    }

    const controller = new AbortController();
    setStage1Loading(true);

    fetch(`/api/applications/stage1-funnel?cycleId=${cycleFilter}`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Stage 1 funnel failed");
        }
        return response.json();
      })
      .then((body: { summary: Stage1FunnelSummary; applications: Stage1FunnelApplication[] }) => {
        setStage1Summary(body.summary);
        setStage1ByApplication(
          Object.fromEntries(body.applications.map((entry) => [entry.applicationId, entry])),
        );
        setStage1Loading(false);
      })
      .catch((error) => {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        setStage1Loading(false);
      });

    return () => controller.abort();
  }, [cycleFilter, fetchTrigger]);

  /* ---- Sort handler ---- */
  const handleSort = useCallback(
    (column: string) => {
      if (sortBy === column) {
        setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
      } else {
        setSortBy(column);
        setSortOrder(column === "full_name" ? "asc" : "desc");
      }
    },
    [sortBy],
  );

  /* ---- Bulk selection handlers ---- */
  const allOnPageSelected =
    rows.length > 0 && rows.every((r) => selectedIds.has(r.id));

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        for (const r of rows) next.delete(r.id);
      } else {
        for (const r of rows) next.add(r.id);
      }
      return next;
    });
  }, [allOnPageSelected, rows]);

  const toggleSelectRow = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /* ---- Bulk transition handler ---- */
  const handleBulkTransition = useCallback(
    async (fromStage: string, toStage: string) => {
      const filterCycle = cycleFilter !== "all" ? cycleFilter : null;
      if (!filterCycle) {
        setBulkMessage("Selecciona un proceso antes de realizar una accion masiva.");
        return;
      }

      const reason = window.prompt("Motivo del cambio de etapa masivo:");
      if (!reason || reason.length < 4) return;

      setBulkLoading(true);
      setBulkMessage(null);
      try {
        const res = await fetch("/api/applications/bulk-transition", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cycleId: filterCycle,
            fromStage,
            toStage,
            statusFilter: ["eligible", "advanced"],
            reason,
          }),
        });
        if (!res.ok) throw new Error("Bulk transition failed");
        const { result } = await res.json();
        setBulkMessage(
          `${result.transitioned} avanzados, ${result.skipped} omitidos, ${result.errors.length} errores.`,
        );
        setSelectedIds(new Set());
        setFetchTrigger((current) => current + 1);
      } catch {
        setBulkMessage("Error al realizar la transicion masiva.");
      } finally {
        setBulkLoading(false);
      }
    },
    [cycleFilter],
  );

  /* ---- Refresh callback for the drawer ---- */
  const handleApplicationUpdated = useCallback(() => {
    setFetchTrigger((n) => n + 1);
  }, []);

  const handleRunRubric = useCallback(async () => {
    if (cycleFilter === "all") {
      setRubricMessage("Selecciona un proceso para ejecutar la rúbrica automática.");
      setRubricMessageTone("error");
      return;
    }

    const targetStage = stageFilter !== "all" ? stageFilter : "documents";
    setRubricRunning(true);
    setRubricMessage(null);
    setRubricMessageTone("success");

    try {
      const response = await fetch("/api/applications/rubric-evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cycleId: cycleFilter,
          stageCode: targetStage,
          trigger: "manual",
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          typeof body?.message === "string"
            ? body.message
            : typeof body?.userMessage === "string"
              ? body.userMessage
              : "No se pudo ejecutar la rúbrica automática.",
        );
      }

      setRubricMessage(
        `${body.result.evaluated} evaluadas: ${body.result.outcomes.eligible} elegibles, ${body.result.outcomes.not_eligible} no elegibles, ${body.result.outcomes.needs_review} a revisión.`,
      );
      setRubricMessageTone("success");
      setFetchTrigger((current) => current + 1);
    } catch (error) {
      setRubricMessage(error instanceof Error ? error.message : "Error ejecutando la rúbrica.");
      setRubricMessageTone("error");
    } finally {
      setRubricRunning(false);
    }
  }, [cycleFilter, stageFilter]);

  /* ---- Derived ---- */
  const visibleCycleName =
    cycleFilter === "all"
      ? "Todos los procesos"
      : cycleOptions.find((c) => c.id === cycleFilter)?.name ?? "Proceso";
  const exportCycleId = cycleFilter !== "all" ? cycleFilter : undefined;

  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  return (
    <main className="main full-width">
      <div className="canvas-header admin-processes-header">
        <div className="canvas-title-row">
          <div>
            <h1 className="admin-processes-title">Candidatos</h1>
            <p className="admin-processes-description">
              {visibleCycleName}
              {total > 0 && activeView === "list" ? (
                <span style={{ marginLeft: "0.5rem", fontWeight: 400 }}>
                  ({total} candidato{total !== 1 ? "s" : ""})
                </span>
              ) : null}
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
            <div
              role="tablist"
              aria-label="Vistas de candidatos"
              style={{
                display: "inline-flex",
                gap: "0.35rem",
                padding: "0.25rem",
                border: "1px solid var(--sand)",
                borderRadius: "999px",
                background: "rgba(255,255,255,0.03)",
              }}
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeView === "list"}
                className={`btn ${activeView === "list" ? "btn-primary" : "btn-ghost"}`}
                style={{ borderRadius: "999px" }}
                onClick={() => setActiveView("list")}
              >
                Listado
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeView === "export"}
                className={`btn ${activeView === "export" ? "btn-primary" : "btn-ghost"}`}
                style={{ borderRadius: "999px" }}
                onClick={() => setActiveView("export")}
              >
                Exportar datos
              </button>
            </div>
            {activeView === "list" && selectedIds.size > 0 ? (
              <span
                style={{
                  fontSize: "0.8125rem",
                  color: "var(--uwc-maroon, #800020)",
                  fontWeight: 600,
                }}
              >
                {selectedIds.size} seleccionado{selectedIds.size !== 1 ? "s" : ""}
              </span>
            ) : null}
            {activeView === "list" ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void handleRunRubric()}
                disabled={rubricRunning || cycleFilter === "all"}
                title={cycleFilter === "all" ? "Selecciona un proceso para ejecutar." : undefined}
              >
                {rubricRunning ? "Ejecutando rúbrica..." : "Ejecutar rúbrica automática"}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="canvas-body wide admin-page-stack">
        {activeView === "list" && cycleFilter !== "all" && stage1Summary ? (
          <div className="dashboard-grid">
            <div className="stat-card">
              <div className="stat-title">{"Stage 1 total"}</div>
              <div className="stat-value">{stage1Summary.totalApplications}</div>
              <div className="stat-trend neutral">{"Formulario Principal"}</div>
            </div>
            <div className="stat-card">
              <div className="stat-title">{"Listas para revisión"}</div>
              <div className="stat-value">{stage1Summary.readyForReview}</div>
              <div className="stat-trend">{"Sin bloqueos activos"}</div>
            </div>
            <div className="stat-card">
              <div className="stat-title">{"Campos / archivos faltantes"}</div>
              <div className="stat-value">
                {stage1Summary.missingRequiredFields}
                {" / "}
                {stage1Summary.missingRequiredFiles}
              </div>
              <div className="stat-trend neutral">{"Campos y documentos obligatorios"}</div>
            </div>
            <div className="stat-card">
              <div className="stat-title">{"Recomendaciones bloqueadas"}</div>
              <div className="stat-value">
                {stage1Summary.recommendationsNotRequested + stage1Summary.recommendationsPending}
              </div>
              <div className="stat-trend neutral">{"Pendientes de solicitar o recibir"}</div>
            </div>
          </div>
        ) : null}
        <div className="settings-card">
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.75rem",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "1rem",
            }}
          >
            <div>
              <div style={{ fontSize: "1rem", fontWeight: 700 }}>
                {activeView === "export" ? "Exportar postulaciones" : "Listado de candidatos"}
              </div>
              <div className="muted-text" style={{ marginTop: "0.25rem" }}>
                {activeView === "export"
                  ? "Genera exportaciones filtradas, manuales o aleatorias desde la vista de candidatos."
                  : "Busca, revisa y ejecuta acciones masivas sobre postulantes."}
              </div>
            </div>
            <label style={{ display: "grid", gap: "0.35rem", minWidth: "min(320px, 100%)" }}>
              <span className="field-label">Proceso</span>
              <select
                className="filter-select"
                value={cycleFilter}
                onChange={(e) => setCycleFilter(e.target.value)}
              >
                <option value="all">Todos los procesos</option>
                {cycleOptions.map((cycle) => (
                  <option key={cycle.id} value={cycle.id}>
                    {cycle.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {activeView === "list" && rubricMessage ? (
            <div className={`admin-feedback ${rubricMessageTone}`} style={{ marginBottom: "12px" }}>
              {rubricMessage}
            </div>
          ) : null}

          {activeView === "list" && cycleFilter !== "all" ? (
            <div className="admin-chip-row" style={{ marginBottom: "16px" }}>
              <span className="status-pill admin-chip-neutral">
                {stage1Loading ? "Actualizando funnel..." : `${stage1Summary?.notSubmitted ?? 0} en borrador`}
              </span>
              <span className="status-pill admin-chip-neutral">
                {`${stage1Summary?.missingRequiredFields ?? 0} con campos faltantes`}
              </span>
              <span className="status-pill admin-chip-neutral">
                {`${stage1Summary?.missingRequiredFiles ?? 0} con archivos faltantes`}
              </span>
            </div>
          ) : null}

          {activeView === "list" ? (
            <>
              <div className="candidates-toolbar admin-candidates-toolbar">
                <input
                  type="text"
                  className="search-input"
                  placeholder="Buscar por nombre, email..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <div className="filters-group admin-candidates-filters">
                  <select
                    className="filter-select"
                    value={stageFilter}
                    onChange={(e) => setStageFilter(e.target.value)}
                  >
                    <option value="all">Todas las etapas</option>
                    <option value="documents">1. Formulario Principal</option>
                    <option value="exam_placeholder">2. Examen Academico</option>
                  </select>
                  <select
                    className="filter-select"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <option value="all">Todos los estados</option>
                    <option value="draft">En progreso</option>
                    <option value="submitted">Submitted</option>
                    <option value="eligible">Completado</option>
                    <option value="ineligible">No elegible</option>
                    <option value="advanced">Avanzado</option>
                  </select>
                </div>
              </div>

              {selectedIds.size > 0 ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    padding: "0.625rem 1rem",
                    marginBottom: "0.75rem",
                    background: "var(--uwc-maroon-soft, #F5E6E6)",
                    borderRadius: "4px",
                    fontSize: "0.8125rem",
                  }}
                >
                  <span style={{ fontWeight: 600, color: "var(--uwc-maroon, #800020)" }}>
                    Acciones masivas:
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ fontSize: "0.8125rem", padding: "0.25rem 0.75rem" }}
                    disabled={bulkLoading}
                    onClick={() => handleBulkTransition("documents", "exam_placeholder")}
                  >
                    Avanzar elegibles (Etapa 1 → 2)
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ fontSize: "0.8125rem", padding: "0.25rem 0.75rem" }}
                    onClick={() => setSelectedIds(new Set())}
                  >
                    Deseleccionar todo
                  </button>
                  {bulkMessage ? (
                    <span style={{ marginLeft: "auto", fontSize: "0.75rem" }}>
                      {bulkMessage}
                    </span>
                  ) : null}
                </div>
              ) : null}

              {fetchError ? (
                <div
                  style={{
                    padding: "0.75rem 1rem",
                    background: "#FEE",
                    color: "#C62828",
                    borderRadius: "4px",
                    marginBottom: "0.75rem",
                    fontSize: "0.875rem",
                  }}
                >
                  {fetchError}
                </div>
              ) : null}

              <div className="table-container">
                <table className="candidates-table admin-candidates-table">
                  <thead>
                    <tr>
                      <th style={{ width: "40px", textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={allOnPageSelected}
                          onChange={toggleSelectAll}
                          aria-label="Seleccionar todo"
                          style={{ cursor: "pointer" }}
                        />
                      </th>
                      <th
                        onClick={() => handleSort("full_name")}
                        style={{ cursor: "pointer", userSelect: "none" }}
                      >
                        Candidato
                        <SortIcon
                          active={sortBy === "full_name"}
                          direction={sortOrder}
                        />
                      </th>
                      <th>Region</th>
                      <th>Etapa actual</th>
                      <th>Blockers</th>
                      <th>Dictamen automático</th>
                      <th>Estado</th>
                      <th
                        onClick={() => handleSort("updated_at")}
                        style={{ cursor: "pointer", userSelect: "none" }}
                      >
                        Ultima actividad
                        <SortIcon
                          active={sortBy === "updated_at"}
                          direction={sortOrder}
                        />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={8} className="admin-empty-cell">
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
                            Buscando candidatos...
                          </span>
                        </td>
                      </tr>
                    ) : rows.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="admin-empty-cell">
                          No hay candidatos para los filtros seleccionados.
                        </td>
                      </tr>
                    ) : (
                      rows.map((row, index) => {
                        const isSelected = selectedIds.has(row.id);
                        const isViewing = viewerApplicationId === row.id;
                        const funnelEntry = stage1ByApplication[row.id];

                        return (
                          <tr
                            key={row.id}
                            className={`admin-candidate-row${isViewing ? " is-focused" : ""}`}
                            data-application-id={row.id}
                            onClick={() => setViewerApplicationId(row.id)}
                            style={{ cursor: "pointer" }}
                          >
                            <td
                              style={{ textAlign: "center" }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelectRow(row.id)}
                                style={{ cursor: "pointer" }}
                                aria-label={`Seleccionar ${row.candidateName}`}
                              />
                            </td>
                            <td>
                              <div className="candidate-name">
                                <div
                                  className={`candidate-avatar ${getAvatarTone(index)}`}
                                >
                                  {getInitials(row.candidateName).toUpperCase()}
                                </div>
                                <div>
                                  <div>{row.candidateName}</div>
                                  <div className="candidate-email">
                                    {row.candidateEmail}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td>{row.region || "—"}</td>
                            <td>{getStageLabel(row.stageCode)}</td>
                            <td>
                              {funnelEntry?.blockers.length ? (
                                <span className="status-pill rejected">
                                  {funnelEntry.blockers.length} bloqueo(s)
                                </span>
                              ) : row.stageCode === "documents" ? (
                                <span className="status-pill complete">Lista</span>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td>
                              <span className={getReviewOutcomeClass(row.reviewOutcome)}>
                                {getReviewOutcomeLabel(row.reviewOutcome)}
                              </span>
                            </td>
                            <td>
                              <span className={getStatusClass(row.status)}>
                                {getStatusLabel(row.status)}
                              </span>
                            </td>
                            <td>{new Date(row.updatedAt).toLocaleString()}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 ? (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "1rem 0.5rem 0.5rem",
                    fontSize: "0.8125rem",
                    color: "var(--muted)",
                  }}
                >
                  <span>
                    Mostrando {rangeStart}–{rangeEnd} de {total} candidato
                    {total !== 1 ? "s" : ""}
                  </span>
                  <div style={{ display: "flex", gap: "0.375rem", alignItems: "center" }}>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ fontSize: "0.8125rem", padding: "0.25rem 0.625rem" }}
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      ← Anterior
                    </button>
                    <span style={{ padding: "0 0.5rem", fontWeight: 600 }}>
                      {page} / {totalPages}
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ fontSize: "0.8125rem", padding: "0.25rem 0.625rem" }}
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    >
                      Siguiente →
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          ) : exportCycleId ? (
            <AdminExportBuilder
              cycleId={exportCycleId}
              stageCode={stageFilter !== "all" ? stageFilter : undefined}
            />
          ) : (
            <div className="muted-text">
              Selecciona un proceso para habilitar la exportación.
            </div>
          )}
        </div>
      </div>

      <AdminApplicationViewer
        applicationId={viewerApplicationId}
        stage1Blockers={viewerApplicationId ? stage1ByApplication[viewerApplicationId]?.blockers ?? [] : []}
        onClose={() => setViewerApplicationId(null)}
        onApplicationUpdated={handleApplicationUpdated}
      />
    </main>
  );
}

export type { AdminCandidateRow, CycleOption };
