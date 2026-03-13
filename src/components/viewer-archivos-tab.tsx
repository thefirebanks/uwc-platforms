"use client";

import { useCallback, useState } from "react";
import {
  fetchApi,
  fetchApiResponse,
  toNormalizedApiError,
  type NormalizedApiError,
} from "@/lib/client/api-client";
import {
  formatFileSize,
  PANEL_CARD_STYLE,
  PANEL_SUBTLE_BUTTON_STYLE,
  PANEL_ACCENT_BUTTON_STYLE,
  PANEL_SUCCESS_BUTTON_STYLE,
  type AdminFileEntry,
  type OcrRunResult,
} from "@/components/admin-application-viewer-types";

// ─── Props ────────────────────────────────────────────────────────────

export interface ViewerArchivosTabProps {
  applicationId: string;
  files: AdminFileEntry[];
  onReload: () => Promise<void>;
  onApplicationUpdated: () => void;
  onError: (message: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────

export function ViewerArchivosTab({
  applicationId,
  files,
  onReload,
  onApplicationUpdated,
  onError,
}: ViewerArchivosTabProps) {
  const [busyFileKey, setBusyFileKey] = useState<string | null>(null);
  const [ocrResultByFileKey, setOcrResultByFileKey] = useState<Record<string, OcrRunResult>>({});
  const [ocrErrorByFileKey, setOcrErrorByFileKey] = useState<Record<string, NormalizedApiError | null>>({});

  const handleFileMetadataEdit = useCallback(
    async (file: AdminFileEntry) => {
      const title = window.prompt("Titulo del archivo:", file.title);
      if (title === null) return;
      const category = window.prompt("Categoria interna (opcional):", file.category ?? "");
      if (category === null) return;
      const notes = window.prompt("Notas internas (opcional):", file.notes ?? "");
      if (notes === null) return;
      const reason = window.prompt("Motivo del cambio:", "Correccion operativa");
      if (!reason || reason.trim().length < 4) return;

      setBusyFileKey(file.key);
      try {
        await fetchApiResponse(`/api/applications/${applicationId}/files`, {
          method: "PATCH",
          body: JSON.stringify({
            fileKey: file.key,
            title,
            category,
            notes,
            reason,
          }),
        });
        await onReload();
        onApplicationUpdated();
      } catch (requestError) {
        onError(
          toNormalizedApiError(requestError, "No se pudo actualizar la metadata del archivo.").message,
        );
      } finally {
        setBusyFileKey(null);
      }
    },
    [applicationId, onReload, onApplicationUpdated, onError],
  );

  const handleAdminFileUpload = useCallback(
    async (fileKey: string, selectedFile: File | null) => {
      if (!selectedFile) return;

      const reason = window.prompt("Motivo de la carga manual:", "Documento enviado por correo");
      if (!reason || reason.trim().length < 4) return;

      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("fileKey", fileKey);
      formData.append("reason", reason);

      setBusyFileKey(fileKey);
      try {
        await fetchApiResponse(`/api/applications/${applicationId}/admin-upload`, {
          method: "POST",
          body: formData,
        });
        await onReload();
        onApplicationUpdated();
      } catch (requestError) {
        onError(
          toNormalizedApiError(requestError, "No se pudo cargar el archivo manualmente.").message,
        );
      } finally {
        setBusyFileKey(null);
      }
    },
    [applicationId, onReload, onApplicationUpdated, onError],
  );

  const handleRunFileOcr = useCallback(
    async (fileKey: string) => {
      setBusyFileKey(fileKey);
      setOcrErrorByFileKey((current) => ({ ...current, [fileKey]: null }));
      try {
        const body = await fetchApi<{
          summary?: string;
          confidence?: number;
          createdAt?: string;
        }>(`/api/applications/${applicationId}/ocr-check`, {
          method: "POST",
          body: JSON.stringify({ fileKey }),
        });
        setOcrResultByFileKey((current) => ({
          ...current,
          [fileKey]: {
            summary:
              typeof body.summary === "string" ? body.summary : "Parsing completado.",
            confidence:
              typeof body.confidence === "number" ? body.confidence : 0,
            createdAt:
              typeof body.createdAt === "string" ? body.createdAt : new Date().toISOString(),
          },
        }));
      } catch (error) {
        const apiError = toNormalizedApiError(error, "No se pudo ejecutar el parsing IA.");
        setOcrErrorByFileKey((current) => ({ ...current, [fileKey]: apiError }));
      } finally {
        setBusyFileKey(null);
      }
    },
    [applicationId],
  );

  return (
    <div>
      <h3 style={{ margin: "0 0 1rem", fontSize: "0.9375rem", fontWeight: 700 }}>
        Archivos subidos
      </h3>
      {files.length === 0 ? (
        <p style={{ color: "var(--muted)", fontSize: "0.875rem" }}>
          No hay archivos subidos.
        </p>
      ) : (
        <div style={{ display: "grid", gap: "0.5rem" }}>
          {files.map((f) => (
            <div
              key={f.key}
              data-testid={`admin-file-card-${f.key}`}
              style={PANEL_CARD_STYLE}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "1rem",
                  alignItems: "flex-start",
                }}
              >
                <div>
                  <div style={{ fontSize: "0.875rem", fontWeight: 600 }}>
                    {f.title}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                    {f.originalName} · {formatFileSize(f.sizeBytes)}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.25rem" }}>
                    Clave: {f.key}
                    {f.category ? ` · Categoria: ${f.category}` : ""}
                  </div>
                  {f.notes ? (
                    <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.25rem" }}>
                      Notas: {f.notes}
                    </div>
                  ) : null}
                </div>
                <div
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--muted)",
                    textTransform: "uppercase",
                    textAlign: "right",
                  }}
                >
                  {f.mimeType || "archivo"}
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  flexWrap: "wrap",
                  marginTop: "0.75rem",
                  alignItems: "center",
                }}
              >
                <button
                  onClick={() => handleFileMetadataEdit(f)}
                  disabled={busyFileKey === f.key}
                  style={PANEL_SUBTLE_BUTTON_STYLE}
                >
                  Editar metadata
                </button>
                {f.downloadUrl ? (
                  <a
                    href={f.downloadUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      ...PANEL_ACCENT_BUTTON_STYLE,
                      textDecoration: "none",
                    }}
                  >
                    Descargar
                  </a>
                ) : null}
                {f.aiParserEnabled ? (
                  <button
                    onClick={() => void handleRunFileOcr(f.key)}
                    disabled={busyFileKey === f.key}
                    style={PANEL_SUCCESS_BUTTON_STYLE}
                  >
                    {busyFileKey === f.key ? "Analizando..." : "Analizar con IA"}
                  </button>
                ) : null}
                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    fontSize: "0.8125rem",
                    color: "var(--ink-light)",
                  }}
                >
                  <span>Reemplazar</span>
                  <input
                    type="file"
                    onChange={(event) => {
                      const selectedFile = event.target.files?.[0] ?? null;
                      void handleAdminFileUpload(f.key, selectedFile);
                      event.currentTarget.value = "";
                    }}
                    disabled={busyFileKey === f.key}
                  />
                </label>
              </div>
              {ocrResultByFileKey[f.key] ? (
                <div
                  style={{
                    marginTop: "0.75rem",
                    padding: "0.625rem 0.75rem",
                    borderRadius: "8px",
                    background: "var(--paper)",
                    border: "1px solid var(--border, var(--sand))",
                  }}
                >
                  <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--muted)" }}>
                    Parsing IA
                  </div>
                  <div style={{ marginTop: "0.25rem", fontSize: "0.8125rem" }}>
                    {ocrResultByFileKey[f.key]?.summary}
                  </div>
                  <div style={{ marginTop: "0.25rem", fontSize: "0.75rem", color: "var(--muted)" }}>
                    Confianza: {Math.round((ocrResultByFileKey[f.key]?.confidence ?? 0) * 100)}% ·{" "}
                    {new Date(ocrResultByFileKey[f.key]!.createdAt).toLocaleString("es-PE")}
                  </div>
                </div>
              ) : null}
              {ocrErrorByFileKey[f.key] ? (
                <div
                  style={{
                    marginTop: "0.75rem",
                    padding: "0.625rem 0.75rem",
                    borderRadius: "8px",
                    background: "var(--error-soft, #fdecec)",
                    border: "1px solid var(--error, #c62828)",
                    color: "var(--error, #c62828)",
                    fontSize: "0.8125rem",
                  }}
                >
                  <div>{ocrErrorByFileKey[f.key]?.message}</div>
                  {ocrErrorByFileKey[f.key]?.errorId ? (
                    <div style={{ marginTop: "0.25rem", fontSize: "0.75rem" }}>
                      Error ID: {ocrErrorByFileKey[f.key]?.errorId}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
