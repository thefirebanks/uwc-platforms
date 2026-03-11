"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { SupportTicketStatus } from "@/types/domain";

type TicketRow = {
  id: string;
  status: SupportTicketStatus;
};

const MAX_OPEN = 3;

export function ApplicantSupportForm({
  applicationId,
  supportHref = "/applicant/support",
}: {
  applicationId: string;
  supportHref?: string;
}) {
  const [open, setOpen] = useState(false);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const openCount = tickets.filter((ticket) => ticket.status === "open").length;
  const atLimit = openCount >= MAX_OPEN;

  async function loadTickets() {
    setLoadingTickets(true);
    try {
      const res = await fetch("/api/support");
      if (!res.ok) {
        return;
      }
      const json = (await res.json()) as { tickets?: TicketRow[] };
      setTickets(json.tickets ?? []);
    } finally {
      setLoadingTickets(false);
    }
  }

  useEffect(() => {
    if (!open) {
      if (typeof dialogRef.current?.close === "function") {
        dialogRef.current.close();
      }
      return;
    }

    void loadTickets();
    if (typeof dialogRef.current?.showModal === "function") {
      dialogRef.current.showModal();
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

  return (
    <>
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
          fontWeight: 700,
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

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        style={{
          position: "fixed",
          border: "none",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-md)",
          padding: 0,
          maxWidth: "620px",
          width: "calc(100vw - 32px)",
          maxHeight: "84vh",
          background: "var(--surface)",
          color: "var(--ink)",
          overflow: "hidden",
          display: open ? "flex" : undefined,
          flexDirection: "column",
        }}
        aria-modal="true"
        aria-label="Panel de ayuda y soporte"
      >
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

        <div style={{ overflowY: "auto", flex: 1, padding: "20px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "12px",
              marginBottom: "14px",
              flexWrap: "wrap",
            }}
          >
            <div>
              <p style={{ margin: 0, fontWeight: 700, fontSize: "14px", color: "var(--ink)" }}>
                Nueva consulta
              </p>
              <p style={{ margin: "3px 0 0", fontSize: "12px", color: "var(--ink-light)" }}>
                Usa esta ventana para enviar una consulta rápida.
              </p>
            </div>
            <Link
              href={supportHref}
              onClick={() => setOpen(false)}
              style={{
                textDecoration: "none",
                fontSize: "12px",
                fontWeight: 700,
                color: "var(--uwc-blue)",
                background: "var(--uwc-blue-soft)",
                borderRadius: "999px",
                padding: "7px 12px",
                border: "1px solid color-mix(in srgb, var(--uwc-blue) 35%, transparent)",
              }}
            >
              Abrir centro de mensajes
            </Link>
          </div>

          <div
            style={{
              fontSize: "12px",
              color: "var(--muted)",
              marginBottom: "12px",
            }}
          >
            Consultas abiertas: <strong style={{ color: "var(--ink)" }}>{openCount}</strong>/{MAX_OPEN}
            {loadingTickets ? " (actualizando...)" : ""}
          </div>

          {atLimit ? (
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
              Tienes el máximo de {MAX_OPEN} consultas abiertas. Espera una respuesta antes de crear otra.
            </div>
          ) : null}

          {success ? (
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
              ¡Consulta enviada! Puedes seguir el hilo en la pestaña Soporte.
            </div>
          ) : null}

          {error ? (
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
          ) : null}

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
                  padding: "9px 12px",
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
                rows={5}
                disabled={atLimit || submitting}
                placeholder="Cuéntanos en detalle qué problema tienes o qué necesitas saber..."
                style={{
                  width: "100%",
                  padding: "9px 12px",
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
                fontWeight: 700,
                cursor: atLimit || submitting ? "not-allowed" : "pointer",
                alignSelf: "flex-end",
              }}
            >
              {submitting ? "Enviando…" : "Enviar consulta"}
            </button>
          </form>
        </div>
      </dialog>
    </>
  );
}
