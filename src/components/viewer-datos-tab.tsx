"use client";

import { useCallback, useState } from "react";
import {
  fetchApi,
  toNormalizedApiError,
} from "@/lib/client/api-client";
import type {
  ApplicationExport,
  Stage1Blocker,
} from "@/components/admin-application-viewer-types";

// ─── Props ────────────────────────────────────────────────────────────

export interface ViewerDatosTabProps {
  data: ApplicationExport;
  stage1Blockers: Stage1Blocker[];
  onReload: () => Promise<void>;
  onApplicationUpdated: () => void;
  onError: (message: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────

export function ViewerDatosTab({
  data,
  stage1Blockers,
  onReload,
  onApplicationUpdated,
  onError,
}: ViewerDatosTabProps) {
  const [editing, setEditing] = useState(false);
  const [editChanges, setEditChanges] = useState<Record<string, string>>({});
  const [editReason, setEditReason] = useState("");
  const [saving, setSaving] = useState(false);

  const app = data.application;
  const payload = (app.payload ?? {}) as Record<string, unknown>;
  const payloadKeys = Object.keys(payload).filter(
    (k) => payload[k] !== null && payload[k] !== undefined && payload[k] !== "",
  );

  const handleFieldChange = useCallback((key: string, value: string) => {
    setEditChanges((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSaveEdits = useCallback(async () => {
    if (Object.keys(editChanges).length === 0) return;
    if (editReason.length < 4) return;

    setSaving(true);
    try {
      await fetchApi<{ application: Partial<ApplicationExport["application"]> }>(
        `/api/applications/${app.id}/admin-edit`,
        {
          method: "PATCH",
          body: JSON.stringify({ changes: editChanges, reason: editReason }),
        },
      );
      await onReload();
      setEditing(false);
      setEditChanges({});
      setEditReason("");
      onApplicationUpdated();
    } catch (requestError) {
      onError(
        toNormalizedApiError(requestError, "No se pudieron guardar los cambios.").message,
      );
    } finally {
      setSaving(false);
    }
  }, [app.id, editChanges, editReason, onReload, onApplicationUpdated, onError]);

  return (
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
      {app.validation_notes && (
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

      {/* Stage 1 blockers */}
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
                    background: "var(--surface)",
                    color: "var(--ink)",
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
            background: "var(--surface)",
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
                background: "var(--surface)",
                color: "var(--ink)",
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
  );
}
