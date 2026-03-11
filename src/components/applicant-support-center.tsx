"use client";

import { useEffect, useMemo, useState } from "react";
import type { SupportTicketStatus } from "@/types/domain";

type TicketRow = {
  id: string;
  application_id: string;
  subject: string;
  body: string;
  status: SupportTicketStatus;
  admin_reply: string | null;
  replied_at: string | null;
  created_at: string;
};

type ThreadMessage = {
  id: string;
  author: "applicant" | "admin";
  body: string;
  createdAt: string;
};

const STATUS_LABEL: Record<SupportTicketStatus, string> = {
  open: "Abierto",
  replied: "Respondido",
  closed: "Cerrado",
};

const STATUS_COLOR: Record<SupportTicketStatus, string> = {
  open: "var(--warning)",
  replied: "var(--uwc-blue)",
  closed: "var(--muted)",
};

const STATUS_BG: Record<SupportTicketStatus, string> = {
  open: "var(--warning-soft)",
  replied: "var(--uwc-blue-soft)",
  closed: "var(--sand-light)",
};

const THREAD_SEPARATOR = "\n\n---\n\n";

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function parseThreadText({
  value,
  fallbackRole,
  fallbackAt,
}: {
  value: string | null;
  fallbackRole: "applicant" | "admin";
  fallbackAt: string | null;
}) {
  if (!value?.trim()) {
    return [] as ThreadMessage[];
  }

  const chunks = value
    .split(THREAD_SEPARATOR)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  return chunks.map((chunk, index) => {
    const match = chunk.match(/^\[([^\]]+)\]\s+(.+?)\n([\s\S]+)$/);
    if (!match) {
      return {
        id: `${fallbackRole}-${index}`,
        author: fallbackRole,
        createdAt: fallbackAt ?? new Date(0).toISOString(),
        body: chunk,
      } as ThreadMessage;
    }

    const [, authoredAt, authorLabel, body] = match;
    const normalizedRole = /equipo|admin/i.test(authorLabel) ? "admin" : "applicant";
    return {
      id: `${normalizedRole}-${authoredAt}-${index}`,
      author: normalizedRole,
      createdAt: authoredAt,
      body: body.trim(),
    } as ThreadMessage;
  });
}

function buildThread(ticket: TicketRow | null) {
  if (!ticket) {
    return [] as ThreadMessage[];
  }

  const applicantMessages = parseThreadText({
    value: ticket.body,
    fallbackRole: "applicant",
    fallbackAt: ticket.created_at,
  });

  const adminMessages = parseThreadText({
    value: ticket.admin_reply,
    fallbackRole: "admin",
    fallbackAt: ticket.replied_at,
  });

  return [...applicantMessages, ...adminMessages].sort((a, b) => {
    const aTime = new Date(a.createdAt).getTime();
    const bTime = new Date(b.createdAt).getTime();
    if (aTime === bTime) {
      if (a.author === b.author) return 0;
      return a.author === "applicant" ? -1 : 1;
    }
    return aTime - bTime;
  });
}

export function ApplicantSupportCenter({
  defaultApplicationId,
}: {
  defaultApplicationId: string | null;
}) {
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [newBody, setNewBody] = useState("");
  const [followUpBody, setFollowUpBody] = useState("");
  const [sendingNew, setSendingNew] = useState(false);
  const [sendingFollowUp, setSendingFollowUp] = useState(false);
  const [formMessage, setFormMessage] = useState<string | null>(null);

  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === selectedTicketId) ?? null,
    [tickets, selectedTicketId],
  );

  const thread = useMemo(() => buildThread(selectedTicket), [selectedTicket]);

  async function loadTickets() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/support");
      if (!res.ok) {
        const json = (await res.json()) as { userMessage?: string };
        setError(json.userMessage ?? "No se pudo cargar tus consultas.");
        return;
      }
      const json = (await res.json()) as { tickets?: TicketRow[] };
      const rows = json.tickets ?? [];
      setTickets(rows);
      setSelectedTicketId((current) => {
        if (current && rows.some((row) => row.id === current)) {
          return current;
        }
        return rows[0]?.id ?? null;
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTickets();
  }, []);

  async function handleCreateTicket(e: React.FormEvent) {
    e.preventDefault();
    if (!defaultApplicationId) {
      setFormMessage("Para abrir una consulta nueva, primero inicia una postulación.");
      return;
    }

    setSendingNew(true);
    setFormMessage(null);
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId: defaultApplicationId,
          subject,
          body: newBody,
        }),
      });

      if (!res.ok) {
        const json = (await res.json()) as { userMessage?: string };
        setFormMessage(json.userMessage ?? "No se pudo crear la consulta.");
        return;
      }

      const json = (await res.json()) as { ticket?: TicketRow };
      setSubject("");
      setNewBody("");
      setSelectedTicketId(json.ticket?.id ?? null);
      setFormMessage("Consulta enviada correctamente.");
      await loadTickets();
    } finally {
      setSendingNew(false);
    }
  }

  async function handleFollowUp(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTicket) {
      return;
    }

    setSendingFollowUp(true);
    setFormMessage(null);
    try {
      const res = await fetch(`/api/support/${selectedTicket.id}/follow-up`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: followUpBody }),
      });

      if (!res.ok) {
        const json = (await res.json()) as { userMessage?: string };
        setFormMessage(json.userMessage ?? "No se pudo enviar el seguimiento.");
        return;
      }

      setFollowUpBody("");
      setFormMessage("Seguimiento enviado.");
      await loadTickets();
    } finally {
      setSendingFollowUp(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: "16px" }}>
      <div
        style={{
          display: "grid",
          gap: "16px",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
        }}
      >
        <section
          style={{
            background: "var(--surface)",
            border: "1px solid var(--sand)",
            borderRadius: "var(--radius-lg)",
            padding: "16px",
          }}
        >
          <h2 style={{ margin: "0 0 12px", fontSize: "16px", color: "var(--ink)" }}>Nueva consulta</h2>
          <form onSubmit={handleCreateTicket} style={{ display: "grid", gap: "10px" }}>
            <label style={{ display: "grid", gap: "4px", fontSize: "13px", color: "var(--ink-light)" }}>
              Asunto
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                required
                minLength={5}
                maxLength={200}
                disabled={sendingNew || !defaultApplicationId}
                style={{
                  width: "100%",
                  padding: "9px 11px",
                  borderRadius: "var(--radius)",
                  border: "1px solid var(--sand)",
                  background: "var(--paper)",
                  color: "var(--ink)",
                  boxSizing: "border-box",
                }}
              />
            </label>
            <label style={{ display: "grid", gap: "4px", fontSize: "13px", color: "var(--ink-light)" }}>
              Describe tu consulta
              <textarea
                value={newBody}
                onChange={(e) => setNewBody(e.target.value)}
                required
                minLength={10}
                maxLength={2000}
                rows={4}
                disabled={sendingNew || !defaultApplicationId}
                style={{
                  width: "100%",
                  padding: "9px 11px",
                  borderRadius: "var(--radius)",
                  border: "1px solid var(--sand)",
                  resize: "vertical",
                  background: "var(--paper)",
                  color: "var(--ink)",
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                }}
              />
            </label>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                type="submit"
                disabled={sendingNew || !defaultApplicationId}
                style={{
                  border: "none",
                  background: sendingNew || !defaultApplicationId ? "var(--muted)" : "var(--uwc-maroon)",
                  color: "#fff",
                  borderRadius: "var(--radius)",
                  padding: "9px 14px",
                  fontSize: "13px",
                  fontWeight: 700,
                  cursor: sendingNew || !defaultApplicationId ? "not-allowed" : "pointer",
                }}
              >
                {sendingNew ? "Enviando..." : "Enviar consulta"}
              </button>
            </div>
          </form>
          {!defaultApplicationId ? (
            <p style={{ margin: "10px 0 0", fontSize: "12px", color: "var(--muted)" }}>
              Necesitas una postulación iniciada para crear nuevas consultas.
            </p>
          ) : null}
        </section>

        <section
          style={{
            background: "var(--surface)",
            border: "1px solid var(--sand)",
            borderRadius: "var(--radius-lg)",
            padding: "16px",
          }}
        >
          <h2 style={{ margin: "0 0 12px", fontSize: "16px", color: "var(--ink)" }}>Tus hilos de soporte</h2>
          {loading ? (
            <p style={{ margin: 0, color: "var(--muted)", fontSize: "13px" }}>Cargando consultas...</p>
          ) : null}
          {!loading && tickets.length === 0 ? (
            <p style={{ margin: 0, color: "var(--muted)", fontSize: "13px" }}>
              Aún no tienes consultas enviadas.
            </p>
          ) : null}
          {!loading && tickets.length > 0 ? (
            <div style={{ display: "grid", gap: "8px", maxHeight: "280px", overflowY: "auto" }}>
              {tickets.map((ticket) => {
                const isSelected = ticket.id === selectedTicketId;
                return (
                  <button
                    key={ticket.id}
                    type="button"
                    onClick={() => setSelectedTicketId(ticket.id)}
                    style={{
                      textAlign: "left",
                      borderRadius: "var(--radius)",
                      border: `1px solid ${isSelected ? "var(--uwc-maroon)" : "var(--sand)"}`,
                      background: isSelected ? "var(--uwc-maroon-soft)" : "var(--paper)",
                      padding: "10px 12px",
                      cursor: "pointer",
                      display: "grid",
                      gap: "5px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center" }}>
                      <span style={{ fontSize: "13px", color: "var(--ink)", fontWeight: 700 }}>{ticket.subject}</span>
                      <span
                        style={{
                          fontSize: "10px",
                          fontWeight: 700,
                          color: STATUS_COLOR[ticket.status],
                          background: STATUS_BG[ticket.status],
                          borderRadius: "999px",
                          padding: "2px 8px",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {STATUS_LABEL[ticket.status]}
                      </span>
                    </div>
                    <span style={{ fontSize: "11px", color: "var(--muted)" }}>{formatDate(ticket.created_at)}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </section>
      </div>

      {error ? (
        <div
          style={{
            background: "var(--danger-soft)",
            color: "var(--danger)",
            borderRadius: "var(--radius)",
            padding: "10px 12px",
            fontSize: "13px",
          }}
        >
          {error}
        </div>
      ) : null}

      {formMessage ? (
        <div
          style={{
            background: "var(--uwc-blue-soft)",
            color: "var(--uwc-blue)",
            borderRadius: "var(--radius)",
            padding: "10px 12px",
            fontSize: "13px",
          }}
        >
          {formMessage}
        </div>
      ) : null}

      <section
        style={{
          background: "var(--surface)",
          border: "1px solid var(--sand)",
          borderRadius: "var(--radius-lg)",
          padding: "16px",
        }}
      >
        <h2 style={{ margin: "0 0 4px", fontSize: "16px", color: "var(--ink)" }}>
          {selectedTicket ? selectedTicket.subject : "Selecciona una consulta"}
        </h2>
        {selectedTicket ? (
          <p style={{ margin: "0 0 14px", color: "var(--muted)", fontSize: "12px" }}>
            Estado actual: {STATUS_LABEL[selectedTicket.status]}
          </p>
        ) : null}

        {!selectedTicket ? (
          <p style={{ margin: 0, color: "var(--muted)", fontSize: "13px" }}>
            Selecciona un hilo para ver el historial y continuar la conversación.
          </p>
        ) : (
          <>
            <div style={{ display: "grid", gap: "10px", marginBottom: "14px" }}>
              {thread.map((message) => {
                const isApplicant = message.author === "applicant";
                return (
                  <article
                    key={message.id}
                    style={{
                      border: `1px solid ${isApplicant ? "var(--sand)" : "var(--uwc-blue)"}`,
                      borderLeftWidth: 3,
                      borderLeftColor: isApplicant ? "var(--uwc-maroon)" : "var(--uwc-blue)",
                      borderRadius: "var(--radius)",
                      padding: "10px 12px",
                      background: isApplicant ? "var(--paper)" : "var(--uwc-blue-soft)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "8px",
                        marginBottom: "5px",
                        alignItems: "center",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          color: isApplicant ? "var(--uwc-maroon)" : "var(--uwc-blue)",
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                        }}
                      >
                        {isApplicant ? "Postulante" : "Equipo UWC"}
                      </span>
                      <span style={{ fontSize: "11px", color: "var(--muted)" }}>{formatDate(message.createdAt)}</span>
                    </div>
                    <p style={{ margin: 0, whiteSpace: "pre-wrap", color: "var(--ink)", fontSize: "13px" }}>
                      {message.body}
                    </p>
                  </article>
                );
              })}
            </div>

            {selectedTicket.status !== "closed" ? (
              <form onSubmit={handleFollowUp} style={{ display: "grid", gap: "10px" }}>
                <label style={{ display: "grid", gap: "4px", fontSize: "13px", color: "var(--ink-light)" }}>
                  Seguimiento
                  <textarea
                    value={followUpBody}
                    onChange={(e) => setFollowUpBody(e.target.value)}
                    required
                    minLength={10}
                    maxLength={2000}
                    rows={3}
                    disabled={sendingFollowUp}
                    placeholder="Agrega contexto o una pregunta de seguimiento..."
                    style={{
                      width: "100%",
                      padding: "9px 11px",
                      borderRadius: "var(--radius)",
                      border: "1px solid var(--sand)",
                      resize: "vertical",
                      background: "var(--paper)",
                      color: "var(--ink)",
                      fontFamily: "inherit",
                      boxSizing: "border-box",
                    }}
                  />
                </label>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    type="submit"
                    disabled={sendingFollowUp}
                    style={{
                      border: "none",
                      background: sendingFollowUp ? "var(--muted)" : "var(--uwc-maroon)",
                      color: "#fff",
                      borderRadius: "var(--radius)",
                      padding: "9px 14px",
                      fontSize: "13px",
                      fontWeight: 700,
                      cursor: sendingFollowUp ? "not-allowed" : "pointer",
                    }}
                  >
                    {sendingFollowUp ? "Enviando..." : "Enviar seguimiento"}
                  </button>
                </div>
              </form>
            ) : (
              <p style={{ margin: 0, fontSize: "12px", color: "var(--muted)" }}>
                Este hilo está cerrado. Si necesitas ayuda adicional, crea una nueva consulta.
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
