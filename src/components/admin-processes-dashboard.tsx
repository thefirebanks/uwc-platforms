"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useAppLanguage } from "@/components/language-provider";
import type { SelectionProcess } from "@/types/domain";
import { ErrorCallout } from "@/components/error-callout";

type ProcessSummary = SelectionProcess & {
  applicationCount: number;
};

interface ApiError {
  message: string;
  errorId?: string;
}

function formatDate(value: string | null) {
  if (!value) {
    return null;
  }
  return new Date(value).toLocaleDateString();
}

export function AdminProcessesDashboard({
  initialProcesses,
}: {
  initialProcesses: ProcessSummary[];
}) {
  const { t } = useAppLanguage();
  const router = useRouter();
  const [processes, setProcesses] = useState(initialProcesses);
  const initialYear = String(new Date().getFullYear() + 1);
  const [name, setName] = useState(t("adminProcesses.defaultName", { year: initialYear }));
  const [year, setYear] = useState(String(new Date().getFullYear() + 1));
  const [setAsActive, setSetAsActive] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const orderedProcesses = useMemo(
    () =>
      [...processes].sort((a, b) => {
        if (a.is_active !== b.is_active) {
          return a.is_active ? -1 : 1;
        }
        return b.created_at.localeCompare(a.created_at);
      }),
    [processes],
  );

  async function createProcess() {
    setError(null);
    setStatusMessage(null);
    setIsSubmitting(true);

    try {
      const parsedYear = Number.parseInt(year, 10);
      const response = await fetch("/api/cycles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          year: parsedYear,
          isActive: setAsActive,
        }),
      });
      const body = await response.json();

      if (!response.ok) {
        setError(body);
        return;
      }

      const created = body.cycle as SelectionProcess;
      setProcesses((current) => [{ ...created, applicationCount: 0 }, ...current]);
      setStatusMessage(t("adminProcesses.createdSuccess"));
      setName(t("adminProcesses.defaultName", { year: parsedYear + 1 }));
      setYear(String(parsedYear + 1));
      setSetAsActive(false);
      setShowCreateForm(false);
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  async function activateProcess(id: string) {
    setError(null);
    setStatusMessage(null);

    const response = await fetch(`/api/cycles/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: true }),
    });
    const body = await response.json();

    if (!response.ok) {
      setError(body);
      return;
    }

    const updated = body.cycle as SelectionProcess;
    setProcesses((current) =>
      current.map((process) =>
        process.id === id ? { ...process, is_active: true } : { ...process, is_active: false },
      ),
    );
    setStatusMessage(t("adminProcesses.updatedActive", { name: updated.name }));
    router.refresh();
  }

  return (
    <main className="main full-width">
      <div className="canvas-header" style={{ borderBottom: "none", paddingBottom: "16px" }}>
        <div className="canvas-title-row">
          <div>
            <h1 style={{ fontSize: "2rem" }}>{t("adminProcesses.title")}</h1>
            <p style={{ fontSize: "1rem" }}>{t("adminProcesses.description")}</p>
          </div>
          <button 
            className={`btn ${showCreateForm ? 'btn-outline' : 'btn-primary'}`} 
            onClick={() => setShowCreateForm(!showCreateForm)}
          >
            {showCreateForm ? 'Cancelar' : '+ Nuevo Proceso'}
          </button>
        </div>
      </div>

      <div className="canvas-body wide">
        {error ? (
          <div style={{ marginBottom: "24px" }}>
            <ErrorCallout message={error.message} errorId={error.errorId} context="admin_processes" />
          </div>
        ) : null}

        {statusMessage ? (
          <div style={{ padding: "12px", borderRadius: "8px", background: "var(--success-soft)", border: "1px solid var(--success)", color: "var(--success)", fontWeight: 500, marginBottom: "24px" }}>
            {statusMessage}
          </div>
        ) : null}

        {showCreateForm && (
          <div className="settings-card">
            <div className="settings-card-header">
              <h3>{t("adminProcesses.create")}</h3>
              <p>Crea un nuevo proceso y opcionalmente déjalo activo desde el inicio.</p>
            </div>
            <div className="editor-grid">
              <div className="form-field">
                <label>{t("adminProcesses.processName")}</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="form-field">
                <label>{t("adminProcesses.year")}</label>
                <input type="number" value={year} onChange={(e) => setYear(e.target.value)} />
              </div>
              <div className="form-field full">
                <div className="switch-wrapper" style={{ borderColor: "var(--sand)", background: "var(--surface)" }}>
                  <div>
                    <div style={{ fontSize: "0.85rem", fontWeight: 500, color: "var(--ink)" }}>{t("adminProcesses.activateOnCreate")}</div>
                  </div>
                  <label className="switch">
                    <input type="checkbox" checked={setAsActive} onChange={(e) => setSetAsActive(e.target.checked)} />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>
            </div>
            <div style={{ textAlign: "right", marginTop: "24px" }}>
              <button 
                className="btn btn-primary" 
                onClick={createProcess} 
                disabled={isSubmitting}
              >
                {t("adminProcesses.createButton")}
              </button>
            </div>
          </div>
        )}

        <div className="process-list-grid">
          {orderedProcesses.map((process) => (
            <div 
              key={process.id} 
              className={`process-card ${process.is_active ? "active" : ""}`}
              onClick={() => router.push(`/admin/process/${process.id}`)}
            >
              <div className="process-card-left">
                <div className="process-card-icon">{process.is_active ? "🎯" : "📝"}</div>
                <div className="process-card-info">
                  <h3>{process.name}</h3>
                  <p>
                    {process.is_active ? "Activo" : "Inactivo"} • {t("adminProcesses.applications", { count: process.applicationCount })} • Máx {process.max_applications_per_user}
                  </p>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "8px" }}>
                <div className={`process-badge ${process.is_active ? "active" : "draft"}`}>
                  {process.is_active ? t("state.active") : "Inactivo"}
                </div>
                {!process.is_active && (
                  <button 
                    className="btn btn-ghost" 
                    style={{ fontSize: "0.7rem", padding: "4px 8px" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      activateProcess(process.id);
                    }}
                  >
                    {t("adminProcesses.markActive")}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
