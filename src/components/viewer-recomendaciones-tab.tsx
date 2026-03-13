"use client";

import { useCallback, useState } from "react";
import {
  fetchApiResponse,
  toNormalizedApiError,
} from "@/lib/client/api-client";
import {
  PANEL_CARD_STYLE,
  PANEL_SUBTLE_BUTTON_STYLE,
  PANEL_ACCENT_BUTTON_STYLE,
  PANEL_SUCCESS_BUTTON_STYLE,
  type ApplicationExport,
} from "@/components/admin-application-viewer-types";

// ─── Props ────────────────────────────────────────────────────────────

export interface ViewerRecomendacionesTabProps {
  recommendations: ApplicationExport["recommendations"];
  onReload: () => Promise<void>;
  onError: (message: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────

export function ViewerRecomendacionesTab({
  recommendations,
  onReload,
  onError,
}: ViewerRecomendacionesTabProps) {
  const [busyRecommendationId, setBusyRecommendationId] = useState<string | null>(null);

  const handleRecommendationEdit = useCallback(
    async (
      recommendationId: string,
      currentName: string | null,
      currentEmail: string,
      currentNotes: string | null,
    ) => {
      const recommenderName = window.prompt("Nombre del recomendador (opcional):", currentName ?? "");
      if (recommenderName === null) return;
      const recommenderEmail = window.prompt("Correo del recomendador:", currentEmail);
      if (recommenderEmail === null) return;
      const adminNotes = window.prompt("Notas internas (opcional):", currentNotes ?? "");
      if (adminNotes === null) return;
      const reason = window.prompt("Motivo del cambio:", "Correccion de contacto");
      if (!reason || reason.trim().length < 4) return;

      setBusyRecommendationId(recommendationId);
      try {
        await fetchApiResponse(`/api/recommendations/${recommendationId}`, {
          method: "PATCH",
          body: JSON.stringify({
            recommenderName,
            recommenderEmail,
            adminNotes,
            reason,
          }),
        });
        await onReload();
      } catch (requestError) {
        onError(
          toNormalizedApiError(requestError, "No se pudo actualizar la recomendacion.").message,
        );
      } finally {
        setBusyRecommendationId(null);
      }
    },
    [onReload, onError],
  );

  const handleRecommendationReminder = useCallback(
    async (recommendationId: string) => {
      setBusyRecommendationId(recommendationId);
      try {
        await fetchApiResponse(`/api/recommendations/${recommendationId}/remind`, {
          method: "POST",
        });
        await onReload();
      } catch (requestError) {
        onError(
          toNormalizedApiError(requestError, "No se pudo enviar el recordatorio.").message,
        );
      } finally {
        setBusyRecommendationId(null);
      }
    },
    [onReload, onError],
  );

  const handleManualRecommendationReceipt = useCallback(
    async (recommendationId: string, fallbackName: string | null) => {
      const reason = window.prompt("Motivo de recepcion manual:", "Recibida por correo");
      if (!reason || reason.trim().length < 4) return;
      const recommenderName = window.prompt("Nombre del recomendador (opcional):", fallbackName ?? "");
      if (recommenderName === null) return;
      const attachFile = window.confirm("Deseas adjuntar un archivo recibido?");
      let selectedFile: File | null = null;

      if (attachFile) {
        const input = document.createElement("input");
        input.type = "file";
        selectedFile = await new Promise<File | null>((resolve) => {
          input.onchange = () => resolve(input.files?.[0] ?? null);
          input.click();
        });
      }

      const formData = new FormData();
      formData.append("reason", reason);
      formData.append("recommenderName", recommenderName);
      if (selectedFile) {
        formData.append("file", selectedFile);
      }

      setBusyRecommendationId(recommendationId);
      try {
        await fetchApiResponse(`/api/recommendations/${recommendationId}`, {
          method: "POST",
          body: formData,
        });
        await onReload();
      } catch (requestError) {
        onError(
          toNormalizedApiError(requestError, "No se pudo registrar la recomendacion manualmente.").message,
        );
      } finally {
        setBusyRecommendationId(null);
      }
    },
    [onReload, onError],
  );

  return (
    <div>
      <h3 style={{ margin: "0 0 1rem", fontSize: "0.9375rem", fontWeight: 700 }}>
        Recomendaciones
      </h3>
      {recommendations.length === 0 ? (
        <p style={{ color: "var(--muted)", fontSize: "0.875rem" }}>
          No hay recomendaciones registradas.
        </p>
      ) : (
        <div style={{ display: "grid", gap: "0.5rem" }}>
          {recommendations.map((rec) => (
            <div
              key={rec.id}
              data-testid={`admin-recommendation-card-${rec.id}`}
              style={PANEL_CARD_STYLE}
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
              {rec.recommender_name ? (
                <div style={{ fontSize: "0.8125rem", marginBottom: "0.2rem" }}>
                  {rec.recommender_name}
                </div>
              ) : null}
              <div style={{ fontSize: "0.8125rem", color: "var(--muted)" }}>
                {rec.recommender_email}
              </div>
              {rec.admin_notes ? (
                <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.25rem" }}>
                  Notas internas: {rec.admin_notes}
                </div>
              ) : null}
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
              {rec.admin_received_at ? (
                <div
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--muted)",
                    marginTop: "0.25rem",
                  }}
                >
                  Registrada manualmente:{" "}
                  {new Date(rec.admin_received_at).toLocaleString("es-PE")}
                  {rec.admin_received_reason ? ` · ${rec.admin_received_reason}` : ""}
                </div>
              ) : null}
              <div
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  flexWrap: "wrap",
                  marginTop: "0.75rem",
                }}
              >
                <button
                  onClick={() =>
                    handleRecommendationEdit(
                      rec.id,
                      rec.recommender_name,
                      rec.recommender_email,
                      rec.admin_notes,
                    )
                  }
                  disabled={busyRecommendationId === rec.id}
                  style={PANEL_SUBTLE_BUTTON_STYLE}
                >
                  Editar contacto
                </button>
                {rec.status !== "submitted" ? (
                  <button
                    onClick={() => handleRecommendationReminder(rec.id)}
                    disabled={busyRecommendationId === rec.id}
                    style={PANEL_ACCENT_BUTTON_STYLE}
                  >
                    Reenviar recordatorio
                  </button>
                ) : null}
                {rec.status !== "submitted" ? (
                  <button
                    onClick={() =>
                      handleManualRecommendationReceipt(
                        rec.id,
                        rec.recommender_name,
                      )
                    }
                    disabled={busyRecommendationId === rec.id}
                    style={PANEL_SUCCESS_BUTTON_STYLE}
                  >
                    Registrar manualmente
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
