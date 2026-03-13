"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchApi,
  toNormalizedApiError,
} from "@/lib/client/api-client";
import type {
  ApplicationExport,
  AdminFileEntry,
  EditLogEntry,
  EvaluationData,
  RubricCriterionResult,
  Stage1Blocker,
  Tab,
} from "@/components/admin-application-viewer-types";
import { ViewerDatosTab } from "@/components/viewer-datos-tab";
import { ViewerArchivosTab } from "@/components/viewer-archivos-tab";
import { ViewerRecomendacionesTab } from "@/components/viewer-recomendaciones-tab";
import { ViewerDictamenTab } from "@/components/viewer-dictamen-tab";
import { ViewerHistorialTab } from "@/components/viewer-historial-tab";

/* -------------------------------------------------------------------------- */
/*  Props                                                                     */
/* -------------------------------------------------------------------------- */

type Props = {
  applicationId: string | null;
  stage1Blockers?: Stage1Blocker[];
  onClose: () => void;
  onApplicationUpdated: () => void;
};

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export function AdminApplicationViewer({
  applicationId,
  stage1Blockers = [],
  onClose,
  onApplicationUpdated,
}: Props) {
  const [data, setData] = useState<ApplicationExport | null>(null);
  const [files, setFiles] = useState<AdminFileEntry[]>([]);
  const [editLog, setEditLog] = useState<EditLogEntry[]>([]);
  const [evaluations, setEvaluations] = useState<EvaluationData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("datos");

  // Validate / Transition state
  const [validating, setValidating] = useState(false);
  const [transitioning, setTransitioning] = useState(false);

  const drawerRef = useRef<HTMLDivElement>(null);

  const loadViewerData = useCallback(async () => {
    if (!applicationId) {
      return;
    }

    const [exportBody, historyBody, filesBody, evaluationBody] = await Promise.all([
      fetchApi<ApplicationExport>(`/api/exports?applicationId=${applicationId}`),
      fetchApi<{ history?: EditLogEntry[] }>(
        `/api/applications/${applicationId}/admin-edit`,
      ).catch(() => null),
      fetchApi<{ files?: AdminFileEntry[] }>(
        `/api/applications/${applicationId}/files`,
      ).catch(() => null),
      fetchApi<{
        evaluations?: Array<
          Omit<EvaluationData, "criteria_results"> & {
            criteria_results: unknown;
          }
        >;
      }>(`/api/applications/${applicationId}/evaluation`).catch(() => null),
    ]);

    setData(exportBody);
    setEditLog(historyBody?.history ?? []);
    setFiles(filesBody?.files ?? []);
    if (evaluationBody?.evaluations) {
      setEvaluations(
        evaluationBody.evaluations.map((ev) => ({
          ...ev,
          criteria_results: Array.isArray(ev.criteria_results)
            ? (ev.criteria_results as RubricCriterionResult[])
            : [],
        })),
      );
    }
  }, [applicationId]);

  /* ---- Fetch data when applicationId changes ---- */
  useEffect(() => {
    if (!applicationId) {
      setData(null);
      setFiles([]);
      setEditLog([]);
      setEvaluations([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    loadViewerData()
      .then(() => {
        if (cancelled) return;
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(toNormalizedApiError(err, "No se pudo cargar la postulación.").message);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [applicationId, loadViewerData]);

  /* ---- Keyboard: Escape closes ---- */
  useEffect(() => {
    if (!applicationId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [applicationId, onClose]);

  /* ---- Validate handler ---- */
  const handleValidate = useCallback(
    async (status: "eligible" | "ineligible") => {
      if (!applicationId) return;
      const notes = window.prompt(
        status === "eligible"
          ? "Notas de elegibilidad (opcional):"
          : "Motivo de no elegibilidad:",
        "",
      );
      if (notes === null) return;

      setValidating(true);
      try {
        const { application } = await fetchApi<{
          application: Partial<ApplicationExport["application"]>;
        }>(
          `/api/applications/${applicationId}/validate`,
          {
            method: "POST",
            body: JSON.stringify({ status, notes: notes || "—" }),
          },
        );
        setData((prev) =>
          prev ? { ...prev, application: { ...prev.application, ...application } } : prev,
        );
        await loadViewerData();
        onApplicationUpdated();
      } catch (requestError) {
        setError(
          toNormalizedApiError(requestError, "No se pudo registrar la validación.").message,
        );
      } finally {
        setValidating(false);
      }
    },
    [applicationId, loadViewerData, onApplicationUpdated],
  );

  /* ---- Transition handler ---- */
  const handleTransition = useCallback(
    async (toStage: string) => {
      if (!applicationId) return;
      const reason = window.prompt("Motivo del cambio de etapa:");
      if (!reason || reason.length < 4) return;

      setTransitioning(true);
      try {
        const { application } = await fetchApi<{
          application: Partial<ApplicationExport["application"]>;
        }>(
          `/api/applications/${applicationId}/transition`,
          {
            method: "POST",
            body: JSON.stringify({ toStage, reason }),
          },
        );
        setData((prev) =>
          prev ? { ...prev, application: { ...prev.application, ...application } } : prev,
        );
        await loadViewerData();
        onApplicationUpdated();
      } catch (requestError) {
        setError(toNormalizedApiError(requestError, "No se pudo cambiar la etapa.").message);
      } finally {
        setTransitioning(false);
      }
    },
    [applicationId, loadViewerData, onApplicationUpdated],
  );

  /* ---- Error callback for child tabs ---- */
  const handleError = useCallback((message: string) => {
    setError(message);
  }, []);

  /* ---- Render ---- */
  if (!applicationId) return null;

  const app = data?.application;

  return (
    <>
      {/* Overlay */}
      <div
        className="viewer-overlay"
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.35)",
          zIndex: 998,
        }}
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        className="viewer-drawer"
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(720px, 90vw)",
          background: "var(--surface, #FFFFFF)",
          boxShadow: "-4px 0 24px rgba(0,0,0,0.12)",
          zIndex: 999,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "1rem 1.5rem",
            borderBottom: "1px solid var(--border, #E5E0DB)",
            display: "flex",
            alignItems: "center",
            gap: "1rem",
            flexShrink: 0,
          }}
        >
          <button
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "1.25rem",
              color: "var(--muted)",
              padding: "0.25rem",
            }}
          >
            ✕
          </button>

          <div style={{ flex: 1, minWidth: 0 }}>
            <h2
              style={{
                margin: 0,
                fontSize: "1.125rem",
                fontWeight: 700,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {data?.applicant?.full_name ?? "Cargando..."}
            </h2>
            <div
              style={{
                fontSize: "0.8125rem",
                color: "var(--muted)",
                marginTop: "0.125rem",
              }}
            >
              {data?.applicant?.email ?? ""}
            </div>
          </div>

          {app && (
            <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
              <span
                className="eyebrow"
                style={{
                  padding: "0.25rem 0.75rem",
                  borderRadius: "2px",
                  fontSize: "0.6875rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  background: "var(--uwc-maroon-soft, #F5E6E6)",
                  color: "var(--uwc-maroon, #800020)",
                }}
              >
                {app.stage_code}
              </span>
              <span
                style={{
                  padding: "0.25rem 0.75rem",
                  borderRadius: "2px",
                  fontSize: "0.6875rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  background:
                    app.status === "eligible"
                      ? "var(--success-soft, #E6F5EA)"
                      : app.status === "ineligible"
                        ? "#FEE"
                        : "var(--cream, #F5F0EB)",
                  color:
                    app.status === "eligible"
                      ? "var(--success, #2E7D32)"
                      : app.status === "ineligible"
                        ? "#C62828"
                        : "var(--muted, #9A9590)",
                }}
              >
                {app.status}
              </span>
            </div>
          )}
        </div>

        {/* Actions bar */}
        {app && (
          <div
            style={{
              padding: "0.75rem 1.5rem",
              borderBottom: "1px solid var(--border, #E5E0DB)",
              display: "flex",
              gap: "0.5rem",
              flexWrap: "wrap",
              flexShrink: 0,
            }}
          >
            <button
              className="btn btn-sm"
              onClick={() => handleValidate("eligible")}
              disabled={validating || app.status === "eligible"}
              style={{
                padding: "0.375rem 0.75rem",
                fontSize: "0.8125rem",
                background: "var(--success-soft)",
                color: "var(--success)",
                border: "1px solid var(--success)",
                cursor: "pointer",
                borderRadius: "2px",
                fontWeight: 600,
              }}
            >
              Elegible
            </button>
            <button
              className="btn btn-sm"
              onClick={() => handleValidate("ineligible")}
              disabled={validating || app.status === "ineligible"}
              style={{
                padding: "0.375rem 0.75rem",
                fontSize: "0.8125rem",
                background: "#FEE",
                color: "#C62828",
                border: "1px solid #C62828",
                cursor: "pointer",
                borderRadius: "2px",
                fontWeight: 600,
              }}
            >
              No Elegible
            </button>

            {app.stage_code === "documents" && (
              <button
                className="btn btn-sm"
                onClick={() => handleTransition("exam_placeholder")}
                disabled={
                  transitioning ||
                  (app.status !== "eligible" && app.status !== "advanced")
                }
                style={{
                  padding: "0.375rem 0.75rem",
                  fontSize: "0.8125rem",
                  background: "var(--uwc-maroon-soft)",
                  color: "var(--uwc-maroon)",
                  border: "1px solid var(--uwc-maroon)",
                  cursor: "pointer",
                  borderRadius: "2px",
                  fontWeight: 600,
                  marginLeft: "auto",
                }}
              >
                Avanzar a Etapa 2 →
              </button>
            )}
          </div>
        )}

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid var(--border, #E5E0DB)",
            flexShrink: 0,
          }}
        >
          {(
            [
              { key: "datos", label: "Datos" },
              { key: "dictamen", label: "Dictamen" },
              { key: "archivos", label: "Archivos" },
              { key: "recomendaciones", label: "Recs." },
              { key: "historial", label: "Historial" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                flex: 1,
                padding: "0.625rem 0.5rem",
                fontSize: "0.8125rem",
                fontWeight: activeTab === tab.key ? 700 : 500,
                color:
                  activeTab === tab.key
                    ? "var(--uwc-maroon)"
                    : "var(--muted)",
                background: "transparent",
                border: "none",
                borderBottom:
                  activeTab === tab.key
                    ? "2px solid var(--uwc-maroon)"
                    : "2px solid transparent",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content area */}
        <div style={{ flex: 1, overflow: "auto", padding: "1.25rem 1.5rem" }}>
          {loading && (
            <div style={{ textAlign: "center", padding: "3rem", color: "var(--muted)" }}>
              Cargando postulación...
            </div>
          )}

          {error && (
            <div
              style={{
                padding: "1rem",
                background: "#FEE",
                color: "#C62828",
                borderRadius: "4px",
                marginBottom: "1rem",
                fontSize: "0.875rem",
              }}
            >
              {error}
              <button
                onClick={() => setError(null)}
                style={{ marginLeft: "0.5rem", cursor: "pointer", background: "none", border: "none", textDecoration: "underline", color: "inherit" }}
              >
                Cerrar
              </button>
            </div>
          )}

          {!loading && data && activeTab === "datos" && (
            <ViewerDatosTab
              data={data}
              stage1Blockers={stage1Blockers}
              onReload={loadViewerData}
              onApplicationUpdated={onApplicationUpdated}
              onError={handleError}
            />
          )}

          {!loading && data && activeTab === "archivos" && (
            <ViewerArchivosTab
              applicationId={data.application.id}
              files={files}
              onReload={loadViewerData}
              onApplicationUpdated={onApplicationUpdated}
              onError={handleError}
            />
          )}

          {!loading && data && activeTab === "recomendaciones" && (
            <ViewerRecomendacionesTab
              recommendations={data.recommendations}
              onReload={loadViewerData}
              onError={handleError}
            />
          )}

          {!loading && data && activeTab === "dictamen" && (
            <ViewerDictamenTab evaluations={evaluations} />
          )}

          {!loading && data && activeTab === "historial" && (
            <ViewerHistorialTab editLog={editLog} />
          )}
        </div>
      </div>
    </>
  );
}
