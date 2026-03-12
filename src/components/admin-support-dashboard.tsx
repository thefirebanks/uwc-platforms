"use client";

import { useEffect, useState } from "react";
import { fetchApi, fetchApiResponse, toNormalizedApiError } from "@/lib/client/api-client";
import type { SupportTicketStatus } from "@/types/domain";

type AdminTicket = {
  id: string;
  application_id: string;
  applicant_id: string;
  subject: string;
  body: string;
  status: SupportTicketStatus;
  admin_reply: string | null;
  replied_at: string | null;
  created_at: string;
  applicant_name: string | null;
  applicant_email: string | null;
};

const STATUS_OPTIONS: Array<{ value: SupportTicketStatus | "all"; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "open", label: "Abiertos" },
  { value: "replied", label: "Respondidos" },
  { value: "closed", label: "Cerrados" },
];

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

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AdminSupportDashboard() {
  const [tickets, setTickets] = useState<AdminTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<SupportTicketStatus | "all">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [actionError, setActionError] = useState<Record<string, string>>({});

  async function loadTickets(status?: SupportTicketStatus) {
    setLoading(true);
    setError(null);
    try {
      const url = status ? `/api/support?status=${status}` : "/api/support";
      const json = await fetchApi<{ tickets: AdminTicket[] }>(url);
      setTickets(json.tickets);
    } catch (requestError) {
      setError(
        toNormalizedApiError(
          requestError,
          "Error al cargar las consultas.",
        ).message,
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTickets(filter === "all" ? undefined : filter);
  }, [filter]);

  async function handleReply(ticketId: string) {
    const text = replyText[ticketId]?.trim();
    if (!text) return;
    setSubmitting(ticketId);
    setActionError((prev) => ({ ...prev, [ticketId]: "" }));
    try {
      await fetchApiResponse(`/api/support/${ticketId}/reply`, {
        method: "POST",
        body: JSON.stringify({ adminReply: text }),
      });
      setReplyText((prev) => ({ ...prev, [ticketId]: "" }));
      await loadTickets(filter === "all" ? undefined : filter);
    } catch (requestError) {
      setActionError((prev) => ({
        ...prev,
        [ticketId]: toNormalizedApiError(
          requestError,
          "No se pudo enviar la respuesta.",
        ).message,
      }));
    } finally {
      setSubmitting(null);
    }
  }

  async function handleClose(ticketId: string) {
    setSubmitting(ticketId);
    setActionError((prev) => ({ ...prev, [ticketId]: "" }));
    try {
      await fetchApiResponse(`/api/support/${ticketId}/close`, {
        method: "POST",
      });
      setExpandedId((prev) => (prev === ticketId ? null : prev));
      await loadTickets(filter === "all" ? undefined : filter);
    } catch (requestError) {
      setActionError((prev) => ({
        ...prev,
        [ticketId]: toNormalizedApiError(
          requestError,
          "No se pudo cerrar la consulta.",
        ).message,
      }));
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div>
      {/* Filter bar */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          marginBottom: "20px",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <span style={{ fontWeight: 600, fontSize: "13px", color: "var(--ink-light)" }}>
          Estado:
        </span>
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setFilter(opt.value)}
            style={{
              padding: "5px 14px",
              borderRadius: "20px",
              border: "1px solid var(--sand)",
              background: filter === opt.value ? "var(--uwc-maroon)" : "var(--surface)",
              color: filter === opt.value ? "#fff" : "var(--ink)",
              fontSize: "13px",
              fontWeight: filter === opt.value ? 700 : 400,
              cursor: "pointer",
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Error / loading */}
      {error && (
        <div
          style={{
            background: "var(--danger-soft)",
            color: "var(--danger)",
            borderRadius: "var(--radius)",
            padding: "10px 14px",
            marginBottom: "16px",
            fontSize: "13px",
          }}
        >
          {error}
        </div>
      )}

      {loading && (
        <p style={{ color: "var(--muted)", fontSize: "13px", textAlign: "center", padding: "40px 0" }}>
          Cargando consultas…
        </p>
      )}

      {!loading && tickets.length === 0 && (
        <p style={{ color: "var(--muted)", fontSize: "13px", textAlign: "center", padding: "40px 0" }}>
          No hay consultas de soporte.
        </p>
      )}

      {!loading && tickets.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "13px",
            }}
          >
            <thead>
              <tr
                style={{
                  background: "var(--cream)",
                  borderBottom: "2px solid var(--sand)",
                }}
              >
                {["Asunto", "Postulante", "Estado", "Fecha", ""].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "10px 12px",
                      textAlign: "left",
                      fontWeight: 700,
                      color: "var(--ink-light)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tickets.map((ticket) => {
                const isExpanded = expandedId === ticket.id;
                return (
                  <>
                    <tr
                      key={ticket.id}
                      style={{
                        borderBottom: "1px solid var(--sand-light)",
                        background: isExpanded ? "var(--cream)" : "var(--surface)",
                        cursor: "pointer",
                      }}
                      onClick={() => setExpandedId(isExpanded ? null : ticket.id)}
                    >
                      <td style={{ padding: "10px 12px", fontWeight: 600, maxWidth: "240px" }}>
                        {ticket.subject}
                      </td>
                      <td style={{ padding: "10px 12px", color: "var(--ink-light)" }}>
                        <div>{ticket.applicant_name ?? "—"}</div>
                        {ticket.applicant_email && (
                          <div style={{ fontSize: "11px", color: "var(--muted)" }}>
                            {ticket.applicant_email}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <span
                          style={{
                            padding: "3px 10px",
                            borderRadius: "20px",
                            fontSize: "11px",
                            fontWeight: 700,
                            color: STATUS_COLOR[ticket.status],
                            background: STATUS_BG[ticket.status],
                          }}
                        >
                          {STATUS_LABEL[ticket.status]}
                        </span>
                      </td>
                      <td
                        style={{
                          padding: "10px 12px",
                          color: "var(--muted)",
                          whiteSpace: "nowrap",
                          fontSize: "12px",
                        }}
                      >
                        {formatDate(ticket.created_at)}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{ color: "var(--uwc-maroon)", fontSize: "12px", fontWeight: 600 }}>
                          {isExpanded ? "▲ Cerrar" : "▼ Ver"}
                        </span>
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr key={`${ticket.id}-detail`} style={{ background: "var(--cream)" }}>
                        <td
                          colSpan={5}
                          style={{ padding: "16px 20px", borderBottom: "2px solid var(--sand)" }}
                        >
                          <div style={{ marginBottom: "12px" }}>
                            <p style={{ fontWeight: 700, fontSize: "12px", marginBottom: "6px", color: "var(--ink-light)" }}>
                              CONSULTA
                            </p>
                            <p style={{ fontSize: "13px", color: "var(--ink)", whiteSpace: "pre-wrap" }}>
                              {ticket.body}
                            </p>
                          </div>

                          {ticket.admin_reply && (
                            <div
                              style={{
                                background: "var(--uwc-blue-soft)",
                                borderLeft: "3px solid var(--uwc-blue)",
                                borderRadius: "0 var(--radius) var(--radius) 0",
                                padding: "10px 14px",
                                marginBottom: "16px",
                              }}
                            >
                              <p style={{ fontWeight: 700, fontSize: "12px", color: "var(--uwc-blue)", marginBottom: "4px" }}>
                                RESPUESTA ENVIADA
                              </p>
                              <p style={{ fontSize: "13px", color: "var(--ink)", whiteSpace: "pre-wrap" }}>
                                {ticket.admin_reply}
                              </p>
                              {ticket.replied_at && (
                                <p style={{ fontSize: "11px", color: "var(--muted)", marginTop: "6px" }}>
                                  {formatDate(ticket.replied_at)}
                                </p>
                              )}
                            </div>
                          )}

                          {actionError[ticket.id] && (
                            <div
                              style={{
                                background: "var(--danger-soft)",
                                color: "var(--danger)",
                                borderRadius: "var(--radius)",
                                padding: "8px 12px",
                                fontSize: "12px",
                                marginBottom: "12px",
                              }}
                            >
                              {actionError[ticket.id]}
                            </div>
                          )}

                          {ticket.status !== "closed" && (
                            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                              <textarea
                                rows={3}
                                value={replyText[ticket.id] ?? ""}
                                onChange={(e) =>
                                  setReplyText((prev) => ({ ...prev, [ticket.id]: e.target.value }))
                                }
                                placeholder="Escribe tu respuesta…"
                                maxLength={5000}
                                disabled={submitting === ticket.id}
                                style={{
                                  width: "100%",
                                  padding: "8px 12px",
                                  border: "1px solid var(--sand)",
                                  borderRadius: "var(--radius)",
                                  fontSize: "13px",
                                  resize: "vertical",
                                  background: "var(--paper)",
                                  color: "var(--ink)",
                                  fontFamily: "inherit",
                                  boxSizing: "border-box",
                                }}
                              />
                              <div style={{ display: "flex", gap: "8px" }}>
                                <button
                                  type="button"
                                  onClick={() => handleReply(ticket.id)}
                                  disabled={
                                    !replyText[ticket.id]?.trim() || submitting === ticket.id
                                  }
                                  style={{
                                    background:
                                      !replyText[ticket.id]?.trim() || submitting === ticket.id
                                        ? "var(--muted)"
                                        : "var(--uwc-maroon)",
                                    color: "#fff",
                                    border: "none",
                                    borderRadius: "var(--radius)",
                                    padding: "8px 16px",
                                    fontSize: "13px",
                                    fontWeight: 600,
                                    cursor:
                                      !replyText[ticket.id]?.trim() || submitting === ticket.id
                                        ? "not-allowed"
                                        : "pointer",
                                  }}
                                >
                                  {submitting === ticket.id ? "Enviando…" : "Responder"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleClose(ticket.id)}
                                  disabled={submitting === ticket.id}
                                  style={{
                                    background: "var(--surface)",
                                    color: "var(--ink-light)",
                                    border: "1px solid var(--sand)",
                                    borderRadius: "var(--radius)",
                                    padding: "8px 16px",
                                    fontSize: "13px",
                                    cursor: submitting === ticket.id ? "not-allowed" : "pointer",
                                  }}
                                >
                                  Cerrar consulta
                                </button>
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
