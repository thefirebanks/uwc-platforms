"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  files: Array<{
    field_key: string;
    path: string;
    name: string;
    mime_type: string;
    size_bytes: number;
  }>;
  recommendations: Array<{
    id: string;
    role: string;
    recommender_email: string;
    status: string;
    submitted_at: string | null;
  }>;
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

type Tab = "datos" | "archivos" | "recomendaciones" | "historial";

/* -------------------------------------------------------------------------- */
/*  Props                                                                     */
/* -------------------------------------------------------------------------- */

type Props = {
  applicationId: string | null;
  onClose: () => void;
  onApplicationUpdated: () => void;
};

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export function AdminApplicationViewer({
  applicationId,
  onClose,
  onApplicationUpdated,
}: Props) {
  const [data, setData] = useState<ApplicationExport | null>(null);
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

  const drawerRef = useRef<HTMLDivElement>(null);

  /* ---- Fetch data when applicationId changes ---- */
  useEffect(() => {
    if (!applicationId) {
      setData(null);
      setEditLog([]);
      setEditing(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setEditing(false);
    setEditChanges({});

    Promise.all([
      fetch(`/api/exports?applicationId=${applicationId}`).then((r) =>
        r.ok ? r.json() : Promise.reject(new Error("Failed to load application")),
      ),
      fetch(`/api/applications/${applicationId}/admin-edit`).catch(
        () => null,
      ),
    ])
      .then(([exportData]) => {
        if (cancelled) return;
        setData(exportData as ApplicationExport);
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
  }, [applicationId]);

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
      setEditing(false);
      setEditChanges({});
      setEditReason("");
      onApplicationUpdated();
    } catch {
      setError("No se pudieron guardar los cambios.");
    } finally {
      setSaving(false);
    }
  }, [applicationId, editChanges, editReason, onApplicationUpdated]);

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
        onApplicationUpdated();
      } catch {
        setError("No se pudo registrar la validación.");
      } finally {
        setValidating(false);
      }
    },
    [applicationId, onApplicationUpdated],
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
        onApplicationUpdated();
      } catch {
        setError("No se pudo cambiar la etapa.");
      } finally {
        setTransitioning(false);
      }
    },
    [applicationId, onApplicationUpdated],
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
          background: "var(--cream, #FAF8F5)",
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
              {data.files.length === 0 ? (
                <p style={{ color: "var(--muted)", fontSize: "0.875rem" }}>
                  No hay archivos subidos.
                </p>
              ) : (
                <div style={{ display: "grid", gap: "0.5rem" }}>
                  {data.files.map((f) => (
                    <div
                      key={f.field_key}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "0.75rem 1rem",
                        background: "white",
                        border: "1px solid var(--border)",
                        borderRadius: "4px",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: "0.875rem", fontWeight: 600 }}>
                          {f.field_key}
                        </div>
                        <div
                          style={{ fontSize: "0.75rem", color: "var(--muted)" }}
                        >
                          {f.name} · {(f.size_bytes / 1024).toFixed(0)} KB
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--muted)",
                          textTransform: "uppercase",
                        }}
                      >
                        {f.mime_type}
                      </span>
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
                      style={{
                        padding: "0.75rem 1rem",
                        background: "white",
                        border: "1px solid var(--border)",
                        borderRadius: "4px",
                      }}
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
                      <div style={{ fontSize: "0.8125rem", color: "var(--muted)" }}>
                        {rec.recommender_email}
                      </div>
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
