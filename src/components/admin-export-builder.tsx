"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import type { ExportCatalogField, ExportPresetSummary } from "@/lib/server/exports-service";

type ExportFormat = "csv" | "xlsx";

type Props = {
  cycleId?: string | null;
  stageCode?: string | null;
};

type PreviewRow = Record<string, string>;

function buildExportUrl(params: {
  cycleId?: string | null;
  stageCode?: string | null;
  format: ExportFormat;
  selectedFields: string[];
  previewLimit?: number;
}) {
  const sp = new URLSearchParams();
  if (params.cycleId) sp.set("cycleId", params.cycleId);
  if (params.stageCode) sp.set("stageCode", params.stageCode);
  sp.set("format", params.format);
  sp.set("fields", params.selectedFields.join(","));
  if (params.previewLimit !== undefined) {
    sp.set("limit", String(params.previewLimit));
  }
  return `/api/exports?${sp.toString()}`;
}

function groupFields(fields: ExportCatalogField[]) {
  const groups = new Map<string, { label: string; fields: ExportCatalogField[] }>();

  for (const field of fields) {
    if (!groups.has(field.groupKey)) {
      groups.set(field.groupKey, {
        label: field.groupLabel,
        fields: [],
      });
    }

    groups.get(field.groupKey)?.fields.push(field);
  }

  return Array.from(groups.entries()).map(([key, value]) => ({
    key,
    label: value.label,
    fields: value.fields,
  }));
}

export function AdminExportBuilder({ cycleId, stageCode }: Props) {
  const [catalogFields, setCatalogFields] = useState<ExportCatalogField[]>([]);
  const [presets, setPresets] = useState<ExportPresetSummary[]>([]);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [format, setFormat] = useState<ExportFormat>("xlsx");
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([]);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isSavingPreset, setIsSavingPreset] = useState(false);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);

  const fieldLabelMap = useMemo(
    () => new Map(catalogFields.map((field) => [field.key, field])),
    [catalogFields],
  );

  const groupedFields = useMemo(() => groupFields(catalogFields), [catalogFields]);

  const loadCatalog = useCallback(async () => {
    if (!cycleId) {
      setCatalogFields([]);
      setPresets([]);
      setSelectedFields([]);
      return;
    }

    setLoadingCatalog(true);
    setCatalogError(null);

    try {
      const response = await fetch(`/api/exports?catalog=1&cycleId=${cycleId}`);
      const body = (await response.json()) as {
        fields?: ExportCatalogField[];
        presets?: ExportPresetSummary[];
        userMessage?: string;
      };

      if (!response.ok) {
        throw new Error(body.userMessage ?? "No se pudo cargar el catalogo.");
      }

      const nextFields = body.fields ?? [];
      const nextPresets = body.presets ?? [];
      setCatalogFields(nextFields);
      setPresets(nextPresets);
      setSelectedFields((current) =>
        current.length > 0
          ? current.filter((fieldKey) => nextFields.some((field) => field.key === fieldKey))
          : nextFields.filter((field) => field.defaultSelected).map((field) => field.key),
      );
    } catch (error) {
      setCatalogError(error instanceof Error ? error.message : "Error desconocido.");
    } finally {
      setLoadingCatalog(false);
    }
  }, [cycleId]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  function toggleField(fieldKey: string) {
    setActivePresetId(null);
    setSelectedFields((current) => {
      if (current.includes(fieldKey)) {
        return current.filter((entry) => entry !== fieldKey);
      }

      return [...current, fieldKey];
    });
    setPreviewRows([]);
    setPreviewHeaders([]);
  }

  function moveField(fieldKey: string, direction: "up" | "down") {
    setActivePresetId(null);
    setSelectedFields((current) => {
      const index = current.indexOf(fieldKey);
      if (index === -1) {
        return current;
      }

      const nextIndex = direction === "up" ? index - 1 : index + 1;
      if (nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }

      const next = [...current];
      const [removed] = next.splice(index, 1);
      next.splice(nextIndex, 0, removed);
      return next;
    });
  }

  function applyPreset(preset: ExportPresetSummary) {
    setSelectedFields(preset.selectedFields);
    setActivePresetId(preset.id);
    setPreviewRows([]);
    setPreviewHeaders([]);
  }

  async function handleSavePreset() {
    if (!cycleId || selectedFields.length === 0) {
      return;
    }

    const presetName = window.prompt(
      "Nombre del preset:",
      activePresetId
        ? presets.find((preset) => preset.id === activePresetId)?.name ?? ""
        : "Exportacion personalizada",
    );

    if (!presetName || presetName.trim().length < 2) {
      return;
    }

    setIsSavingPreset(true);
    try {
      const response = await fetch("/api/exports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cycleId,
          presetId: activePresetId,
          name: presetName,
          selectedFields,
        }),
      });
      const body = (await response.json()) as {
        preset?: ExportPresetSummary;
        userMessage?: string;
      };

      if (!response.ok || !body.preset) {
        throw new Error(body.userMessage ?? "No se pudo guardar el preset.");
      }

      await loadCatalog();
      setActivePresetId(body.preset.id);
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "Error desconocido.");
    } finally {
      setIsSavingPreset(false);
    }
  }

  async function handlePreview() {
    if (selectedFields.length === 0) {
      return;
    }

    setIsPreviewing(true);
    setPreviewError(null);
    setPreviewRows([]);
    setPreviewHeaders([]);

    try {
      const response = await fetch(
        buildExportUrl({
          cycleId,
          stageCode,
          format: "csv",
          selectedFields,
          previewLimit: 5,
        }),
      );

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { userMessage?: string } | null;
        throw new Error(body?.userMessage ?? "No se pudo cargar la vista previa.");
      }

      const text = await response.text();
      const parsed = Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: true,
      });

      setPreviewHeaders(parsed.meta.fields ?? []);
      setPreviewRows(parsed.data);
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : "Error desconocido.");
    } finally {
      setIsPreviewing(false);
    }
  }

  async function handleDownload() {
    if (selectedFields.length === 0) {
      return;
    }

    setIsDownloading(true);
    setDownloadError(null);

    try {
      const response = await fetch(
        buildExportUrl({
          cycleId,
          stageCode,
          format,
          selectedFields,
        }),
      );

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { userMessage?: string } | null;
        throw new Error(body?.userMessage ?? "No se pudo descargar la exportacion.");
      }

      const blob = await response.blob();
      const stamp = new Date().toISOString().replaceAll(":", "-");
      const extension = format === "xlsx" ? "xlsx" : "csv";
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `postulaciones-${stamp}.${extension}`;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "Error desconocido.");
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <div className="export-builder">
      <div className="export-builder__panel card">
        <div className="export-builder__panel-header">
          <div>
            <h3 className="export-builder__title">Exportar Postulaciones</h3>
            <p className="muted-text export-builder__hint">
              Selecciona campos base y respuestas del formulario sin escribir rutas tecnicas.
            </p>
          </div>
          <div className="export-builder__actions">
            <button className="btn btn-ghost btn-sm" onClick={() => setSelectedFields(catalogFields.map((field) => field.key))}>
              Todos
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setSelectedFields([])}>
              Ninguno
            </button>
          </div>
        </div>

        {!cycleId ? (
          <p className="muted-text">Selecciona un proceso para habilitar la exportacion.</p>
        ) : loadingCatalog ? (
          <p className="muted-text">Cargando catalogo...</p>
        ) : catalogError ? (
          <div className="error-callout" role="alert">{catalogError}</div>
        ) : (
          <div
            style={{
              display: "grid",
              gap: "1rem",
              gridTemplateColumns: "minmax(0, 1.4fr) minmax(280px, 1fr)",
            }}
          >
            <div style={{ display: "grid", gap: "1rem" }}>
              {groupedFields.map((group) => (
                <div key={group.key} style={{ border: "1px solid var(--sand)", borderRadius: "var(--radius)", padding: "0.9rem" }}>
                  <div style={{ fontSize: "0.82rem", fontWeight: 700, marginBottom: "0.65rem" }}>{group.label}</div>
                  <div className="export-builder__columns">
                    {group.fields.map((field) => (
                      <label
                        key={field.key}
                        className="export-builder__col-label"
                        style={{
                          display: "grid",
                          gridTemplateColumns: "auto 1fr",
                          gap: "0.65rem",
                          alignItems: "start",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedFields.includes(field.key)}
                          onChange={() => toggleField(field.key)}
                          className="export-builder__checkbox"
                        />
                        <span style={{ display: "block", lineHeight: 1.35 }}>{field.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="card" style={{ padding: "1rem", border: "1px solid var(--sand)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: "0.82rem", fontWeight: 700 }}>Columnas seleccionadas</div>
                  <div className="muted-text">{selectedFields.length} campo(s)</div>
                </div>
                <button className="btn btn-outline btn-sm" onClick={() => void handleSavePreset()} disabled={isSavingPreset || selectedFields.length === 0}>
                  {isSavingPreset ? "Guardando..." : "Guardar preset"}
                </button>
              </div>

              {presets.length > 0 ? (
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.75rem" }}>
                  {presets.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      className={`status-pill ${activePresetId === preset.id ? "complete" : ""}`}
                      onClick={() => applyPreset(preset)}
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>
              ) : null}

              <div style={{ display: "grid", gap: "0.5rem", marginTop: "1rem" }}>
                {selectedFields.length === 0 ? (
                  <p className="muted-text">Selecciona al menos un campo para previsualizar o descargar.</p>
                ) : (
                  selectedFields.map((fieldKey, index) => {
                    const field = fieldLabelMap.get(fieldKey);
                    return (
                      <div
                        key={fieldKey}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr auto",
                          gap: "0.5rem",
                          alignItems: "center",
                          padding: "0.65rem 0.75rem",
                          border: "1px solid var(--sand)",
                          borderRadius: "var(--radius)",
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600, fontSize: "0.84rem" }}>{field?.label ?? fieldKey}</div>
                          <div style={{ fontSize: "0.72rem", color: "var(--muted)" }}>
                            {field?.groupLabel ?? "Campo"}
                            {field?.helperText ? ` · ${field.helperText}` : ""}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: "0.35rem" }}>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => moveField(fieldKey, "up")} disabled={index === 0}>↑</button>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => moveField(fieldKey, "down")} disabled={index === selectedFields.length - 1}>↓</button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="export-builder__format-row" style={{ marginTop: "1rem" }}>
                <span className="field-label">Formato</span>
                <label className="export-builder__format-option">
                  <input type="radio" name="export-format" value="xlsx" checked={format === "xlsx"} onChange={() => setFormat("xlsx")} />
                  <span>Excel (.xlsx)</span>
                </label>
                <label className="export-builder__format-option">
                  <input type="radio" name="export-format" value="csv" checked={format === "csv"} onChange={() => setFormat("csv")} />
                  <span>CSV</span>
                </label>
              </div>

              <div className="export-builder__btn-row">
                <button className="btn btn-secondary" onClick={() => void handlePreview()} disabled={isPreviewing || selectedFields.length === 0}>
                  {isPreviewing ? "Cargando..." : "Vista previa (5 filas)"}
                </button>
                <button className="btn btn-primary" onClick={() => void handleDownload()} disabled={isDownloading || selectedFields.length === 0}>
                  {isDownloading ? "Descargando..." : `Descargar ${format.toUpperCase()}`}
                </button>
              </div>
            </div>
          </div>
        )}

        {downloadError ? (
          <div className="error-callout" role="alert" style={{ marginTop: "1rem" }}>
            {downloadError}
          </div>
        ) : null}
      </div>

      {(previewRows.length > 0 || previewError) ? (
        <div className="export-builder__preview card">
          <h4>Vista previa</h4>
          {previewError ? <div className="error-callout" role="alert">{previewError}</div> : null}
          {previewRows.length > 0 ? (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    {previewHeaders.map((header) => (
                      <th key={header}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, index) => (
                    <tr key={`${index}-${previewHeaders.join("|")}`}>
                      {previewHeaders.map((header) => (
                        <td
                          key={header}
                          style={{
                            maxWidth: 180,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={row[header] ?? ""}
                        >
                          {row[header] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
