import type { EvaluationData } from "@/components/admin-application-viewer-types";

// ─── Props ────────────────────────────────────────────────────────────

export interface ViewerDictamenTabProps {
  evaluations: EvaluationData[];
}

// ─── Component ────────────────────────────────────────────────────────

export function ViewerDictamenTab({ evaluations }: ViewerDictamenTabProps) {
  return (
    <div>
      <h3 style={{ margin: "0 0 1rem", fontSize: "0.9375rem", fontWeight: 700 }}>
        Dictamen automático
      </h3>
      {evaluations.length === 0 ? (
        <div
          style={{
            padding: "1.5rem",
            textAlign: "center",
            color: "var(--muted)",
            fontSize: "0.875rem",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
          }}
        >
          No se ha ejecutado la rúbrica automática aún para esta postulación.
        </div>
      ) : (
        <div style={{ display: "grid", gap: "1.25rem" }}>
          {evaluations.map((ev) => {
            const outcomeLabel =
              ev.outcome === "eligible"
                ? "ELEGIBLE"
                : ev.outcome === "not_eligible"
                  ? "NO ELEGIBLE"
                  : "REVISIÓN MANUAL";
            const outcomeColor =
              ev.outcome === "eligible"
                ? "var(--success)"
                : ev.outcome === "not_eligible"
                  ? "var(--danger)"
                  : "var(--warning)";
            const outcomeBg =
              ev.outcome === "eligible"
                ? "var(--success-soft)"
                : ev.outcome === "not_eligible"
                  ? "var(--danger-soft)"
                  : "var(--warning-soft)";

            return (
              <div key={ev.id} style={{ display: "grid", gap: "0.75rem" }}>
                {/* Outcome banner */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "1rem",
                    padding: "0.875rem 1rem",
                    background: outcomeBg,
                    border: `1px solid ${outcomeColor}`,
                    borderRadius: "8px",
                  }}
                >
                  <span
                    style={{
                      fontWeight: 700,
                      fontSize: "0.8125rem",
                      color: outcomeColor,
                      letterSpacing: "0.05em",
                    }}
                  >
                    {outcomeLabel}
                  </span>
                  <span style={{ flex: 1 }} />
                  <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                    {new Date(ev.evaluated_at).toLocaleString("es-PE")}
                  </span>
                </div>

                {/* Stats row */}
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  {[
                    { label: `${ev.passed_count} criterios OK`, color: "var(--success)", bg: "var(--success-soft)" },
                    ...(ev.failed_count > 0
                      ? [{ label: `${ev.failed_count} no cumple`, color: "var(--danger)", bg: "var(--danger-soft)" }]
                      : []),
                    ...(ev.needs_review_count > 0
                      ? [{ label: `${ev.needs_review_count} requieren revisión`, color: "var(--warning)", bg: "var(--warning-soft)" }]
                      : []),
                  ].map(({ label, color, bg }) => (
                    <span
                      key={label}
                      style={{
                        padding: "0.25rem 0.625rem",
                        background: bg,
                        color,
                        borderRadius: "999px",
                        fontWeight: 600,
                        fontSize: "0.75rem",
                      }}
                    >
                      {label}
                    </span>
                  ))}
                </div>

                {/* Criteria list */}
                <div style={{ display: "grid", gap: "0.4rem" }}>
                  {ev.criteria_results.map((criterion) => {
                    const isPass = criterion.status === "pass";
                    const isFail = criterion.status === "fail";
                    const icon = isPass ? "✓" : isFail ? "✗" : "?";
                    const iconColor = isPass
                      ? "var(--success)"
                      : isFail
                        ? "var(--danger)"
                        : "var(--muted)";
                    const rowBg = isPass
                      ? "var(--surface)"
                      : isFail
                        ? "var(--danger-soft)"
                        : "var(--warning-soft)";
                    const borderColor = isPass
                      ? "var(--sand)"
                      : isFail
                        ? "var(--danger)"
                        : "var(--warning)";

                    return (
                      <div
                        key={criterion.criterionId}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1.5rem 1fr",
                          gap: "0.5rem",
                          padding: "0.625rem 0.75rem",
                          background: rowBg,
                          border: `1px solid color-mix(in srgb, ${borderColor} 35%, transparent)`,
                          borderRadius: "6px",
                          fontSize: "0.8125rem",
                          alignItems: "start",
                        }}
                      >
                        <span
                          style={{
                            fontWeight: 700,
                            color: iconColor,
                            fontSize: "0.875rem",
                            lineHeight: "1.4",
                          }}
                        >
                          {icon}
                        </span>
                        <div>
                          <div style={{ fontWeight: 600, lineHeight: "1.4", color: "var(--ink)" }}>
                            {criterion.label}
                          </div>
                          <div
                            style={{
                              color: "var(--muted)",
                              marginTop: "0.125rem",
                              fontSize: "0.75rem",
                              lineHeight: "1.4",
                            }}
                          >
                            {criterion.message}
                          </div>
                          {criterion.decision && !isPass && (
                            <span
                              style={{
                                display: "inline-block",
                                marginTop: "0.25rem",
                                padding: "0.125rem 0.5rem",
                                fontSize: "0.6875rem",
                                fontWeight: 700,
                                letterSpacing: "0.04em",
                                borderRadius: "999px",
                                color:
                                  criterion.decision === "not_eligible"
                                    ? "var(--danger)"
                                    : "var(--warning)",
                                background:
                                  criterion.decision === "not_eligible"
                                    ? "var(--danger-soft)"
                                    : "var(--warning-soft)",
                              }}
                            >
                              {criterion.decision === "not_eligible"
                                ? "→ NO ELEGIBLE"
                                : "→ REVISIÓN MANUAL"}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
