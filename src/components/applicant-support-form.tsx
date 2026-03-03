"use client";

import { useEffect, useRef, useState } from "react";
import type { SupportTicketStatus } from "@/types/domain";

type TicketRow = {
  id: string;
  subject: string;
  body: string;
  status: SupportTicketStatus;
  admin_reply: string | null;
  replied_at: string | null;
  created_at: string;
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

const MAX_OPEN = 3;

export function ApplicantSupportForm({
  applicationId,
}: {
  applicationId: string;
}) {
  const [open, setOpen] = useState(false);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const openCount = tickets.filter((t) => t.status === "open").length;
  const atLimit = openCount >= MAX_OPEN;

  async function loadTickets() {
    setLoading(true);
    try {
      const res = await fetch("/api/support");
      if (res.ok) {
        const json = (await res.json()) as { tickets: TicketRow[] };
        setTickets(json.tickets);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) {
      loadTickets();
      // Guard: showModal is not available in all environments (e.g. jsdom in tests)
      if (typeof dialogRef.current?.showModal === "function") {
        dialogRef.current.showModal();
      }
    } else {
      // Guard: close is not available in all environments (e.g. jsdom in tests)
      if (typeof dialogRef.current?.close === "function") {
        dialogRef.current.close();
      }
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId, subject, body }),
      });
      if (!res.ok) {
        const json = (await res.json()) as { userMessage?: string };
        setError(json.userMessage ?? "No se pudo enviar la consulta.");
        return;
      }
      setSubject("");
      setBody("");
      setSuccess(true);
      await loadTickets();
      setTimeout(() => setSuccess(false), 3500);
    } finally {
      setSubmitting(false);
    }
  }

  function formatDate(value: string) {
    return new Date(value).toLocaleDateString("es-PE", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  return (
    <>
      {/* Floating trigger button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          position: "fixed",
          bottom: "24px",
          right: "24px",
          zIndex: 1200,
          background: "var(--uwc-maroon)",
          color: "#fff",
          border: "none",
          borderRadius: "28px",
          padding: "10px 20px",
          fontSize: "14px",
          fontWeight: 600,
          cursor: "pointer",
          boxShadow: "var(--shadow-md)",
          display: "flex",
          alignItems: "center",
          gap: "6px",
        }}
        aria-label="Abrir ayuda y soporte"
      >
        <span aria-hidden="true">?</span> Ayuda
      </button>

      {/* Modal dialog */}
      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        style={{
          position: "fixed",
          border: "none",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-md)",
          padding: 0,
          maxWidth: "520px",
          width: "calc(100vw - 32px)",
          maxHeight: "80vh",
          background: "var(--surface)",
          color: "var(--ink)",
          overflow: "hidden",
          display: open ? "flex" : undefined,
          flexDirection: "column",
        }}
        aria-modal="true"
        aria-label="Panel de ayuda y soporte"
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid var(--sand)",
            background: "var(--cream)",
            flexShrink: 0,
          }}
        >
          <span style={{ fontWeight: 700, fontSize: "16px" }}>Ayuda y soporte</span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Cerrar"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "20px",
              color: "var(--ink-light)",
              lineHeight: 1,
              padding: "2px 6px",
            }}
          >
            ×
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ overflowY: "auto", flex: 1, padding: "20px" }}>
          {/* New ticket form */}
          <div style={{ marginBottom: "24px" }}>
            <p style={{ fontWeight: 600, marginBottom: "12px", fontSize: "14px" }}>
              Nueva consulta
            </p>

            {atLimit && (
              <div
                style={{
                  background: "var(--warning-soft)",
                  color: "var(--warning)",
                  borderRadius: "var(--radius)",
                  padding: "10px 14px",
                  fontSize: "13px",
                  marginBottom: "12px",
                }}
              >
                Tienes el máximo de {MAX_OPEN} consultas abiertas. Espera una respuesta antes de
                crear otra.
              </div>
            )}

            {success && (
              <div
                style={{
                  background: "var(--success-soft)",
                  color: "var(--success)",
                  borderRadius: "var(--radius)",
                  padding: "10px 14px",
                  fontSize: "13px",
                  marginBottom: "12px",
                }}
              >
                ¡Consulta enviada! Te responderemos pronto.
              </div>
            )}

            {error && (
              <div
                style={{
                  background: "var(--danger-soft)",
                  color: "var(--danger)",
                  borderRadius: "var(--radius)",
                  padding: "10px 14px",
                  fontSize: "13px",
                  marginBottom: "12px",
                }}
              >
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <label
                  htmlFor="support-subject"
                  style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "4px" }}
                >
                  Asunto
                </label>
                <input
                  id="support-subject"
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  maxLength={200}
                  minLength={5}
                  required
                  disabled={atLimit || submitting}
                  placeholder="Ej. No puedo cargar mi documento"
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid var(--sand)",
                    borderRadius: "var(--radius)",
                    fontSize: "14px",
                    background: "var(--paper)",
                    color: "var(--ink)",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <label
                  htmlFor="support-body"
                  style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "4px" }}
                >
                  Describe tu consulta
                </label>
                <textarea
                  id="support-body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  maxLength={2000}
                  minLength={10}
                  required
                  rows={4}
                  disabled={atLimit || submitting}
                  placeholder="Cuéntanos en detalle qué problema tienes o qué necesitas saber..."
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid var(--sand)",
                    borderRadius: "var(--radius)",
                    fontSize: "14px",
                    resize: "vertical",
                    background: "var(--paper)",
                    color: "var(--ink)",
                    fontFamily: "inherit",
                    boxSizing: "border-box",
                  }}
                />
                <span style={{ fontSize: "11px", color: "var(--muted)" }}>{body.length}/2000</span>
              </div>

              <button
                type="submit"
                disabled={atLimit || submitting}
                style={{
                  background: atLimit || submitting ? "var(--muted)" : "var(--uwc-maroon)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "var(--radius)",
                  padding: "9px 18px",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: atLimit || submitting ? "not-allowed" : "pointer",
                  alignSelf: "flex-end",
                }}
              >
                {submitting ? "Enviando…" : "Enviar consulta"}
              </button>
            </form>
          </div>

          {/* Existing tickets */}
          {(tickets.length > 0 || loading) && (
            <div>
              <p style={{ fontWeight: 600, fontSize: "14px", marginBottom: "12px" }}>
                Tus consultas anteriores
              </p>
              {loading && (
                <p style={{ color: "var(--muted)", fontSize: "13px" }}>Cargando…</p>
              )}
              {!loading &&
                tickets.map((ticket) => (
                  <div
                    key={ticket.id}
                    style={{
                      border: "1px solid var(--sand)",
                      borderRadius: "var(--radius)",
                      padding: "12px 16px",
                      marginBottom: "10px",
                      background: "var(--cream)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "8px",
                        marginBottom: "6px",
                      }}
                    >
                      <span style={{ fontWeight: 600, fontSize: "13px" }}>{ticket.subject}</span>
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          color: STATUS_COLOR[ticket.status],
                          background: "var(--sand-light)",
                          padding: "2px 8px",
                          borderRadius: "20px",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {STATUS_LABEL[ticket.status]}
                      </span>
                    </div>
                    <p style={{ fontSize: "12px", color: "var(--ink-light)", margin: "0 0 6px" }}>
                      {ticket.body}
                    </p>
                    {ticket.admin_reply && (
                      <div
                        style={{
                          background: "var(--uwc-blue-soft)",
                          borderLeft: "3px solid var(--uwc-blue)",
                          borderRadius: "0 var(--radius) var(--radius) 0",
                          padding: "8px 12px",
                          marginTop: "8px",
                        }}
                      >
                        <p style={{ fontSize: "11px", fontWeight: 700, color: "var(--uwc-blue)", marginBottom: "4px" }}>
                          Respuesta del equipo
                        </p>
                        <p style={{ fontSize: "12px", color: "var(--ink)", margin: 0 }}>
                          {ticket.admin_reply}
                        </p>
                        {ticket.replied_at && (
                          <p style={{ fontSize: "11px", color: "var(--muted)", marginTop: "4px" }}>
                            {formatDate(ticket.replied_at)}
                          </p>
                        )}
                      </div>
                    )}
                    <p style={{ fontSize: "11px", color: "var(--muted)", marginTop: "8px" }}>
                      {formatDate(ticket.created_at)}
                    </p>
                  </div>
                ))}
            </div>
          )}
        </div>
      </dialog>
    </>
  );
}
