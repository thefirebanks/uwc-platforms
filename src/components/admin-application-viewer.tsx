"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import type { ApplicationStatus, StageCode } from "@/types/domain";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

type ApplicationExport = {
  application: {
    id: string;
    applicant_id: string;
    cycle_id: string;
    stage_code: StageCode;
    status: ApplicationStatus;
    payload: Record<string, unknown>;
    files: Record<string, unknown>;
    validation_notes: string | null;
    created_at: string;
    updated_at: string;
  };
  applicant: { email: string; full_name: string } | null;
  cycle: { id: string; name: string } | null;
  recommendations: Array<{
    id: string;
    role: string;
    recommender_name: string | null;
    recommender_email: string;
    status: string;
    invite_sent_at: string | null;
    submitted_at: string | null;
    last_reminder_at: string | null;
    reminder_count: number;
    admin_received_at: string | null;
    admin_received_reason: string | null;
    admin_received_file: Record<string, unknown> | null;
    admin_notes: string | null;
  }>;
};

type AdminFileEntry = {
  key: string;
  path: string;
  title: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number | null;
  uploadedAt: string | null;
  category: string | null;
  notes: string | null;
  downloadUrl: string | null;
  aiParserEnabled?: boolean;
};

type ApiError = {
  message: string;
  errorId?: string;
};

type OcrRunResult = {
  summary: string;
  confidence: number;
  createdAt: string;
};

type EditLogEntry = {
  id: string;
  actor_id: string;
  edit_type: string;
  field_key: string | null;
  old_value: unknown;
  new_value: unknown;
  reason: string;
  created_at: string;
};

type Stage1Blocker = {
  code: string;
  label: string;
  detail: string;
  count: number;
};

type Tab = "datos" | "archivos" | "recomendaciones" | "historial";

const PANEL_CARD_STYLE: CSSProperties = {
  padding: "0.75rem 1rem",
  background: "var(--surface)",
  border: "1px solid var(--border, var(--sand))",
  borderRadius: "8px",
  boxShadow: "var(--shadow-sm)",
};

const PANEL_SUBTLE_BUTTON_STYLE: CSSProperties = {
  padding: "0.375rem 0.75rem",
  fontSize: "0.8125rem",
  background: "var(--cream)",
  color: "var(--ink)",
  border: "1px solid var(--border, var(--sand))",
  borderRadius: "8px",
  cursor: "pointer",
};

const PANEL_ACCENT_BUTTON_STYLE: CSSProperties = {
  padding: "0.375rem 0.75rem",
  fontSize: "0.8125rem",
  background: "var(--uwc-maroon-soft)",
  color: "var(--uwc-maroon)",
  border: "1px solid var(--uwc-maroon)",
  borderRadius: "8px",
  cursor: "pointer",
};

const PANEL_SUCCESS_BUTTON_STYLE: CSSProperties = {
  padding: "0.375rem 0.75rem",
  fontSize: "0.8125rem",
  background: "var(--surface)",
  color: "var(--success)",
  border: "1px solid var(--success)",
  borderRadius: "8px",
  cursor: "pointer",
};

function normalizeApiError(value: unknown, fallbackMessage: string): ApiError {
  if (value && typeof value === "object") {
    return {
      message:
        typeof (value as { message?: unknown }).message === "string"
          ? (value as { message: string }).message
          : fallbackMessage,
      errorId:
        typeof (value as { errorId?: unknown }).errorId === "string"
          ? (value as { errorId: string }).errorId
          : undefined,
    };
  }

  return { message: fallbackMessage };
}

async function readJsonSafely(response: Response) {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("datos");

  // Edit mode state
  const [editing, setEditing] = useState(false);
  const [editChanges, setEditChanges] = useState<Record<string, string>>({});
  const [editReason, setEditReason] = useState("");
  const [saving, setSaving] = useState(false);

  // Validate / Transition state
  const [validating, setValidating] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [busyFileKey, setBusyFileKey] = useState<string | null>(null);
  const [busyRecommendationId, setBusyRecommendationId] = useState<string | null>(null);
  const [ocrResultByFileKey, setOcrResultByFileKey] = useState<Record<string, OcrRunResult>>({});
  const [ocrErrorByFileKey, setOcrErrorByFileKey] = useState<Record<string, ApiError | null>>({});

  const drawerRef = useRef<HTMLDivElement>(null);

  const loadViewerData = useCallback(async () => {
    if (!applicationId) {
      return;
    }

    const [exportResponse, historyResponse, filesResponse] = await Promise.all([
      fetch(`/api/exports?applicationId=${applicationId}`),
      fetch(`/api/applications/${applicationId}/admin-edit`),
      fetch(`/api/applications/${applicationId}/files`),
    ]);

    const exportBody = (await exportResponse.json().catch(() => null)) as
      | ApplicationExport
      | { message?: string; userMessage?: string }
      | null;
    if (!exportResponse.ok) {
      throw new Error(
        typeof exportBody === "object" &&
          exportBody &&
          "userMessage" in exportBody &&
          typeof exportBody.userMessage === "string"
          ? exportBody.userMessage
          : "Failed to load application",
      );
    }

    const historyBody = (await historyResponse.json().catch(() => null)) as
      | { history?: EditLogEntry[] }
      | null;
    const filesBody = (await filesResponse.json().catch(() => null)) as
      | { files?: AdminFileEntry[] }
      | null;

    setData(exportBody as ApplicationExport);
    setEditLog(historyResponse.ok ? historyBody?.history ?? [] : []);
    setFiles(filesResponse.ok ? filesBody?.files ?? [] : []);
  }, [applicationId]);

  /* ---- Fetch data when applicationId changes ---- */
  useEffect(() => {
    if (!applicationId) {
      setData(null);
      setFiles([]);
      setEditLog([]);
      setEditing(false);
      setOcrResultByFileKey({});
      setOcrErrorByFileKey({});
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setEditing(false);
    setEditChanges({});
    setOcrResultByFileKey({});
    setOcrErrorByFileKey({});

    loadViewerData()
      .then(() => {
        if (cancelled) return;
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(String(err.message ?? err));
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

  /* ---- Edit handlers ---- */
  const handleFieldChange = useCallback((key: string, value: string) => {
    setEditChanges((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSaveEdits = useCallback(async () => {
    if (!applicationId || Object.keys(editChanges).length === 0) return;
    if (editReason.length < 4) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/applications/${applicationId}/admin-edit`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes: editChanges, reason: editReason }),
      });
      if (!res.ok) throw new Error("Save failed");
      const { application } = await res.json();
      setData((prev) =>
        prev ? { ...prev, application: { ...prev.application, ...application } } : prev,
      );
      await loadViewerData();
      setEditing(false);
      setEditChanges({});
      setEditReason("");
      onApplicationUpdated();
    } catch {
      setError("No se pudieron guardar los cambios.");
    } finally {
      setSaving(false);
    }
  }, [applicationId, editChanges, editReason, loadViewerData, onApplicationUpdated]);

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
        const res = await fetch(
          `/api/applications/${applicationId}/validate`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status, notes: notes || "—" }),
          },
        );
        if (!res.ok) throw new Error("Validation failed");
        const { application } = await res.json();
        setData((prev) =>
          prev ? { ...prev, application: { ...prev.application, ...application } } : prev,
        );
        await loadViewerData();
        onApplicationUpdated();
      } catch {
        setError("No se pudo registrar la validación.");
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
        const res = await fetch(
          `/api/applications/${applicationId}/transition`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ toStage, reason }),
          },
        );
        if (!res.ok) throw new Error("Transition failed");
        const { application } = await res.json();
        setData((prev) =>
          prev ? { ...prev, application: { ...prev.application, ...application } } : prev,
        );
        await loadViewerData();
        onApplicationUpdated();
      } catch {
        setError("No se pudo cambiar la etapa.");
      } finally {
        setTransitioning(false);
      }
    },
    [applicationId, loadViewerData, onApplicationUpdated],
  );

  const formatFileSize = useCallback((sizeBytes: number | null) => {
    if (typeof sizeBytes !== "number" || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
      return "Tamano no disponible";
    }

    if (sizeBytes < 1024) {
      return `${sizeBytes} B`;
    }

    const sizeKb = sizeBytes / 1024;
    if (sizeKb < 1024) {
      return `${sizeKb.toFixed(sizeKb >= 100 ? 0 : 1)} KB`;
    }

    return `${(sizeKb / 1024).toFixed(1)} MB`;
  }, []);

  const handleFileMetadataEdit = useCallback(
    async (file: AdminFileEntry) => {
      if (!applicationId) {
        return;
      }

      const title = window.prompt("Titulo del archivo:", file.title);
      if (title === null) {
        return;
      }
      const category = window.prompt("Categoria interna (opcional):", file.category ?? "");
      if (category === null) {
        return;
      }
      const notes = window.prompt("Notas internas (opcional):", file.notes ?? "");
      if (notes === null) {
        return;
      }
      const reason = window.prompt("Motivo del cambio:", "Correccion operativa");
      if (!reason || reason.trim().length < 4) {
        return;
      }

      setBusyFileKey(file.key);
      try {
        const response = await fetch(`/api/applications/${applicationId}/files`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileKey: file.key,
            title,
            category,
            notes,
            reason,
          }),
        });

        if (!response.ok) {
          throw new Error("No se pudo actualizar el archivo.");
        }

        await loadViewerData();
        onApplicationUpdated();
      } catch {
        setError("No se pudo actualizar la metadata del archivo.");
      } finally {
        setBusyFileKey(null);
      }
    },
    [applicationId, loadViewerData, onApplicationUpdated],
  );

  const handleAdminFileUpload = useCallback(
    async (fileKey: string, selectedFile: File | null) => {
      if (!applicationId || !selectedFile) {
        return;
      }

      const reason = window.prompt("Motivo de la carga manual:", "Documento enviado por correo");
      if (!reason || reason.trim().length < 4) {
        return;
      }

      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("fileKey", fileKey);
      formData.append("reason", reason);

      setBusyFileKey(fileKey);
      try {
        const response = await fetch(`/api/applications/${applicationId}/admin-upload`, {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          throw new Error("No se pudo cargar el archivo.");
        }

        await loadViewerData();
        onApplicationUpdated();
      } catch {
        setError("No se pudo cargar el archivo manualmente.");
      } finally {
        setBusyFileKey(null);
      }
    },
    [applicationId, loadViewerData, onApplicationUpdated],
  );

  const handleRunFileOcr = useCallback(
    async (fileKey: string) => {
      if (!applicationId) {
        return;
      }

      setBusyFileKey(fileKey);
      setOcrErrorByFileKey((current) => ({ ...current, [fileKey]: null }));
      try {
        const response = await fetch(`/api/applications/${applicationId}/ocr-check`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileKey }),
        });
        const body = await readJsonSafely(response);

        if (!response.ok) {
          throw normalizeApiError(body, "No se pudo ejecutar el parsing IA.");
        }

        const parsedBody = body as { summary?: string; confidence?: number; createdAt?: string } | null;
        setOcrResultByFileKey((current) => ({
          ...current,
          [fileKey]: {
            summary:
              typeof parsedBody?.summary === "string"
                ? parsedBody.summary
                : "Parsing completado.",
            confidence:
              typeof parsedBody?.confidence === "number" ? parsedBody.confidence : 0,
            createdAt:
              typeof parsedBody?.createdAt === "string"
                ? parsedBody.createdAt
                : new Date().toISOString(),
          },
        }));
      } catch (error) {
        const apiError =
          error && typeof error === "object" && "message" in error
            ? (error as ApiError)
            : { message: "No se pudo ejecutar el parsing IA." };
        setOcrErrorByFileKey((current) => ({ ...current, [fileKey]: apiError }));
      } finally {
        setBusyFileKey(null);
      }
    },
    [applicationId],
  );

  const handleRecommendationEdit = useCallback(
    async (recommendationId: string, currentName: string | null, currentEmail: string, currentNotes: string | null) => {
      const recommenderName = window.prompt("Nombre del recomendador (opcional):", currentName ?? "");
      if (recommenderName === null) {
        return;
      }
      const recommenderEmail = window.prompt("Correo del recomendador:", currentEmail);
      if (recommenderEmail === null) {
        return;
      }
      const adminNotes = window.prompt("Notas internas (opcional):", currentNotes ?? "");
      if (adminNotes === null) {
        return;
      }
      const reason = window.prompt("Motivo del cambio:", "Correccion de contacto");
      if (!reason || reason.trim().length < 4) {
        return;
      }

      setBusyRecommendationId(recommendationId);
      try {
        const response = await fetch(`/api/recommendations/${recommendationId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recommenderName,
            recommenderEmail,
            adminNotes,
            reason,
          }),
        });

        if (!response.ok) {
          throw new Error("No se pudo actualizar la recomendacion.");
        }

        await loadViewerData();
      } catch {
        setError("No se pudo actualizar la recomendacion.");
      } finally {
        setBusyRecommendationId(null);
      }
    },
    [loadViewerData],
  );

  const handleRecommendationReminder = useCallback(
    async (recommendationId: string) => {
      setBusyRecommendationId(recommendationId);
      try {
        const response = await fetch(`/api/recommendations/${recommendationId}/remind`, {
          method: "POST",
        });

        if (!response.ok) {
          throw new Error("No se pudo enviar el recordatorio.");
        }

        await loadViewerData();
      } catch {
        setError("No se pudo enviar el recordatorio.");
      } finally {
        setBusyRecommendationId(null);
      }
    },
    [loadViewerData],
  );

  const handleManualRecommendationReceipt = useCallback(
    async (recommendationId: string, fallbackName: string | null) => {
      const reason = window.prompt("Motivo de recepcion manual:", "Recibida por correo");
      if (!reason || reason.trim().length < 4) {
        return;
      }
      const recommenderName = window.prompt("Nombre del recomendador (opcional):", fallbackName ?? "");
      if (recommenderName === null) {
        return;
      }
      const attachFile = window.confirm("Deseas adjuntar un archivo recibido?");
      let selectedFile: File | null = null;

      if (attachFile) {
        const input = document.createElement("input");
        input.type = "file";
        selectedFile = await new Promise<File | null>((resolve) => {
          input.onchange = () => resolve(input.files?.[0] ?? null);
          input.click();
        });
      }

      const formData = new FormData();
      formData.append("reason", reason);
      formData.append("recommenderName", recommenderName);
      if (selectedFile) {
        formData.append("file", selectedFile);
      }

      setBusyRecommendationId(recommendationId);
      try {
        const response = await fetch(`/api/recommendations/${recommendationId}`, {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          throw new Error("No se pudo registrar la recomendacion manualmente.");
        }

        await loadViewerData();
      } catch {
        setError("No se pudo registrar la recomendacion manualmente.");
      } finally {
        setBusyRecommendationId(null);
      }
    },
    [loadViewerData],
  );

  /* ---- Render ---- */
  if (!applicationId) return null;

  const app = data?.application;
  const payload = (app?.payload ?? {}) as Record<string, unknown>;
  const payloadKeys = Object.keys(payload).filter(
    (k) => payload[k] !== null && payload[k] !== undefined && payload[k] !== "",
  );

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
              { key: "archivos", label: "Archivos" },
              { key: "recomendaciones", label: "Recomendaciones" },
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
            <div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "1rem",
                }}
              >
                <h3 style={{ margin: 0, fontSize: "0.9375rem", fontWeight: 700 }}>
                  Datos del formulario
                </h3>
                {!editing ? (
                  <button
                    onClick={() => setEditing(true)}
                    style={{
                      padding: "0.375rem 0.75rem",
                      fontSize: "0.8125rem",
                      background: "var(--uwc-maroon)",
                      color: "white",
                      border: "none",
                      cursor: "pointer",
                      borderRadius: "2px",
                      fontWeight: 600,
                    }}
                  >
                    Editar campos
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setEditing(false);
                      setEditChanges({});
                      setEditReason("");
                    }}
                    style={{
                      padding: "0.375rem 0.75rem",
                      fontSize: "0.8125rem",
                      background: "var(--cream)",
                      color: "var(--muted)",
                      border: "1px solid var(--border)",
                      cursor: "pointer",
                      borderRadius: "2px",
                    }}
                  >
                    Cancelar edición
                  </button>
                )}
              </div>

              {/* Validation notes */}
              {app?.validation_notes && (
                <div
                  style={{
                    padding: "0.75rem 1rem",
                    background: "var(--uwc-maroon-soft)",
                    borderLeft: "3px solid var(--uwc-maroon)",
                    marginBottom: "1rem",
                    fontSize: "0.8125rem",
                  }}
                >
                  <strong>Notas de validación:</strong> {app.validation_notes}
                </div>
              )}

              <div
                style={{
                  padding: "0.75rem 1rem",
                  background: "var(--surface)",
                  border: "1px solid var(--border, #E5E0DB)",
                  borderRadius: "4px",
                  marginBottom: "1rem",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "0.75rem",
                    marginBottom: "0.75rem",
                  }}
                >
                  <strong style={{ fontSize: "0.875rem" }}>Bloqueos de Stage 1</strong>
                  <span className={`status-pill ${stage1Blockers.length === 0 ? "complete" : "rejected"}`}>
                    {stage1Blockers.length === 0 ? "Sin bloqueos activos" : `${stage1Blockers.length} bloqueo(s)`}
                  </span>
                </div>
                {stage1Blockers.length === 0 ? (
                  <div style={{ fontSize: "0.8125rem", color: "var(--muted)" }}>
                    La postulación no tiene bloqueos activos en Stage 1.
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: "0.75rem" }}>
                    {stage1Blockers.map((blocker) => (
                      <div
                        key={blocker.code}
                        style={{
                          padding: "0.625rem 0.75rem",
                          borderRadius: "4px",
                          background: "var(--cream)",
                        }}
                      >
                        <div style={{ fontSize: "0.8125rem", fontWeight: 700 }}>{blocker.label}</div>
                        <div style={{ fontSize: "0.8125rem", color: "var(--muted)" }}>{blocker.detail}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Field list */}
              <div style={{ display: "grid", gap: "0.75rem" }}>
                {payloadKeys.map((key) => {
                  const currentValue =
                    key in editChanges
                      ? editChanges[key]
                      : String(payload[key] ?? "");

                  return (
                    <div
                      key={key}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "180px 1fr",
                        gap: "0.5rem",
                        alignItems: "start",
                        padding: "0.5rem 0",
                        borderBottom: "1px solid var(--border, #E5E0DB)",
                      }}
                    >
                      <label
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          color: "var(--muted)",
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                          paddingTop: "0.25rem",
                        }}
                      >
                        {key}
                      </label>
                      {editing ? (
                        <input
                          type="text"
                          value={currentValue}
                          onChange={(e) =>
                            handleFieldChange(key, e.target.value)
                          }
                          style={{
                            width: "100%",
                            padding: "0.375rem 0.5rem",
                            fontSize: "0.875rem",
                            border: "1px solid var(--border)",
                            borderRadius: "2px",
                            background: "white",
                          }}
                        />
                      ) : (
                        <span style={{ fontSize: "0.875rem" }}>
                          {String(payload[key] ?? "—")}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Save bar */}
              {editing && Object.keys(editChanges).length > 0 && (
                <div
                  style={{
                    marginTop: "1.5rem",
                    padding: "1rem",
                    background: "white",
                    border: "1px solid var(--border)",
                    borderRadius: "4px",
                  }}
                >
                  <div style={{ marginBottom: "0.75rem" }}>
                    <label
                      style={{
                        fontSize: "0.8125rem",
                        fontWeight: 600,
                        display: "block",
                        marginBottom: "0.375rem",
                      }}
                    >
                      Motivo del cambio *
                    </label>
                    <input
                      type="text"
                      value={editReason}
                      onChange={(e) => setEditReason(e.target.value)}
                      placeholder="Ej: Corrección solicitada por el postulante"
                      style={{
                        width: "100%",
                        padding: "0.5rem",
                        fontSize: "0.875rem",
                        border: "1px solid var(--border)",
                        borderRadius: "2px",
                      }}
                    />
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span style={{ fontSize: "0.8125rem", color: "var(--muted)" }}>
                      {Object.keys(editChanges).length} campo(s) modificado(s)
                    </span>
                    <button
                      onClick={handleSaveEdits}
                      disabled={saving || editReason.length < 4}
                      style={{
                        padding: "0.5rem 1.25rem",
                        fontSize: "0.875rem",
                        fontWeight: 700,
                        background:
                          editReason.length >= 4
                            ? "var(--uwc-maroon)"
                            : "var(--muted)",
                        color: "white",
                        border: "none",
                        cursor:
                          editReason.length >= 4 ? "pointer" : "not-allowed",
                        borderRadius: "2px",
                      }}
                    >
                      {saving ? "Guardando..." : "Guardar cambios"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Files tab */}
          {!loading && data && activeTab === "archivos" && (
            <div>
              <h3 style={{ margin: "0 0 1rem", fontSize: "0.9375rem", fontWeight: 700 }}>
                Archivos subidos
              </h3>
              {files.length === 0 ? (
                <p style={{ color: "var(--muted)", fontSize: "0.875rem" }}>
                  No hay archivos subidos.
                </p>
              ) : (
                <div style={{ display: "grid", gap: "0.5rem" }}>
                  {files.map((f) => (
                    <div
                      key={f.key}
                      data-testid={`admin-file-card-${f.key}`}
                      style={PANEL_CARD_STYLE}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: "1rem",
                          alignItems: "flex-start",
                        }}
                      >
                        <div>
                          <div style={{ fontSize: "0.875rem", fontWeight: 600 }}>
                            {f.title}
                          </div>
                          <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                            {f.originalName} · {formatFileSize(f.sizeBytes)}
                          </div>
                          <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.25rem" }}>
                            Clave: {f.key}
                            {f.category ? ` · Categoria: ${f.category}` : ""}
                          </div>
                          {f.notes ? (
                            <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.25rem" }}>
                              Notas: {f.notes}
                            </div>
                          ) : null}
                        </div>
                        <div
                          style={{
                            fontSize: "0.75rem",
                            color: "var(--muted)",
                            textTransform: "uppercase",
                            textAlign: "right",
                          }}
                        >
                          {f.mimeType || "archivo"}
                        </div>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          gap: "0.5rem",
                          flexWrap: "wrap",
                          marginTop: "0.75rem",
                          alignItems: "center",
                        }}
                      >
                        <button
                          onClick={() => handleFileMetadataEdit(f)}
                          disabled={busyFileKey === f.key}
                          style={PANEL_SUBTLE_BUTTON_STYLE}
                        >
                          Editar metadata
                        </button>
                        {f.downloadUrl ? (
                          <a
                            href={f.downloadUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              ...PANEL_ACCENT_BUTTON_STYLE,
                              textDecoration: "none",
                            }}
                          >
                            Descargar
                          </a>
                        ) : null}
                        {f.aiParserEnabled ? (
                          <button
                            onClick={() => void handleRunFileOcr(f.key)}
                            disabled={busyFileKey === f.key}
                            style={PANEL_SUCCESS_BUTTON_STYLE}
                          >
                            {busyFileKey === f.key ? "Analizando..." : "Analizar con IA"}
                          </button>
                        ) : null}
                        <label
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.5rem",
                            fontSize: "0.8125rem",
                            color: "var(--ink-light)",
                          }}
                        >
                          <span>Reemplazar</span>
                          <input
                            type="file"
                            onChange={(event) => {
                              const selectedFile = event.target.files?.[0] ?? null;
                              void handleAdminFileUpload(f.key, selectedFile);
                              event.currentTarget.value = "";
                            }}
                            disabled={busyFileKey === f.key}
                          />
                        </label>
                      </div>
                      {ocrResultByFileKey[f.key] ? (
                        <div
                          style={{
                            marginTop: "0.75rem",
                            padding: "0.625rem 0.75rem",
                            borderRadius: "8px",
                            background: "var(--paper)",
                            border: "1px solid var(--border, var(--sand))",
                          }}
                        >
                          <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--muted)" }}>
                            Parsing IA
                          </div>
                          <div style={{ marginTop: "0.25rem", fontSize: "0.8125rem" }}>
                            {ocrResultByFileKey[f.key]?.summary}
                          </div>
                          <div style={{ marginTop: "0.25rem", fontSize: "0.75rem", color: "var(--muted)" }}>
                            Confianza: {Math.round((ocrResultByFileKey[f.key]?.confidence ?? 0) * 100)}% ·{" "}
                            {new Date(ocrResultByFileKey[f.key]!.createdAt).toLocaleString("es-PE")}
                          </div>
                        </div>
                      ) : null}
                      {ocrErrorByFileKey[f.key] ? (
                        <div
                          style={{
                            marginTop: "0.75rem",
                            padding: "0.625rem 0.75rem",
                            borderRadius: "8px",
                            background: "var(--error-soft, #fdecec)",
                            border: "1px solid var(--error, #c62828)",
                            color: "var(--error, #c62828)",
                            fontSize: "0.8125rem",
                          }}
                        >
                          <div>{ocrErrorByFileKey[f.key]?.message}</div>
                          {ocrErrorByFileKey[f.key]?.errorId ? (
                            <div style={{ marginTop: "0.25rem", fontSize: "0.75rem" }}>
                              Error ID: {ocrErrorByFileKey[f.key]?.errorId}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Recommendations tab */}
          {!loading && data && activeTab === "recomendaciones" && (
            <div>
              <h3 style={{ margin: "0 0 1rem", fontSize: "0.9375rem", fontWeight: 700 }}>
                Recomendaciones
              </h3>
              {data.recommendations.length === 0 ? (
                <p style={{ color: "var(--muted)", fontSize: "0.875rem" }}>
                  No hay recomendaciones registradas.
                </p>
              ) : (
                <div style={{ display: "grid", gap: "0.5rem" }}>
                  {data.recommendations.map((rec) => (
                    <div
                      key={rec.id}
                      data-testid={`admin-recommendation-card-${rec.id}`}
                      style={PANEL_CARD_STYLE}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: "0.25rem",
                        }}
                      >
                        <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>
                          {rec.role === "mentor" ? "Mentor" : "Amigo/a"}
                        </span>
                        <span
                          style={{
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            color:
                              rec.status === "submitted"
                                ? "var(--success)"
                                : "var(--muted)",
                          }}
                        >
                          {rec.status}
                        </span>
                      </div>
                      {rec.recommender_name ? (
                        <div style={{ fontSize: "0.8125rem", marginBottom: "0.2rem" }}>
                          {rec.recommender_name}
                        </div>
                      ) : null}
                      <div style={{ fontSize: "0.8125rem", color: "var(--muted)" }}>
                        {rec.recommender_email}
                      </div>
                      {rec.admin_notes ? (
                        <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.25rem" }}>
                          Notas internas: {rec.admin_notes}
                        </div>
                      ) : null}
                      {rec.submitted_at && (
                        <div
                          style={{
                            fontSize: "0.75rem",
                            color: "var(--muted)",
                            marginTop: "0.25rem",
                          }}
                        >
                          Enviado:{" "}
                          {new Date(rec.submitted_at).toLocaleDateString("es-PE")}
                        </div>
                      )}
                      {rec.admin_received_at ? (
                        <div
                          style={{
                            fontSize: "0.75rem",
                            color: "var(--muted)",
                            marginTop: "0.25rem",
                          }}
                        >
                          Registrada manualmente:{" "}
                          {new Date(rec.admin_received_at).toLocaleString("es-PE")}
                          {rec.admin_received_reason ? ` · ${rec.admin_received_reason}` : ""}
                        </div>
                      ) : null}
                      <div
                        style={{
                          display: "flex",
                          gap: "0.5rem",
                          flexWrap: "wrap",
                          marginTop: "0.75rem",
                        }}
                      >
                        <button
                          onClick={() =>
                            handleRecommendationEdit(
                              rec.id,
                              rec.recommender_name,
                              rec.recommender_email,
                              rec.admin_notes,
                            )
                          }
                          disabled={busyRecommendationId === rec.id}
                          style={PANEL_SUBTLE_BUTTON_STYLE}
                        >
                          Editar contacto
                        </button>
                        {rec.status !== "submitted" ? (
                          <button
                            onClick={() => handleRecommendationReminder(rec.id)}
                            disabled={busyRecommendationId === rec.id}
                            style={PANEL_ACCENT_BUTTON_STYLE}
                          >
                            Reenviar recordatorio
                          </button>
                        ) : null}
                        {rec.status !== "submitted" ? (
                          <button
                            onClick={() =>
                              handleManualRecommendationReceipt(
                                rec.id,
                                rec.recommender_name,
                              )
                            }
                            disabled={busyRecommendationId === rec.id}
                            style={PANEL_SUCCESS_BUTTON_STYLE}
                          >
                            Registrar manualmente
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* History tab */}
          {!loading && data && activeTab === "historial" && (
            <div>
              <h3 style={{ margin: "0 0 1rem", fontSize: "0.9375rem", fontWeight: 700 }}>
                Historial de ediciones
              </h3>
              {editLog.length === 0 ? (
                <p style={{ color: "var(--muted)", fontSize: "0.875rem" }}>
                  No hay ediciones registradas todavía.
                </p>
              ) : (
                <div style={{ display: "grid", gap: "0.5rem" }}>
                  {editLog.map((entry) => (
                    <div
                      key={entry.id}
                      style={{
                        padding: "0.75rem 1rem",
                        background: "white",
                        border: "1px solid var(--border)",
                        borderRadius: "4px",
                        fontSize: "0.8125rem",
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>
                        {entry.edit_type}: {entry.field_key ?? "—"}
                      </div>
                      <div style={{ color: "var(--muted)", marginTop: "0.25rem" }}>
                        {entry.reason}
                      </div>
                      <div
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--muted)",
                          marginTop: "0.25rem",
                        }}
                      >
                        {new Date(entry.created_at).toLocaleString("es-PE")}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
