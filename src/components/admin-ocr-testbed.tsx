"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OcrTestRun } from "@/types/domain";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

type ModelOption = { id: string; name: string };

type Props = {
  cycleId?: string | null;
  stageCode?: string | null;
  /** Available models loaded from MODEL_REGISTRY — pass from server component */
  modelOptions: ModelOption[];
  /** Default prompt template */
  defaultPrompt: string;
};

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(ms: number | null) {
  if (ms === null) return "—";
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

function confidenceColor(confidence: number | null) {
  if (confidence === null) return "var(--muted)";
  if (confidence >= 0.75) return "var(--success, #1e7e34)";
  if (confidence >= 0.5) return "var(--warning, #856404)";
  return "var(--danger, #c0392b)";
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export function AdminOcrTestbed({
  cycleId,
  stageCode,
  modelOptions,
  defaultPrompt,
}: Props) {
  /* form state */
  const [file, setFile] = useState<File | null>(null);
  const [modelId, setModelId] = useState(modelOptions[0]?.id ?? "gemini-flash");
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [stageName, setStageName] = useState(stageCode ?? "documents");
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* run state */
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<OcrTestRun | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  /* history state */
  const [history, setHistory] = useState<OcrTestRun[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  /* ---- Load history ---- */
  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const params = new URLSearchParams({ limit: "10" });
      if (cycleId) params.set("cycleId", cycleId);
      const res = await fetch(`/api/ocr-testbed?${params.toString()}`);
      const json = await res.json();
      if (!res.ok)
        throw new Error(json.error?.userMessage ?? "Error al cargar historial.");
      setHistory(json.runs ?? []);
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : "Error desconocido.");
    } finally {
      setHistoryLoading(false);
    }
  }, [cycleId]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  /* ---- Run test ---- */
  async function handleRun() {
    if (!file) return;
    setIsRunning(true);
    setRunError(null);
    setResult(null);
    setShowRaw(false);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("stageCode", stageName);
      formData.append("modelId", modelId);
      formData.append("promptTemplate", prompt);
      if (cycleId) formData.append("cycleId", cycleId);

      const res = await fetch("/api/ocr-testbed", {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (!res.ok)
        throw new Error(json.error?.userMessage ?? "Error al ejecutar prueba OCR.");
      setResult(json.run as OcrTestRun);
      void loadHistory();
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Error desconocido.");
    } finally {
      setIsRunning(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setFile(e.target.files?.[0] ?? null);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  return (
    <div className="ocr-testbed">
      {/* ── Form panel ── */}
      <div className="ocr-testbed__form card">
        <h3 className="ocr-testbed__title">Prueba de OCR</h3>

        {/* File drop zone */}
        <div
          className={`ocr-testbed__dropzone${file ? " ocr-testbed__dropzone--filled" : ""}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
          aria-label="Subir archivo de prueba"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            style={{ display: "none" }}
            onChange={handleFileChange}
          />
          {file ? (
            <span className="ocr-testbed__file-name">
              📄 {file.name}{" "}
              <span style={{ color: "var(--muted)", fontWeight: 400 }}>
                ({(file.size / 1024).toFixed(0)} KB)
              </span>
            </span>
          ) : (
            <span className="ocr-testbed__dropzone-hint">
              Arrastra un archivo PDF o imagen aquí, o haz clic para seleccionar
            </span>
          )}
        </div>

        {/* Model + stage row */}
        <div className="ocr-testbed__row">
          <div className="ocr-testbed__field">
            <label className="field-label" htmlFor="ocr-model">
              Modelo
            </label>
            <select
              id="ocr-model"
              className="form-input"
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
            >
              {modelOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          <div className="ocr-testbed__field">
            <label className="field-label" htmlFor="ocr-stage">
              Etapa
            </label>
            <input
              id="ocr-stage"
              className="form-input"
              value={stageName}
              onChange={(e) => setStageName(e.target.value)}
              placeholder="documents"
            />
          </div>
        </div>

        {/* Prompt */}
        <div className="ocr-testbed__field">
          <label className="field-label" htmlFor="ocr-prompt">
            Prompt
          </label>
          <textarea
            id="ocr-prompt"
            className="form-input"
            rows={4}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Instrucciones para el modelo de OCR…"
          />
        </div>

        {runError && (
          <div className="error-callout" role="alert">
            {runError}
          </div>
        )}

        <button
          className="btn btn-primary"
          onClick={handleRun}
          disabled={isRunning || !file || !prompt.trim()}
        >
          {isRunning ? "Ejecutando…" : "Ejecutar prueba"}
        </button>
      </div>

      {/* ── Result panel ── */}
      {result && (
        <div className="ocr-testbed__result card">
          <div className="ocr-testbed__result-header">
            <h4>Resultado</h4>
            <div className="ocr-testbed__meta">
              <span
                className="badge"
                style={{
                  background: "var(--sand-light)",
                  color: confidenceColor(result.confidence),
                  border: `1px solid ${confidenceColor(result.confidence)}`,
                }}
              >
                Confianza:{" "}
                {result.confidence !== null
                  ? `${(result.confidence * 100).toFixed(0)}%`
                  : "N/A"}
              </span>
              <span className="ocr-testbed__duration">
                ⏱ {formatDuration(result.duration_ms)}
              </span>
              <span className="ocr-testbed__model-badge">{result.model_id}</span>
            </div>
          </div>

          <p className="ocr-testbed__summary">{result.summary}</p>

          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setShowRaw((v) => !v)}
          >
            {showRaw ? "Ocultar JSON completo" : "Ver JSON completo"}
          </button>

          {showRaw && (
            <pre className="ocr-testbed__raw">
              {JSON.stringify(result.raw_response, null, 2)}
            </pre>
          )}
        </div>
      )}

      {/* ── History panel ── */}
      <div className="ocr-testbed__history card">
        <h4>Historial de pruebas (últimas 10)</h4>

        {historyLoading && <p className="muted-text">Cargando historial…</p>}
        {historyError && (
          <p className="error-text" role="alert">
            {historyError}
          </p>
        )}
        {!historyLoading && !historyError && history.length === 0 && (
          <p className="muted-text">Sin pruebas anteriores.</p>
        )}

        {history.length > 0 && (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Archivo</th>
                  <th>Modelo</th>
                  <th>Etapa</th>
                  <th>Confianza</th>
                  <th>Duración</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {history.map((run) => (
                  <tr key={run.id}>
                    <td
                      style={{
                        maxWidth: 200,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={run.file_name}
                    >
                      {run.file_name}
                    </td>
                    <td>{run.model_id}</td>
                    <td>{run.stage_code}</td>
                    <td
                      style={{
                        color: confidenceColor(run.confidence),
                        fontWeight: 600,
                      }}
                    >
                      {run.confidence !== null
                        ? `${(run.confidence * 100).toFixed(0)}%`
                        : "—"}
                    </td>
                    <td>{formatDuration(run.duration_ms)}</td>
                    <td>{formatDate(run.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
