import type { EditLogEntry } from "@/components/admin-application-viewer-types";

// ─── Props ────────────────────────────────────────────────────────────

export interface ViewerHistorialTabProps {
  editLog: EditLogEntry[];
}

// ─── Component ────────────────────────────────────────────────────────

export function ViewerHistorialTab({ editLog }: ViewerHistorialTabProps) {
  return (
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
  );
}
