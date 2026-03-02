"use client";

import { useEffect, useState } from "react";

type AssignmentApplication = {
  id: string;
  applicant_id: string;
  cycle_id: string;
  stage_code: string;
  status: string;
} | null;

type Assignment = {
  id: string;
  reviewer_id: string;
  application_id: string;
  cycle_id: string;
  stage_code: string;
  assigned_by: string;
  assigned_at: string;
  application: AssignmentApplication;
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Borrador",
  submitted: "Enviado",
  advanced: "Avanzado",
  eligible: "Elegible",
  ineligible: "No elegible",
};

const STATUS_COLOR: Record<string, string> = {
  draft: "var(--muted)",
  submitted: "var(--uwc-blue)",
  advanced: "var(--success)",
  eligible: "var(--success)",
  ineligible: "var(--danger)",
};

const STATUS_BG: Record<string, string> = {
  draft: "var(--sand-light)",
  submitted: "var(--uwc-blue-soft)",
  advanced: "var(--success-soft)",
  eligible: "var(--success-soft)",
  ineligible: "var(--danger-soft)",
};

const STAGE_LABEL: Record<string, string> = {
  documents: "Documentos",
  interviews: "Entrevistas",
  final: "Final",
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function ReviewerDashboard() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/reviewer/assignments");
        if (!res.ok) {
          const json = (await res.json()) as { userMessage?: string };
          setError(json.userMessage ?? "Error al cargar las asignaciones.");
          return;
        }
        const json = (await res.json()) as { assignments: Assignment[] };
        setAssignments(json.assignments);
      } catch {
        setError("Error de conexión. Intenta nuevamente.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  if (loading) {
    return (
      <div style={{ color: "var(--muted)", padding: "32px 0", textAlign: "center" }}>
        Cargando asignaciones...
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          padding: "16px",
          background: "var(--danger-soft)",
          color: "var(--danger)",
          borderRadius: "8px",
        }}
      >
        {error}
      </div>
    );
  }

  if (assignments.length === 0) {
    return (
      <div
        style={{
          padding: "48px 32px",
          textAlign: "center",
          color: "var(--muted)",
          background: "var(--surface)",
          borderRadius: "12px",
          border: "1px solid var(--border)",
        }}
      >
        No tienes postulaciones asignadas en este momento.
      </div>
    );
  }

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "12px",
        overflow: "hidden",
      }}
    >
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "var(--sand-light)" }}>
            {["ID de Postulación", "Etapa", "Estado", "Asignado el"].map((col) => (
              <th
                key={col}
                style={{
                  padding: "12px 16px",
                  textAlign: "left",
                  fontSize: "11px",
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "var(--muted)",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {assignments.map((a, idx) => {
            const app = a.application;
            const status = app?.status ?? "unknown";
            return (
              <tr
                key={a.id}
                style={{
                  borderBottom:
                    idx < assignments.length - 1
                      ? "1px solid var(--border)"
                      : "none",
                }}
              >
                <td
                  style={{
                    padding: "14px 16px",
                    fontSize: "13px",
                    fontFamily: "var(--font-mono, monospace)",
                    color: "var(--ink)",
                  }}
                >
                  {a.application_id.slice(0, 8)}...
                </td>
                <td style={{ padding: "14px 16px", fontSize: "13px", color: "var(--ink)" }}>
                  {STAGE_LABEL[a.stage_code] ?? a.stage_code}
                </td>
                <td style={{ padding: "14px 16px" }}>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "3px 10px",
                      borderRadius: "100px",
                      fontSize: "12px",
                      fontWeight: 600,
                      color: STATUS_COLOR[status] ?? "var(--ink)",
                      background: STATUS_BG[status] ?? "var(--sand-light)",
                    }}
                  >
                    {STATUS_LABEL[status] ?? status}
                  </span>
                </td>
                <td
                  style={{
                    padding: "14px 16px",
                    fontSize: "13px",
                    color: "var(--muted)",
                  }}
                >
                  {formatDate(a.assigned_at)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
