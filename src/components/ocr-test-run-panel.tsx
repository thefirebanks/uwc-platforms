"use client";

import type { CSSProperties } from "react";
import type { OcrTestRun } from "@/types/domain";
import {
  confidenceColor,
  formatDuration,
  getInjectionSignals,
  getRequestConfig,
  getSchemaValidation,
} from "@/components/admin-ocr-testbed-types";

type Props = {
  run: OcrTestRun;
  title: string;
  modelNameById: Map<string, string>;
  showRaw: boolean;
  onToggleRaw: () => void;
};

export function OcrTestRunPanel({
  run,
  title,
  modelNameById,
  showRaw,
  onToggleRaw,
}: Props) {
  const schemaValidation = getSchemaValidation(run);
  const injectionSignals = getInjectionSignals(run);
  const requestConfig = getRequestConfig(run);
  const requestReferenceFiles = requestConfig?.referenceFiles ?? [];

  return (
    <div className="ocr-testbed__result card">
      <div className="ocr-testbed__result-header">
        <h4>{title}</h4>
        <div className="ocr-testbed__meta">
          <span
            className="badge ocr-testbed__confidence-badge"
            style={
              {
                "--confidence-color": confidenceColor(run.confidence),
              } as CSSProperties
            }
          >
            Confianza:{" "}
            {run.confidence !== null
              ? `${(run.confidence * 100).toFixed(0)}%`
              : "N/A"}
          </span>
          <span className="ocr-testbed__duration">
            ⏱ {formatDuration(run.duration_ms)}
          </span>
          <span className="ocr-testbed__model-badge">
            {modelNameById.get(run.model_id) ?? run.model_id}
          </span>
        </div>
      </div>

      <p className="ocr-testbed__summary">{run.summary}</p>

      <div className="admin-chip-row ocr-testbed__chip-row">
        <span
          className={`status-pill ${schemaValidation?.valid ? "complete" : "rejected"}`}
        >
          {schemaValidation?.valid ? "Schema OK" : "Schema inválido"}
        </span>
        <span className="status-pill admin-chip-neutral">
          {injectionSignals.length} señal(es) de prompt injection
        </span>
        <span className="status-pill admin-chip-neutral">
          {requestConfig?.strictSchema ? "Strict schema" : "Schema flexible"}
        </span>
        <span className="status-pill admin-chip-neutral">
          Referencias: {requestReferenceFiles.length}
        </span>
      </div>

      {schemaValidation?.errors && schemaValidation.errors.length > 0 ? (
        <div className="ocr-testbed__notes">
          {schemaValidation.errors.map((errorText, index) => (
            <div
              key={`${run.id}-schema-${index}`}
              className="form-hint ocr-testbed__note"
            >
              {errorText}
            </div>
          ))}
        </div>
      ) : null}

      {injectionSignals.length > 0 ? (
        <div className="ocr-testbed__notes">
          {injectionSignals.map((signal, index) => (
            <div
              key={`${run.id}-signal-${index}`}
              className="form-hint ocr-testbed__note"
            >
              {signal}
            </div>
          ))}
        </div>
      ) : null}

      {requestConfig ? (
        <div className="form-hint ocr-testbed__request-meta">
          Temp {requestConfig.temperature ?? "—"} | Top-P{" "}
          {requestConfig.topP ?? "—"} | Max tokens{" "}
          {requestConfig.maxTokens ?? "—"} | Refs{" "}
          {requestReferenceFiles.length}
        </div>
      ) : null}

      <button
        className="btn btn-ghost btn-sm"
        onClick={onToggleRaw}
      >
        {showRaw ? "Ocultar JSON completo" : "Ver JSON completo"}
      </button>

      {showRaw ? (
        <pre className="ocr-testbed__raw">
          {JSON.stringify(run.raw_response, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}
