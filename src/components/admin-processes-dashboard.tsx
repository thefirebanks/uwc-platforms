"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type KeyboardEvent } from "react";
import { useAppLanguage } from "@/components/language-provider";
import type { SelectionProcess } from "@/types/domain";
import { ErrorCallout } from "@/components/error-callout";
import { fetchApi, toNormalizedApiError } from "@/lib/client/api-client";

type ProcessSummary = SelectionProcess & {
  applicationCount: number;
  primaryStageEditorId?: string | null;
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
  const [name, setName] = useState(
    t("adminProcesses.defaultName", { year: initialYear }),
  );
  const [year, setYear] = useState(initialYear);
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
      const body = await fetchApi<{ cycle: SelectionProcess }>("/api/cycles", {
        method: "POST",
        body: JSON.stringify({
          name,
          year: parsedYear,
          isActive: setAsActive,
        }),
      });

      const created = body.cycle as SelectionProcess;
      setProcesses((current) => [{ ...created, applicationCount: 0 }, ...current]);
      setStatusMessage(t("adminProcesses.createdSuccess"));
      setName(t("adminProcesses.defaultName", { year: parsedYear + 1 }));
      setYear(String(parsedYear + 1));
      setSetAsActive(false);
      setShowCreateForm(false);
      router.refresh();
    } catch (requestError) {
      setError(
        toNormalizedApiError(
          requestError,
          "No se pudo crear el proceso de selección.",
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function activateProcess(id: string) {
    setError(null);
    setStatusMessage(null);

    try {
      const body = await fetchApi<{ cycle: SelectionProcess }>(
        `/api/cycles/${id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ isActive: true }),
        },
      );
      const updated = body.cycle as SelectionProcess;
      setProcesses((current) =>
        current.map((process) =>
          process.id === id
            ? { ...process, is_active: true }
            : { ...process, is_active: false },
        ),
      );
      setStatusMessage(t("adminProcesses.updatedActive", { name: updated.name }));
      router.refresh();
    } catch (requestError) {
      setError(
        toNormalizedApiError(
          requestError,
          "No se pudo activar el proceso seleccionado.",
        ),
      );
    }
  }

  function openProcess(id: string, stageId?: string | null) {
    if (stageId) {
      router.push(`/admin/process/${id}/stage/${stageId}`);
      return;
    }

    router.push(`/admin/process/${id}`);
  }

  function handleCardKeyDown(
    event: KeyboardEvent<HTMLElement>,
    processId: string,
  ) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    const process = orderedProcesses.find((candidate) => candidate.id === processId);
    openProcess(processId, process?.primaryStageEditorId ?? null);
  }

  return (
    <main className="main full-width">
      <div className="canvas-header admin-processes-header">
        <div className="canvas-title-row">
          <div>
            <h1 className="admin-processes-title">{t("adminProcesses.title")}</h1>
            <p className="admin-processes-description">{t("adminProcesses.description")}</p>
          </div>
          <button
            type="button"
            className={`btn ${showCreateForm ? "btn-outline" : "btn-primary"}`}
            onClick={() => setShowCreateForm((current) => !current)}
          >
            {showCreateForm ? "Cancelar" : "+ Nuevo Proceso"}
          </button>
        </div>
      </div>

      <div className="canvas-body wide admin-page-stack">
        {error ? (
          <div>
            <ErrorCallout
              message={error.message}
              errorId={error.errorId}
              context="admin_processes"
            />
          </div>
        ) : null}

        {statusMessage ? (
          <div className="admin-feedback success" aria-live="polite">
            {statusMessage}
          </div>
        ) : null}

        {showCreateForm ? (
          <section className="settings-card" aria-labelledby="create-process-title">
            <div className="settings-card-header">
              <h3 id="create-process-title">{t("adminProcesses.create")}</h3>
              <p>
                Crea un nuevo proceso y opcionalmente déjalo activo desde el
                inicio.
              </p>
            </div>

            <div className="editor-grid">
              <div className="form-field">
                <label htmlFor="new-process-name">
                  {t("adminProcesses.processName")}
                </label>
                <input
                  id="new-process-name"
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>

              <div className="form-field">
                <label htmlFor="new-process-year">{t("adminProcesses.year")}</label>
                <input
                  id="new-process-year"
                  type="number"
                  value={year}
                  onChange={(event) => setYear(event.target.value)}
                />
              </div>

              <div className="form-field full">
                <div className="switch-wrapper">
                  <div>
                    <div className="admin-switch-label">
                      {t("adminProcesses.activateOnCreate")}
                    </div>
                  </div>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={setAsActive}
                      onChange={(event) => setSetAsActive(event.target.checked)}
                    />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>
            </div>

            <div className="admin-form-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={createProcess}
                disabled={isSubmitting}
              >
                {t("adminProcesses.createButton")}
              </button>
            </div>
          </section>
        ) : null}

        <div className="process-list-grid">
          {orderedProcesses.map((process) => (
            <article
              key={process.id}
              className={`process-card ${process.is_active ? "active" : ""}`}
              role="button"
              tabIndex={0}
              onClick={() => openProcess(process.id, process.primaryStageEditorId ?? null)}
              onKeyDown={(event) => handleCardKeyDown(event, process.id)}
              aria-label={`Abrir ${process.name}`}
            >
              <div className="process-card-left">
                <div className="process-card-icon" aria-hidden="true">
                  {process.is_active ? "🎯" : "📝"}
                </div>
                <div className="process-card-info">
                  <h3>{process.name}</h3>
                  <p>
                    {process.is_active ? "Activo" : "Inactivo"} •{" "}
                    {t("adminProcesses.applications", {
                      count: process.applicationCount,
                    })}{" "}
                    • Máx {process.max_applications_per_user}
                  </p>
                  <p className="admin-text-muted">
                    Stage 1 cierre: {formatDate(process.stage1_close_at) ?? "—"}
                  </p>
                </div>
              </div>

              <div className="admin-process-card-side">
                <div
                  className={`process-badge ${process.is_active ? "active" : "draft"}`}
                >
                  {process.is_active ? t("state.active") : "Inactivo"}
                </div>

                {!process.is_active ? (
                  <button
                    type="button"
                    className="btn btn-ghost admin-process-inline-action"
                    onClick={(event) => {
                      event.stopPropagation();
                      void activateProcess(process.id);
                    }}
                  >
                    {t("adminProcesses.markActive")}
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
