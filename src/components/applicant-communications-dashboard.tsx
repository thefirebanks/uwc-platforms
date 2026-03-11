"use client";

import { useEffect, useState } from "react";

type CommLog = {
  id: string;
  subject: string | null;
  body: string | null;
  template_key: string;
  trigger_event: string | null;
  created_at: string;
};

function triggerLabel(log: CommLog): { text: string; color: string; bg: string } {
  if (log.trigger_event === "stage_result") {
    return { text: "Resultado de etapa", color: "var(--success)", bg: "var(--success-soft)" };
  }
  if (log.template_key === "support.reply") {
    return { text: "Respuesta soporte", color: "var(--uwc-blue)", bg: "var(--uwc-blue-soft)" };
  }
  return { text: "Notificación", color: "var(--muted)", bg: "var(--sand-light)" };
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function truncate(text: string, max = 160) {
  return text.length > max ? text.slice(0, max) + "…" : text;
}

export function ApplicantCommunicationsDashboard({
  applicationId,
}: {
  applicationId?: string;
}) {
  const [comms, setComms] = useState<CommLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.resolve()
      .then(() => {
        if (!cancelled) {
          setLoading(true);
          setError(null);
        }
        const query = applicationId ? `?applicationId=${applicationId}` : "";
        return fetch(`/api/applicant/communications${query}`);
      })
      .then(async (res) => {
        if (!res.ok) {
          const json = (await res.json()) as { userMessage?: string };
          throw new Error(json.userMessage ?? "Error al cargar notificaciones.");
        }
        return res.json() as Promise<{ communications: CommLog[] }>;
      })
      .then((json) => {
        if (!cancelled) {
          setComms(json.communications);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Error al cargar notificaciones.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [applicationId]);

  if (loading) {
    return (
      <p style={{ color: "var(--muted)", fontSize: "13px", textAlign: "center", padding: "24px 0" }}>
        Cargando notificaciones…
      </p>
    );
  }

  if (error) {
    return (
      <p style={{ color: "var(--danger)", fontSize: "13px", textAlign: "center", padding: "16px 0" }}>
        {error}
      </p>
    );
  }

  if (comms.length === 0) {
    return (
      <p style={{ color: "var(--muted)", fontSize: "13px", textAlign: "center", padding: "24px 0" }}>
        No hay notificaciones aún.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {comms.map((log) => {
        const badge = triggerLabel(log);
        return (
          <div
            key={log.id}
            style={{
              display: "flex",
              gap: "14px",
              alignItems: "flex-start",
            }}
          >
            {/* Timeline dot */}
            <div
              style={{
                width: "10px",
                height: "10px",
                borderRadius: "50%",
                background: badge.color,
                marginTop: "5px",
                flexShrink: 0,
              }}
            />
            <div style={{ flex: 1 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  flexWrap: "wrap",
                  marginBottom: "4px",
                }}
              >
                <span style={{ fontWeight: 600, fontSize: "13px" }}>
                  {log.subject ?? "Notificación"}
                </span>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    color: badge.color,
                    background: badge.bg,
                    padding: "2px 8px",
                    borderRadius: "20px",
                  }}
                >
                  {badge.text}
                </span>
              </div>
              {log.body && (
                <p style={{ fontSize: "12px", color: "var(--ink-light)", margin: "0 0 4px" }}>
                  {truncate(log.body)}
                </p>
              )}
              <p style={{ fontSize: "11px", color: "var(--muted)", margin: 0 }}>
                {formatDate(log.created_at)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
