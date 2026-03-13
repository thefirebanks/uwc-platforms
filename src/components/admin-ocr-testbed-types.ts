import type { OcrTestRun } from "@/types/domain";

// ─── Types ────────────────────────────────────────────────────────────

export type ModelOption = { id: string; name: string };

export type OcrSchemaValidation = {
  valid?: boolean;
  errors?: string[];
};

export type OcrRequestConfig = {
  systemPrompt?: string | null;
  extractionInstructions?: string | null;
  expectedSchemaTemplate?: string | null;
  referenceFiles?: Array<{
    fileName?: string | null;
    mimeType?: string | null;
    sizeBytes?: number | null;
  }>;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  strictSchema?: boolean;
};

export type EditorSection = "context" | "prompts" | "schema";

// ─── Pure utility functions ───────────────────────────────────────────

export function formatDate(value: string) {
  return new Date(value).toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDuration(ms: number | null) {
  if (ms === null) return "—";
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

export function confidenceColor(confidence: number | null) {
  if (confidence === null) return "var(--muted)";
  if (confidence >= 0.75) return "var(--success, #1e7e34)";
  if (confidence >= 0.5) return "var(--warning, #856404)";
  return "var(--danger, #c0392b)";
}

export function getSchemaValidation(run: OcrTestRun): OcrSchemaValidation | null {
  const candidate = run.raw_response?.schemaValidation;
  return candidate && typeof candidate === "object" && !Array.isArray(candidate)
    ? (candidate as OcrSchemaValidation)
    : null;
}

export function getInjectionSignals(run: OcrTestRun) {
  const candidate = run.raw_response?.injectionSignals;
  return Array.isArray(candidate)
    ? candidate.filter((item): item is string => typeof item === "string")
    : [];
}

export function getRequestConfig(run: OcrTestRun): OcrRequestConfig | null {
  const candidate = run.raw_response?.requestConfig;
  return candidate && typeof candidate === "object" && !Array.isArray(candidate)
    ? (candidate as OcrRequestConfig)
    : null;
}
