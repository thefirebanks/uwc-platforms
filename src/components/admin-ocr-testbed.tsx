"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ErrorCallout } from "@/components/error-callout";
import { FieldHint } from "@/components/field-hint";
import { DEFAULT_OCR_MAX_TOKENS } from "@/lib/server/ocr";
import type { OcrTestRun } from "@/types/domain";

type ModelOption = { id: string; name: string };

type Props = {
  cycleId?: string | null;
  stageCode?: string | null;
  modelOptions: ModelOption[];
  defaultPrompt: string;
  defaultSystemPrompt?: string;
  defaultExtractionInstructions?: string;
  defaultSchemaTemplate?: string;
};

type OcrSchemaValidation = {
  valid?: boolean;
  errors?: string[];
};

type OcrRequestConfig = {
  systemPrompt?: string | null;
  extractionInstructions?: string | null;
  expectedSchemaTemplate?: string | null;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  strictSchema?: boolean;
};

type ApiError = {
  message: string;
  errorId?: string;
};

type EditorSection = "context" | "prompts" | "schema";

function isApiError(value: unknown): value is ApiError {
  return Boolean(
    value &&
      typeof value === "object" &&
      "message" in value &&
      typeof (value as { message?: unknown }).message === "string",
  );
}

function normalizeApiError(value: unknown, fallbackMessage: string): ApiError {
  if (value && typeof value === "object") {
    const message =
      typeof (value as { message?: unknown }).message === "string"
        ? (value as { message: string }).message
        : fallbackMessage;
    const errorId =
      typeof (value as { errorId?: unknown }).errorId === "string"
        ? (value as { errorId: string }).errorId
        : undefined;
    return { message, errorId };
  }

  return { message: fallbackMessage };
}

async function readJsonSafely(response: Response) {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

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

function getSchemaValidation(run: OcrTestRun): OcrSchemaValidation | null {
  const candidate = run.raw_response?.schemaValidation;
  return candidate && typeof candidate === "object" && !Array.isArray(candidate)
    ? (candidate as OcrSchemaValidation)
    : null;
}

function getInjectionSignals(run: OcrTestRun) {
  const candidate = run.raw_response?.injectionSignals;
  return Array.isArray(candidate) ? candidate.filter((item): item is string => typeof item === "string") : [];
}

function getRequestConfig(run: OcrTestRun): OcrRequestConfig | null {
  const candidate = run.raw_response?.requestConfig;
  return candidate && typeof candidate === "object" && !Array.isArray(candidate)
    ? (candidate as OcrRequestConfig)
    : null;
}

export function AdminOcrTestbed({
  cycleId,
  stageCode,
  modelOptions,
  defaultPrompt,
  defaultSystemPrompt = "",
  defaultExtractionInstructions,
  defaultSchemaTemplate = "",
}: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [modelId, setModelId] = useState(modelOptions[0]?.id ?? "gemini-flash");
  const [systemPrompt, setSystemPrompt] = useState(defaultSystemPrompt);
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [extractionInstructions, setExtractionInstructions] = useState(
    defaultExtractionInstructions ?? defaultPrompt,
  );
  const [expectedSchemaTemplate, setExpectedSchemaTemplate] = useState(defaultSchemaTemplate);
  const [stageName, setStageName] = useState(stageCode ?? "documents");
  const [temperature, setTemperature] = useState("0.2");
  const [topP, setTopP] = useState("0.9");
  const [maxTokens, setMaxTokens] = useState(String(DEFAULT_OCR_MAX_TOKENS));
  const [strictSchema, setStrictSchema] = useState(true);
  const [editorSection, setEditorSection] = useState<EditorSection>("prompts");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<OcrTestRun | null>(null);
  const [runError, setRunError] = useState<ApiError | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  const [history, setHistory] = useState<OcrTestRun[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<ApiError | null>(null);
  const [comparisonRunId, setComparisonRunId] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const params = new URLSearchParams({ limit: "10" });
      if (cycleId) params.set("cycleId", cycleId);
      const res = await fetch(`/api/ocr-testbed?${params.toString()}`);
      const json = await readJsonSafely(res);
      if (!res.ok) {
        throw normalizeApiError(json, "Error al cargar historial.");
      }
      const runs = (((json as { runs?: OcrTestRun[] } | null) ?? {}).runs ?? []) as OcrTestRun[];
      setHistory(runs);
    } catch (err) {
      setHistoryError(
        isApiError(err)
          ? err
          : { message: err instanceof Error ? err.message : "Error al cargar historial." },
      );
    } finally {
      setHistoryLoading(false);
    }
  }, [cycleId]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    if (!result) {
      return;
    }

    const fallbackRun = history.find((run) => run.id !== result.id) ?? null;
    setComparisonRunId((current) => current ?? fallbackRun?.id ?? null);
  }, [history, result]);

  const comparisonRun = useMemo(() => {
    if (!comparisonRunId) {
      return null;
    }

    return history.find((run) => run.id === comparisonRunId) ?? null;
  }, [comparisonRunId, history]);

  const modelNameById = useMemo(
    () => new Map(modelOptions.map((model) => [model.id, model.name])),
    [modelOptions],
  );

  const schemaTemplateError = useMemo(() => {
    if (!expectedSchemaTemplate.trim()) {
      return "Debes definir un esquema JSON para ejecutar la prueba.";
    }

    try {
      JSON.parse(expectedSchemaTemplate);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : "El esquema JSON no es válido.";
    }
  }, [expectedSchemaTemplate]);

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
      formData.append("systemPrompt", systemPrompt);
      formData.append("extractionInstructions", extractionInstructions);
      formData.append("expectedSchemaTemplate", expectedSchemaTemplate);
      formData.append("temperature", temperature);
      formData.append("topP", topP);
      formData.append("maxTokens", maxTokens);
      formData.append("strictSchema", String(strictSchema));
      if (cycleId) formData.append("cycleId", cycleId);

      const res = await fetch("/api/ocr-testbed", {
        method: "POST",
        body: formData,
      });
      const json = await readJsonSafely(res);
      if (!res.ok) {
        throw normalizeApiError(json, "Error al ejecutar Prompt Studio.");
      }
      setResult(((json as { run?: OcrTestRun } | null) ?? {}).run as OcrTestRun);
      await loadHistory();
    } catch (err) {
      setRunError(
        isApiError(err)
          ? err
          : { message: err instanceof Error ? err.message : "Error al ejecutar Prompt Studio." },
      );
    } finally {
      setIsRunning(false);
    }
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null);
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    const dropped = event.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  }

  function handleDragOver(event: React.DragEvent) {
    event.preventDefault();
  }

  function renderRunPanel(run: OcrTestRun, title: string) {
    const schemaValidation = getSchemaValidation(run);
    const injectionSignals = getInjectionSignals(run);
    const requestConfig = getRequestConfig(run);

    return (
      <div className="ocr-testbed__result card">
        <div className="ocr-testbed__result-header">
          <h4>{title}</h4>
          <div className="ocr-testbed__meta">
            <span
              className="badge"
              style={{
                background: "var(--sand-light)",
                color: confidenceColor(run.confidence),
                border: `1px solid ${confidenceColor(run.confidence)}`,
              }}
            >
              Confianza: {run.confidence !== null ? `${(run.confidence * 100).toFixed(0)}%` : "N/A"}
            </span>
            <span className="ocr-testbed__duration">⏱ {formatDuration(run.duration_ms)}</span>
            <span className="ocr-testbed__model-badge">
              {modelNameById.get(run.model_id) ?? run.model_id}
            </span>
          </div>
        </div>

        <p className="ocr-testbed__summary">{run.summary}</p>

        <div className="admin-chip-row" style={{ marginBottom: "12px" }}>
          <span className={`status-pill ${schemaValidation?.valid ? "complete" : "rejected"}`}>
            {schemaValidation?.valid ? "Schema OK" : "Schema inválido"}
          </span>
          <span className="status-pill admin-chip-neutral">
            {injectionSignals.length} señal(es) de prompt injection
          </span>
          <span className="status-pill admin-chip-neutral">
            {requestConfig?.strictSchema ? "Strict schema" : "Schema flexible"}
          </span>
        </div>

        {schemaValidation?.errors && schemaValidation.errors.length > 0 ? (
          <div className="form-hint" style={{ marginBottom: "12px" }}>
            {schemaValidation.errors.join(" | ")}
          </div>
        ) : null}

        {injectionSignals.length > 0 ? (
          <div className="form-hint" style={{ marginBottom: "12px" }}>
            {injectionSignals.join(" | ")}
          </div>
        ) : null}

        {requestConfig ? (
          <div className="form-hint" style={{ marginBottom: "12px" }}>
            Temp {requestConfig.temperature ?? "—"} | Top-P {requestConfig.topP ?? "—"} | Max
            tokens {requestConfig.maxTokens ?? "—"}
          </div>
        ) : null}

        <button className="btn btn-ghost btn-sm" onClick={() => setShowRaw((value) => !value)}>
          {showRaw ? "Ocultar JSON completo" : "Ver JSON completo"}
        </button>

        {showRaw ? (
          <pre className="ocr-testbed__raw">{JSON.stringify(run.raw_response, null, 2)}</pre>
        ) : null}
      </div>
    );
  }

  const confidenceDelta =
    result && comparisonRun && result.confidence !== null && comparisonRun.confidence !== null
      ? result.confidence - comparisonRun.confidence
      : null;

  return (
    <div className="ocr-testbed">
      <div className="ocr-testbed__form card">
        <h3 className="ocr-testbed__title">Prompt Studio</h3>

        <div
          className={`ocr-testbed__dropzone${file ? " ocr-testbed__dropzone--filled" : ""}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => event.key === "Enter" && fileInputRef.current?.click()}
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
              📄 {file.name}
              <span style={{ color: "var(--muted)", fontWeight: 400 }}>
                {" "}
                ({(file.size / 1024).toFixed(0)} KB)
              </span>
            </span>
          ) : (
            <span className="ocr-testbed__dropzone-hint">
              Arrastra un archivo PDF o imagen aquí, o haz clic para seleccionar
            </span>
          )}
        </div>

        <div className="ocr-testbed__tabs" role="tablist" aria-label="Secciones de Prompt Studio">
          <button
            type="button"
            className={`ocr-testbed__tab${editorSection === "context" ? " is-active" : ""}`}
            onClick={() => setEditorSection("context")}
          >
            Contexto
          </button>
          <button
            type="button"
            className={`ocr-testbed__tab${editorSection === "prompts" ? " is-active" : ""}`}
            onClick={() => setEditorSection("prompts")}
          >
            Prompts
          </button>
          <button
            type="button"
            className={`ocr-testbed__tab${editorSection === "schema" ? " is-active" : ""}`}
            onClick={() => setEditorSection("schema")}
          >
            Esquema y parámetros
          </button>
        </div>

        {editorSection === "context" ? (
          <div className="ocr-testbed__panel">
            <div className="ocr-testbed__row">
              <div className="ocr-testbed__field">
                <label className="field-label" htmlFor="ocr-model">
                  Modelo{" "}
                  <FieldHint label="Ayuda sobre el modelo">
                    El modelo indicado aquí es el que procesa el archivo que subes en esta prueba.
                    Hoy la opción por defecto usa Gemini 3 Flash Preview.
                  </FieldHint>
                </label>
                <select
                  id="ocr-model"
                  className="form-input"
                  value={modelId}
                  onChange={(event) => setModelId(event.target.value)}
                >
                  {modelOptions.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="ocr-testbed__field">
                <label className="field-label" htmlFor="ocr-stage">
                  Contexto / etapa{" "}
                  <FieldHint label="Ayuda sobre el contexto">
                    Es solo una etiqueta para guardar historial y comparar corridas. No selecciona
                    archivos del proceso automáticamente.
                  </FieldHint>
                </label>
                <input
                  id="ocr-stage"
                  className="form-input"
                  value={stageName}
                  onChange={(event) => setStageName(event.target.value)}
                  placeholder="documents"
                />
              </div>
            </div>
          </div>
        ) : null}

        {editorSection === "prompts" ? (
          <div className="ocr-testbed__panel">
            <div className="ocr-testbed__field">
              <label className="field-label" htmlFor="ocr-system-prompt">
                System prompt adicional{" "}
                <FieldHint label="Ayuda sobre system prompt">
                  Define cómo debe comportarse el modelo al razonar. No describe el documento ni
                  reemplaza el esquema.
                </FieldHint>
              </label>
              <textarea
                id="ocr-system-prompt"
                className="form-input"
                rows={3}
                value={systemPrompt}
                onChange={(event) => setSystemPrompt(event.target.value)}
                placeholder="Instrucciones adicionales para el modelo."
              />
            </div>

            <div className="ocr-testbed__field">
              <label className="field-label" htmlFor="ocr-prompt">
                Instrucciones base{" "}
                <FieldHint label="Ayuda sobre instrucciones base">
                  Describe la tarea general que debe resolver esta corrida sobre el archivo
                  adjunto.
                </FieldHint>
              </label>
              <textarea
                id="ocr-prompt"
                className="form-input"
                rows={3}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Contrato base para la extracción."
              />
            </div>

            <div className="ocr-testbed__field">
              <label className="field-label" htmlFor="ocr-extraction">
                Instrucciones de extracción{" "}
                <FieldHint label="Ayuda sobre instrucciones de extracción">
                  Especifica los campos o señales exactas que quieres devolver dentro del JSON.
                </FieldHint>
              </label>
              <textarea
                id="ocr-extraction"
                className="form-input"
                rows={4}
                value={extractionInstructions}
                onChange={(event) => setExtractionInstructions(event.target.value)}
                placeholder="Qué debe extraer, resumir y validar."
              />
            </div>
          </div>
        ) : null}

        {editorSection === "schema" ? (
          <div className="ocr-testbed__panel">
            <div className="ocr-testbed__field">
              <label className="field-label" htmlFor="ocr-schema">
                Esquema JSON esperado{" "}
                <FieldHint label="Ayuda sobre el esquema JSON">
                  Usa JSON válido. Puedes definir tipos con ejemplos o atajos como
                  {' "string", "int", "number" y "boolean".'}
                </FieldHint>
              </label>
              <textarea
                id="ocr-schema"
                className="form-input ocr-testbed__code-input"
                rows={12}
                value={expectedSchemaTemplate}
                onChange={(event) => setExpectedSchemaTemplate(event.target.value)}
                placeholder='{"summary":"string","confidence":0,"findings":["string"]}'
              />
              {schemaTemplateError ? (
                <div className="ocr-testbed__inline-error">{schemaTemplateError}</div>
              ) : null}
            </div>

            <div className="ocr-testbed__row">
              <div className="ocr-testbed__field">
                <label className="field-label" htmlFor="ocr-temperature">
                  Temperature
                </label>
                <input
                  id="ocr-temperature"
                  className="form-input"
                  value={temperature}
                  onChange={(event) => setTemperature(event.target.value)}
                  inputMode="decimal"
                />
              </div>
              <div className="ocr-testbed__field">
                <label className="field-label" htmlFor="ocr-top-p">
                  Top-P
                </label>
                <input
                  id="ocr-top-p"
                  className="form-input"
                  value={topP}
                  onChange={(event) => setTopP(event.target.value)}
                  inputMode="decimal"
                />
              </div>
              <div className="ocr-testbed__field">
                <label className="field-label" htmlFor="ocr-max-tokens">
                  Max tokens
                </label>
                <input
                  id="ocr-max-tokens"
                  className="form-input"
                  value={maxTokens}
                  onChange={(event) => setMaxTokens(event.target.value)}
                  inputMode="numeric"
                />
              </div>
            </div>

            <label className="ocr-testbed__checkbox">
              <input
                type="checkbox"
                checked={strictSchema}
                onChange={(event) => setStrictSchema(event.target.checked)}
              />
              {"Fallar si la respuesta no cumple exactamente el esquema"}
            </label>
          </div>
        ) : null}

        {runError ? (
          <ErrorCallout
            message={runError.message}
            errorId={runError.errorId}
            context="prompt_studio_run"
          />
        ) : null}

        <div className="ocr-testbed__actions">
          <button
            className="btn btn-primary"
            onClick={handleRun}
            disabled={
              isRunning ||
              !file ||
              !prompt.trim() ||
              !extractionInstructions.trim() ||
              !expectedSchemaTemplate.trim() ||
              Boolean(schemaTemplateError)
            }
          >
            {isRunning ? "Ejecutando…" : "Ejecutar prueba"}
          </button>
        </div>
      </div>

      {result ? (
        <div
          style={{
            display: "grid",
            gap: "16px",
            gridTemplateColumns: comparisonRun ? "repeat(2, minmax(0, 1fr))" : "minmax(0, 1fr)",
          }}
        >
          {renderRunPanel(result, "Resultado actual")}
          {comparisonRun ? renderRunPanel(comparisonRun, "Comparación") : null}
        </div>
      ) : null}

      {result && comparisonRun ? (
        <div className="settings-card">
          <h4 style={{ marginBottom: "12px" }}>Comparativa rápida</h4>
          <div className="admin-chip-row">
            <span className="status-pill admin-chip-neutral">
              Archivo actual: {result.file_name}
            </span>
            <span className="status-pill admin-chip-neutral">
              Archivo comparado: {comparisonRun.file_name}
            </span>
            <span className={`status-pill ${confidenceDelta !== null && confidenceDelta >= 0 ? "complete" : "rejected"}`}>
              Delta confianza: {confidenceDelta === null ? "—" : `${(confidenceDelta * 100).toFixed(0)} pts`}
            </span>
          </div>
        </div>
      ) : null}

      <div className="ocr-testbed__history card">
        <h4>Historial de pruebas (últimas 10)</h4>

        {historyLoading ? <p className="muted-text">Cargando historial…</p> : null}
        {historyError ? (
          <ErrorCallout
            message={historyError.message}
            errorId={historyError.errorId}
            context="prompt_studio_history"
          />
        ) : null}
        {!historyLoading && !historyError && history.length === 0 ? (
          <p className="muted-text">Sin pruebas anteriores.</p>
        ) : null}

        {history.length > 0 ? (
          <div className="ocr-testbed__history-list">
            {history.map((run) => {
              const schemaValidation = getSchemaValidation(run);
              const injectionSignals = getInjectionSignals(run);
              const requestConfig = getRequestConfig(run);

              return (
                <article key={run.id} className="ocr-testbed__history-item">
                  <div className="ocr-testbed__history-item-top">
                    <div>
                      <h5 title={run.file_name}>{run.file_name}</h5>
                      <div className="form-hint">{formatDate(run.created_at)}</div>
                    </div>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setComparisonRunId(run.id)}
                      disabled={result?.id === run.id}
                    >
                      Comparar
                    </button>
                  </div>
                  <div className="ocr-testbed__history-meta">
                    <span className="status-pill admin-chip-neutral">
                      {modelNameById.get(run.model_id) ?? run.model_id}
                    </span>
                    <span className="status-pill admin-chip-neutral">{run.stage_code}</span>
                    <span className={`status-pill ${schemaValidation?.valid ? "complete" : "rejected"}`}>
                      {schemaValidation?.valid ? "Schema OK" : "Schema inválido"}
                    </span>
                    <span className="status-pill admin-chip-neutral">
                      {injectionSignals.length} señal(es)
                    </span>
                    <span className="status-pill admin-chip-neutral">
                      {formatDuration(run.duration_ms)}
                    </span>
                  </div>
                  {requestConfig ? (
                    <div className="ocr-testbed__history-secondary">
                      Temp {requestConfig.temperature ?? "—"} | Top-P {requestConfig.topP ?? "—"} |
                      Max tokens {requestConfig.maxTokens ?? "—"}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
