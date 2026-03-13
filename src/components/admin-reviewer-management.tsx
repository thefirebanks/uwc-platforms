"use client";

import { useEffect, useRef, useState } from "react";
import { fetchApi, fetchApiResponse, toNormalizedApiError } from "@/lib/client/api-client";

type Reviewer = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
};

function formatName(r: Reviewer) {
  return r.full_name?.trim() || r.email;
}

export function AdminReviewerManagement() {
  const [reviewers, setReviewers] = useState<Reviewer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Promote form
  const [promoteEmail, setPromoteEmail] = useState("");
  const [promoting, setPromoting] = useState(false);
  const [promoteError, setPromoteError] = useState<string | null>(null);
  const [promoteSuccess, setPromoteSuccess] = useState<string | null>(null);

  // Demote confirmation
  const [demotingId, setDemotingId] = useState<string | null>(null);
  const [demoteError, setDemoteError] = useState<Record<string, string>>({});

  const emailInputRef = useRef<HTMLInputElement>(null);

  async function loadReviewers() {
    setLoading(true);
    setError(null);
    try {
      const json = await fetchApi<{ reviewers: Reviewer[] }>(
        "/api/admin/reviewers",
      );
      setReviewers(json.reviewers);
    } catch (error) {
      setError(
        toNormalizedApiError(error, "Error de conexión. Intenta nuevamente.")
          .message,
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadReviewers();
  }, []);

  async function handlePromote(e: React.FormEvent) {
    e.preventDefault();
    if (!promoteEmail.trim()) return;

    setPromoting(true);
    setPromoteError(null);
    setPromoteSuccess(null);

    try {
      const json = await fetchApi<{ reviewer: Reviewer }>(
        "/api/admin/reviewers",
        {
          method: "POST",
          body: JSON.stringify({ email: promoteEmail.trim() }),
        },
      );

      setPromoteSuccess(
        `${formatName(json.reviewer)} ha sido agregado como revisor.`,
      );
      setPromoteEmail("");
      emailInputRef.current?.focus();
      await loadReviewers();
    } catch (error) {
      setPromoteError(
        toNormalizedApiError(error, "Error de conexión. Intenta nuevamente.")
          .message,
      );
    } finally {
      setPromoting(false);
    }
  }

  async function handleDemote(reviewer: Reviewer) {
    setDemotingId(reviewer.id);
    setDemoteError((prev) => ({ ...prev, [reviewer.id]: "" }));

    try {
      await fetchApiResponse(`/api/admin/reviewers/${reviewer.id}`, {
        method: "DELETE",
      });

      await loadReviewers();
    } catch (error) {
      setDemoteError((prev) => ({
        ...prev,
        [reviewer.id]: toNormalizedApiError(
          error,
          "Error de conexión. Intenta nuevamente.",
        ).message,
      }));
    } finally {
      setDemotingId(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
      {/* Add reviewer form */}
      <section
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "12px",
          padding: "24px",
        }}
      >
        <h2
          style={{
            fontSize: "15px",
            fontWeight: 700,
            color: "var(--ink)",
            marginBottom: "16px",
          }}
        >
          Agregar revisor
        </h2>
        <p style={{ fontSize: "13px", color: "var(--muted)", marginBottom: "16px" }}>
          El usuario debe haber creado su cuenta primero. Ingresa su correo para
          otorgarle el rol de revisor.
        </p>
        <form
          onSubmit={(e) => void handlePromote(e)}
          style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}
        >
          <div style={{ flex: 1 }}>
            <input
              ref={emailInputRef}
              type="email"
              value={promoteEmail}
              onChange={(e) => setPromoteEmail(e.target.value)}
              placeholder="correo@ejemplo.com"
              disabled={promoting}
              style={{
                width: "100%",
                padding: "9px 12px",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                fontSize: "14px",
                color: "var(--ink)",
                background: "var(--bg)",
                boxSizing: "border-box",
              }}
            />
          </div>
          <button
            type="submit"
            disabled={promoting || !promoteEmail.trim()}
            className="btn btn-primary"
            style={{ whiteSpace: "nowrap" }}
          >
            {promoting ? "Agregando..." : "Agregar revisor"}
          </button>
        </form>

        {promoteError && (
          <p
            style={{
              marginTop: "10px",
              fontSize: "13px",
              color: "var(--danger)",
            }}
          >
            {promoteError}
          </p>
        )}
        {promoteSuccess && (
          <p
            style={{
              marginTop: "10px",
              fontSize: "13px",
              color: "var(--success)",
            }}
          >
            {promoteSuccess}
          </p>
        )}
      </section>

      {/* Reviewer list */}
      <section>
        <h2
          style={{
            fontSize: "15px",
            fontWeight: 700,
            color: "var(--ink)",
            marginBottom: "16px",
          }}
        >
          Revisores activos
        </h2>

        {loading && (
          <div style={{ color: "var(--muted)", textAlign: "center", padding: "32px 0" }}>
            Cargando revisores...
          </div>
        )}

        {!loading && error && (
          <div
            style={{
              padding: "16px",
              background: "var(--danger-soft)",
              color: "var(--danger)",
              borderRadius: "8px",
            }}
          >
            {error}
          </div>
        )}

        {!loading && !error && reviewers.length === 0 && (
          <div
            style={{
              padding: "48px 32px",
              textAlign: "center",
              color: "var(--muted)",
              background: "var(--surface)",
              borderRadius: "12px",
              border: "1px solid var(--border)",
            }}
          >
            No hay revisores registrados.
          </div>
        )}

        {!loading && !error && reviewers.length > 0 && (
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "12px",
              overflow: "hidden",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "var(--sand-light)" }}>
                  {["Nombre", "Correo", "Acciones"].map((col) => (
                    <th
                      key={col}
                      style={{
                        padding: "12px 16px",
                        textAlign: "left",
                        fontSize: "11px",
                        fontWeight: 700,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        color: "var(--muted)",
                        borderBottom: "1px solid var(--border)",
                      }}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reviewers.map((reviewer, idx) => (
                  <tr
                    key={reviewer.id}
                    style={{
                      borderBottom:
                        idx < reviewers.length - 1
                          ? "1px solid var(--border)"
                          : "none",
                    }}
                  >
                    <td
                      style={{
                        padding: "14px 16px",
                        fontSize: "14px",
                        fontWeight: 500,
                        color: "var(--ink)",
                      }}
                    >
                      {reviewer.full_name?.trim() || (
                        <span style={{ color: "var(--muted)", fontStyle: "italic" }}>
                          Sin nombre
                        </span>
                      )}
                    </td>
                    <td
                      style={{
                        padding: "14px 16px",
                        fontSize: "13px",
                        color: "var(--muted)",
                      }}
                    >
                      {reviewer.email}
                    </td>
                    <td style={{ padding: "14px 16px" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        <button
                          type="button"
                          disabled={demotingId === reviewer.id}
                          onClick={() => void handleDemote(reviewer)}
                          className="btn btn-outline"
                          style={{
                            fontSize: "12px",
                            padding: "5px 12px",
                            color: "var(--danger)",
                            borderColor: "var(--danger)",
                          }}
                        >
                          {demotingId === reviewer.id ? "Revocando..." : "Revocar rol"}
                        </button>
                        {demoteError[reviewer.id] && (
                          <span
                            style={{ fontSize: "11px", color: "var(--danger)" }}
                          >
                            {demoteError[reviewer.id]}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
