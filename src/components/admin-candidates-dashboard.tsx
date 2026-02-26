"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";

type AdminCandidateRow = {
  id: string;
  cycleId: string;
  cycleName: string;
  candidateName: string;
  candidateEmail: string;
  region: string;
  stageCode: string;
  status: "draft" | "submitted" | "eligible" | "ineligible" | "advanced";
  updatedAt: string;
};

type CycleOption = {
  id: string;
  name: string;
  isActive: boolean;
};

function getStageLabel(stageCode: AdminCandidateRow["stageCode"]) {
  if (stageCode === "documents") {
    return "1. Formulario Principal";
  }
  if (stageCode === "exam_placeholder") {
    return "2. Examen Académico";
  }
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
  if (status === "ineligible") {
    return "status-pill rejected";
  }
  if (status === "draft") {
    return "status-pill progress";
  }
  return "status-pill complete";
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

function downloadCsv(rows: AdminCandidateRow[]) {
  const header = [
    "candidate_name",
    "candidate_email",
    "cycle_name",
    "region",
    "stage",
    "status",
    "updated_at",
  ];
  const csvRows = rows.map((row) => [
    row.candidateName,
    row.candidateEmail,
    row.cycleName,
    row.region,
    row.stageCode,
    row.status,
    row.updatedAt,
  ]);

  const escapeCell = (value: string) =>
    `"${value.replaceAll("\"", "\"\"")}"`;

  const content = [header, ...csvRows]
    .map((record) => record.map((cell) => escapeCell(String(cell))).join(","))
    .join("\n");

  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "candidatos.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

export function AdminCandidatesDashboard({
  cycleOptions,
  initialRows,
  defaultCycleId,
}: {
  cycleOptions: CycleOption[];
  initialRows: AdminCandidateRow[];
  defaultCycleId: string | "all";
}) {
  const [search, setSearch] = useState("");
  const [cycleFilter, setCycleFilter] = useState<string>(defaultCycleId);
  const [stageFilter, setStageFilter] = useState<"all" | AdminCandidateRow["stageCode"]>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | AdminCandidateRow["status"]>("all");
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

  const filteredRows = useMemo(() => {
    return initialRows.filter((row) => {
      if (cycleFilter !== "all" && row.cycleId !== cycleFilter) {
        return false;
      }
      if (stageFilter !== "all" && row.stageCode !== stageFilter) {
        return false;
      }
      if (statusFilter !== "all" && row.status !== statusFilter) {
        return false;
      }
      if (!deferredSearch) {
        return true;
      }

      const haystack = [
        row.candidateName,
        row.candidateEmail,
        row.region,
        row.id,
        row.cycleName,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(deferredSearch);
    });
  }, [cycleFilter, deferredSearch, initialRows, stageFilter, statusFilter]);

  const visibleCycleName =
    cycleFilter === "all"
      ? "Todos los procesos"
      : cycleOptions.find((cycle) => cycle.id === cycleFilter)?.name ?? "Proceso";

  return (
    <main className="main full-width">
      <div className="canvas-header admin-processes-header">
        <div className="canvas-title-row">
          <div>
            <h1 className="admin-processes-title">Candidatos</h1>
            <p className="admin-processes-description">{visibleCycleName}</p>
          </div>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => downloadCsv(filteredRows)}
          >
            Exportar Excel
          </button>
        </div>
      </div>

      <div className="canvas-body wide admin-page-stack">
        <div className="settings-card">
          <div className="candidates-toolbar admin-candidates-toolbar">
            <input
              type="text"
              className="search-input"
              placeholder="Buscar por nombre, email o DNI..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <div className="filters-group admin-candidates-filters">
              <select
                className="filter-select"
                value={cycleFilter}
                onChange={(event) => setCycleFilter(event.target.value)}
              >
                <option value="all">Todos los procesos</option>
                {cycleOptions.map((cycle) => (
                  <option key={cycle.id} value={cycle.id}>
                    {cycle.name}
                  </option>
                ))}
              </select>
              <select
                className="filter-select"
                value={stageFilter}
                onChange={(event) =>
                  setStageFilter(event.target.value as "all" | AdminCandidateRow["stageCode"])
                }
              >
                <option value="all">Todas las etapas</option>
                <option value="documents">2. Formulario Principal</option>
                <option value="exam_placeholder">3. Examen Académico</option>
              </select>
              <select
                className="filter-select"
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as "all" | AdminCandidateRow["status"])
                }
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

          <div className="table-container">
            <table className="candidates-table admin-candidates-table">
              <thead>
                <tr>
                  <th>Candidato</th>
                  <th>Región</th>
                  <th>Etapa actual</th>
                  <th>Estado</th>
                  <th>Última actividad</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="admin-empty-cell">
                      No hay candidatos para los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row, index) => (
                    <tr key={row.id}>
                      <td>
                        <div className="candidate-name">
                          <div className={`candidate-avatar ${getAvatarTone(index)}`}>
                            {getInitials(row.candidateName).toUpperCase()}
                          </div>
                          <div>
                            <div>{row.candidateName}</div>
                            <div className="candidate-email">{row.candidateEmail}</div>
                          </div>
                        </div>
                      </td>
                      <td>{row.region}</td>
                      <td>{getStageLabel(row.stageCode)}</td>
                      <td>
                        <span className={getStatusClass(row.status)}>
                          {getStatusLabel(row.status)}
                        </span>
                      </td>
                      <td>{new Date(row.updatedAt).toLocaleString()}</td>
                      <td>
                        <Link
                          href={`/admin/process/${row.cycleId}?section=applications`}
                          className="btn btn-ghost"
                        >
                          Ver Perfil
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}

export type { AdminCandidateRow, CycleOption };
