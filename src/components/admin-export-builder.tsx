"use client";

import { useState } from "react";
import type { ApplicationExportRow } from "@/lib/server/exports-service";
import { EXPORTABLE_COLUMNS } from "@/lib/server/exports-service";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

type ExportFormat = "csv" | "xlsx";

type Props = {
  /** Pre-selected cycle to scope the export. */
  cycleId?: string | null;
  /** Optional stage filter to pre-populate. */
  stageCode?: string | null;
};

type PreviewRow = Partial<Record<keyof ApplicationExportRow, string>>;

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const ALL_KEYS = EXPORTABLE_COLUMNS.map((c) => c.key);

function buildExportUrl(params: {
  cycleId?: string | null;
  stageCode?: string | null;
  format: ExportFormat;
  columnKeys: Array<keyof ApplicationExportRow>;
  previewLimit?: number;
}) {
  const sp = new URLSearchParams();
  if (params.cycleId) sp.set("cycleId", params.cycleId);
  if (params.stageCode) sp.set("stageCode", params.stageCode);
  sp.set("format", params.format);
  sp.set("columns", params.columnKeys.join(","));
  if (params.previewLimit !== undefined)
    sp.set("limit", String(params.previewLimit));
  return `/api/exports?${sp.toString()}`;
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export function AdminExportBuilder({ cycleId, stageCode }: Props) {
  const [selectedKeys, setSelectedKeys] = useState<
    Set<keyof ApplicationExportRow>
  >(new Set(ALL_KEYS));
  const [format, setFormat] = useState<ExportFormat>("xlsx");

  /* preview */
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([]);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  /* download */
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const orderedKeys = ALL_KEYS.filter((k) => selectedKeys.has(k));

  /* ---- Column selection helpers ---- */
  function toggleKey(key: keyof ApplicationExportRow) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
    setPreviewRows([]);
  }

  function selectAll() {
    setSelectedKeys(new Set(ALL_KEYS));
    setPreviewRows([]);
  }

  function selectNone() {
    setSelectedKeys(new Set());
    setPreviewRows([]);
  }

  /* ---- Preview (fetches CSV with limit=5, parses manually) ---- */
  async function handlePreview() {
    if (orderedKeys.length === 0) return;
    setIsPreviewing(true);
    setPreviewError(null);
    setPreviewRows([]);

    try {
      const url = buildExportUrl({
        cycleId,
        stageCode,
        format: "csv",
        columnKeys: orderedKeys,
        previewLimit: 5,
      });

      const res = await fetch(url);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(
          (json as { error?: { userMessage?: string } }).error?.userMessage ??
            "Error al cargar la vista previa.",
        );
      }

      const text = await res.text();
      const lines = text.trim().split("\n").filter(Boolean);
      if (lines.length === 0) {
        setPreviewRows([]);
        setPreviewHeaders([]);
        return;
      }

      const parseCell = (raw: string) =>
        raw.startsWith('"') ? raw.slice(1, -1).replace(/""/g, '"') : raw;

      const headers = lines[0]!.split(",").map(parseCell);
      setPreviewHeaders(headers);

      const rows: PreviewRow[] = lines.slice(1).map((line) => {
        const cells = line.split(",").map(parseCell);
        const row: PreviewRow = {};
        orderedKeys.forEach((key, i) => {
          row[key] = cells[i] ?? "";
        });
        return row;
      });
      setPreviewRows(rows);
    } catch (err) {
      setPreviewError(
        err instanceof Error ? err.message : "Error desconocido.",
      );
    } finally {
      setIsPreviewing(false);
    }
  }

  /* ---- Download ---- */
  async function handleDownload() {
    if (orderedKeys.length === 0) return;
    setIsDownloading(true);
    setDownloadError(null);

    try {
      const url = buildExportUrl({
        cycleId,
        stageCode,
        format,
        columnKeys: orderedKeys,
      });

      const res = await fetch(url);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(
          (json as { error?: { userMessage?: string } }).error?.userMessage ??
            "Error al descargar.",
        );
      }

      const blob = await res.blob();
      const extension = format === "xlsx" ? "xlsx" : "csv";
      const stamp = new Date().toISOString().replaceAll(":", "-");
      const filename = `postulaciones-${stamp}.${extension}`;

      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      setDownloadError(
        err instanceof Error ? err.message : "Error desconocido.",
      );
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <div className="export-builder">
      {/* ── Column picker ── */}
      <div className="export-builder__panel card">
        <div className="export-builder__panel-header">
          <h3 className="export-builder__title">Exportar Postulaciones</h3>
          <div className="export-builder__actions">
            <button className="btn btn-ghost btn-sm" onClick={selectAll}>
              Todos
            </button>
            <button className="btn btn-ghost btn-sm" onClick={selectNone}>
              Ninguno
            </button>
          </div>
        </div>

        <p className="muted-text export-builder__hint">
          Selecciona las columnas que quieres incluir en la exportación.
        </p>

        <div className="export-builder__columns">
          {EXPORTABLE_COLUMNS.map((col) => (
            <label key={col.key} className="export-builder__col-label">
              <input
                type="checkbox"
                checked={selectedKeys.has(col.key)}
                onChange={() => toggleKey(col.key)}
                className="export-builder__checkbox"
              />
              <span>{col.label}</span>
            </label>
          ))}
        </div>

        {/* Format selector */}
        <div className="export-builder__format-row">
          <span className="field-label">Formato</span>
          <label className="export-builder__format-option">
            <input
              type="radio"
              name="export-format"
              value="xlsx"
              checked={format === "xlsx"}
              onChange={() => setFormat("xlsx")}
            />
            <span>Excel (.xlsx)</span>
          </label>
          <label className="export-builder__format-option">
            <input
              type="radio"
              name="export-format"
              value="csv"
              checked={format === "csv"}
              onChange={() => setFormat("csv")}
            />
            <span>CSV</span>
          </label>
        </div>

        {/* Action buttons */}
        <div className="export-builder__btn-row">
          <button
            className="btn btn-secondary"
            onClick={handlePreview}
            disabled={isPreviewing || orderedKeys.length === 0}
          >
            {isPreviewing ? "Cargando…" : "Vista previa (5 filas)"}
          </button>
          <button
            className="btn btn-primary"
            onClick={handleDownload}
            disabled={isDownloading || orderedKeys.length === 0}
          >
            {isDownloading ? "Descargando…" : `Descargar ${format.toUpperCase()}`}
          </button>
        </div>

        {downloadError && (
          <div className="error-callout" role="alert">
            {downloadError}
          </div>
        )}

        {orderedKeys.length === 0 && (
          <p className="error-text">Selecciona al menos una columna.</p>
        )}
      </div>

      {/* ── Preview table ── */}
      {(previewRows.length > 0 || previewError) && (
        <div className="export-builder__preview card">
          <h4>Vista previa</h4>
          {previewError && (
            <div className="error-callout" role="alert">
              {previewError}
            </div>
          )}
          {previewRows.length > 0 && (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    {previewHeaders.map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, i) => (
                    <tr key={i}>
                      {orderedKeys.map((key) => (
                        <td
                          key={key}
                          style={{
                            maxWidth: 180,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={row[key]}
                        >
                          {row[key]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
