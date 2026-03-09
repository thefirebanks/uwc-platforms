"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ExportCatalogField, ExportPresetSummary } from "@/lib/server/exports-service";

type ExportFormat = "csv" | "xlsx";
type EligibilityFilter = "all" | "eligible" | "ineligible" | "pending" | "advanced";
type ExportTargetMode = "filtered" | "manual" | "randomSample";
type GroupedExportMode = "single-sheet" | "multi-sheet" | "separate-files";

type Props = {
  cycleId?: string | null;
  stageCode?: string | null;
};

type ManualCandidateRow = {
  id: string;
  candidateName: string;
  candidateEmail: string;
  stageCode: string;
  status: string;
};

type PreviewResponse = {
  preview?: {
    sheetName: string;
    applicantHeaders: string[];
    rows: Array<{ label: string; values: string[] }>;
  };
  totalFiltered?: number;
  exportedApplicants?: number;
  sheetCount?: number;
  userMessage?: string;
};

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
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isSavingPreset, setIsSavingPreset] = useState(false);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [stageFilter, setStageFilter] = useState<string>(stageCode ?? "all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [eligibilityFilter, setEligibilityFilter] = useState<EligibilityFilter>("all");
  const [targetMode, setTargetMode] = useState<ExportTargetMode>("filtered");
  const [groupedExportMode, setGroupedExportMode] = useState<GroupedExportMode>("single-sheet");
  const [manualGroupCount, setManualGroupCount] = useState(1);
  const [randomGroupCount, setRandomGroupCount] = useState(4);
  const [randomApplicantsPerGroup, setRandomApplicantsPerGroup] = useState(5);

  const [manualCandidates, setManualCandidates] = useState<ManualCandidateRow[]>([]);
  const [manualCandidatesLoading, setManualCandidatesLoading] = useState(false);
  const [manualCandidatesError, setManualCandidatesError] = useState<string | null>(null);
  const [selectedApplicationIds, setSelectedApplicationIds] = useState<string[]>([]);
  const [groupAssignments, setGroupAssignments] = useState<Record<string, string>>({});

  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<PreviewResponse["preview"] | null>(null);
  const [previewMeta, setPreviewMeta] = useState<{ totalFiltered: number; exportedApplicants: number; sheetCount: number } | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const fieldLabelMap = useMemo(
    () => new Map(catalogFields.map((field) => [field.key, field])),
    [catalogFields],
  );

  const groupedFields = useMemo(() => groupFields(catalogFields), [catalogFields]);

  const exportModeUsesGrouping =
    targetMode === "randomSample" || (targetMode === "manual" && manualGroupCount > 1);

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

  useEffect(() => {
    setStageFilter(stageCode ?? "all");
  }, [stageCode]);

  useEffect(() => {
    setPreviewData(null);
    setPreviewMeta(null);
    setPreviewError(null);
    setDownloadError(null);
  }, [
    selectedFields,
    format,
    searchQuery,
    stageFilter,
    statusFilter,
    eligibilityFilter,
    targetMode,
    groupedExportMode,
    manualGroupCount,
    randomGroupCount,
    randomApplicantsPerGroup,
    selectedApplicationIds,
    groupAssignments,
  ]);

  useEffect(() => {
    if (!cycleId || targetMode !== "manual") {
      setManualCandidates([]);
      return;
    }

    const controller = new AbortController();
    setManualCandidatesLoading(true);
    setManualCandidatesError(null);

    const params = new URLSearchParams();
    params.set("cycleId", cycleId);
    params.set("page", "1");
    params.set("pageSize", "80");
    params.set("sortBy", "full_name");
    params.set("sortOrder", "asc");
    if (searchQuery.trim()) params.set("q", searchQuery.trim());
    if (stageFilter !== "all") params.set("stageCode", stageFilter);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (eligibilityFilter !== "all") params.set("eligibility", eligibilityFilter);

    void (async () => {
      try {
        const response = await fetch(`/api/applications/search?${params.toString()}`, {
          signal: controller.signal,
        });
        const body = (await response.json()) as {
          rows?: ManualCandidateRow[];
          userMessage?: string;
        };
        if (!response.ok) {
          throw new Error(body.userMessage ?? "No se pudo cargar la lista de postulantes.");
        }

        setManualCandidates(body.rows ?? []);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        setManualCandidatesError(
          error instanceof Error ? error.message : "Error cargando postulantes.",
        );
      } finally {
        setManualCandidatesLoading(false);
      }
    })();

    return () => controller.abort();
  }, [cycleId, targetMode, searchQuery, stageFilter, statusFilter, eligibilityFilter]);

  function toggleField(fieldKey: string) {
    setActivePresetId(null);
    setSelectedFields((current) => {
      if (current.includes(fieldKey)) {
        return current.filter((entry) => entry !== fieldKey);
      }

      return [...current, fieldKey];
    });
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
  }

  function toggleManualApplicant(applicationId: string) {
    setSelectedApplicationIds((current) => {
      if (current.includes(applicationId)) {
        const nextAssignments = { ...groupAssignments };
        delete nextAssignments[applicationId];
        setGroupAssignments(nextAssignments);
        return current.filter((id) => id !== applicationId);
      }

      if (manualGroupCount > 1) {
        setGroupAssignments((currentAssignments) => ({
          ...currentAssignments,
          [applicationId]: currentAssignments[applicationId] ?? "1",
        }));
      }

      return [...current, applicationId];
    });
  }

  function setApplicantGroup(applicationId: string, groupKey: string) {
    setGroupAssignments((current) => ({
      ...current,
      [applicationId]: groupKey,
    }));
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

  function buildExportPayload(action: "preview" | "download") {
    if (!cycleId) {
      throw new Error("Selecciona un proceso para exportar.");
    }

    return {
      action,
      cycleId,
      stageCode: stageFilter,
      status: statusFilter === "all" ? null : statusFilter,
      eligibility: eligibilityFilter,
      query: searchQuery.trim() || null,
      selectedFields,
      format,
      targetMode,
      selectedApplicationIds: targetMode === "manual" ? selectedApplicationIds : undefined,
      groupAssignments:
        targetMode === "manual" && manualGroupCount > 1
          ? selectedApplicationIds.map((applicationId) => ({
            applicationId,
            groupKey: `group-${groupAssignments[applicationId] ?? "1"}`,
            groupLabel: `Grupo ${groupAssignments[applicationId] ?? "1"}`,
          }))
          : undefined,
      randomSample:
        targetMode === "randomSample"
          ? {
            groupCount: randomGroupCount,
            applicantsPerGroup: randomApplicantsPerGroup,
          }
          : undefined,
      groupedExportMode: exportModeUsesGrouping ? groupedExportMode : "single-sheet",
    };
  }

  async function handlePreview() {
    if (selectedFields.length === 0) {
      return;
    }

    setIsPreviewing(true);
    setPreviewError(null);

    try {
      const response = await fetch("/api/exports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildExportPayload("preview")),
      });
      const body = (await response.json()) as PreviewResponse;
      if (!response.ok) {
        throw new Error(body.userMessage ?? "No se pudo generar la vista previa.");
      }

      setPreviewData(body.preview ?? null);
      setPreviewMeta({
        totalFiltered: body.totalFiltered ?? 0,
        exportedApplicants: body.exportedApplicants ?? 0,
        sheetCount: body.sheetCount ?? 0,
      });
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
      const response = await fetch("/api/exports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildExportPayload("download")),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { userMessage?: string } | null;
        throw new Error(body?.userMessage ?? "No se pudo descargar la exportacion.");
      }

      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const fileNameMatch = disposition.match(/filename="([^"]+)"/);
      const fallbackExtension = response.headers.get("Content-Type")?.includes("zip")
        ? "zip"
        : format;
      const fileName =
        fileNameMatch?.[1] ??
        `postulaciones-${new Date().toISOString().replaceAll(":", "-")}.${fallbackExtension}`;

      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = fileName;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "Error desconocido.");
    } finally {
      setIsDownloading(false);
    }
  }

  const selectedCount = selectedApplicationIds.length;

  return (
    <div className="export-builder">
      <div className="export-builder__panel card">
        <div className="export-builder__panel-header">
          <div>
            <h3 className="export-builder__title">Exportar Postulaciones</h3>
            <p className="muted-text export-builder__hint">
              Exporta en plantilla vertical: una fila por campo y una columna por postulante.
            </p>
          </div>
          <div className="export-builder__actions">
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setSelectedFields(catalogFields.map((field) => field.key))}
            >
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
          <div style={{ display: "grid", gap: "1rem" }}>
            <div
              style={{
                display: "grid",
                gap: "1rem",
                gridTemplateColumns: "minmax(0, 1.35fr) minmax(320px, 1fr)",
              }}
            >
              <div style={{ display: "grid", gap: "1rem" }}>
                {groupedFields.map((group) => (
                  <div
                    key={group.key}
                    style={{ border: "1px solid var(--sand)", borderRadius: "var(--radius)", padding: "0.9rem" }}
                  >
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
                          <span style={{ display: "block", lineHeight: 1.35 }}>
                            <strong>{field.label}</strong>
                            {field.helperText ? (
                              <span style={{ display: "block", fontSize: "0.72rem", color: "var(--muted)" }}>
                                {field.helperText}
                              </span>
                            ) : null}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: "grid", gap: "1rem" }}>
                <div className="card" style={{ padding: "1rem", border: "1px solid var(--sand)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: "0.82rem", fontWeight: 700 }}>Campos seleccionados</div>
                      <div className="muted-text">{selectedFields.length} campo(s)</div>
                    </div>
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => void handleSavePreset()}
                      disabled={isSavingPreset || selectedFields.length === 0}
                    >
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
                      <p className="muted-text">Selecciona al menos un campo para exportar.</p>
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
                </div>

                <div className="card" style={{ padding: "1rem", border: "1px solid var(--sand)" }}>
                  <div style={{ fontSize: "0.82rem", fontWeight: 700, marginBottom: "0.75rem" }}>Qué exportar</div>
                  <div style={{ display: "grid", gap: "0.75rem" }}>
                    <input
                      type="text"
                      className="search-input"
                      placeholder="Buscar por nombre o email"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                    />
                    <select className="filter-select" value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}>
                      <option value="all">Todas las etapas</option>
                      <option value="documents">1. Formulario Principal</option>
                      <option value="exam_placeholder">2. Examen Academico</option>
                    </select>
                    <select
                      className="filter-select"
                      value={statusFilter}
                      onChange={(event) => {
                        const value = event.target.value;
                        setStatusFilter(value);
                        if (value !== "all") {
                          setEligibilityFilter("all");
                        }
                      }}
                    >
                      <option value="all">Todos los estados</option>
                      <option value="draft">En progreso</option>
                      <option value="submitted">Submitted</option>
                      <option value="eligible">Completado</option>
                      <option value="ineligible">No elegible</option>
                      <option value="advanced">Avanzado</option>
                    </select>
                    <select
                      className="filter-select"
                      value={eligibilityFilter}
                      onChange={(event) => {
                        const value = event.target.value as EligibilityFilter;
                        setEligibilityFilter(value);
                        if (value !== "all") {
                          setStatusFilter("all");
                        }
                      }}
                    >
                      <option value="all">Todas las elegibilidades</option>
                      <option value="eligible">Solo elegibles</option>
                      <option value="ineligible">Solo no elegibles</option>
                      <option value="pending">Pendientes</option>
                      <option value="advanced">Avanzados</option>
                    </select>
                  </div>

                  <div style={{ display: "grid", gap: "0.6rem", marginTop: "1rem" }}>
                    <label className="export-builder__format-option">
                      <input type="radio" name="target-mode" checked={targetMode === "filtered"} onChange={() => setTargetMode("filtered")} />
                      <span>Todos los postulantes filtrados</span>
                    </label>
                    <label className="export-builder__format-option">
                      <input type="radio" name="target-mode" checked={targetMode === "manual"} onChange={() => setTargetMode("manual")} />
                      <span>Selección manual</span>
                    </label>
                    <label className="export-builder__format-option">
                      <input type="radio" name="target-mode" checked={targetMode === "randomSample"} onChange={() => setTargetMode("randomSample")} />
                      <span>Muestra aleatoria por grupos</span>
                    </label>
                  </div>

                  {targetMode === "manual" ? (
                    <div style={{ marginTop: "1rem", display: "grid", gap: "0.75rem" }}>
                      <label style={{ display: "grid", gap: "0.35rem" }}>
                        <span className="field-label">Cantidad de grupos manuales</span>
                        <input
                          type="number"
                          min={1}
                          max={12}
                          value={manualGroupCount}
                          onChange={(event) => setManualGroupCount(Math.max(1, Number(event.target.value) || 1))}
                          className="search-input"
                        />
                      </label>

                      <div style={{ fontSize: "0.76rem", color: "var(--muted)" }}>
                        {selectedCount} postulante(s) seleccionados
                      </div>

                      {manualCandidatesLoading ? (
                        <p className="muted-text">Cargando postulantes…</p>
                      ) : manualCandidatesError ? (
                        <div className="error-callout" role="alert">{manualCandidatesError}</div>
                      ) : (
                        <div style={{ maxHeight: 320, overflow: "auto", border: "1px solid var(--sand)", borderRadius: "var(--radius)" }}>
                          {manualCandidates.length === 0 ? (
                            <div style={{ padding: "0.85rem" }} className="muted-text">No hay postulantes con esos filtros.</div>
                          ) : (
                            manualCandidates.map((candidate) => {
                              const isSelected = selectedApplicationIds.includes(candidate.id);
                              return (
                                <div
                                  key={candidate.id}
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns: manualGroupCount > 1 ? "auto 1fr 120px" : "auto 1fr",
                                    gap: "0.75rem",
                                    alignItems: "center",
                                    padding: "0.75rem",
                                    borderBottom: "1px solid var(--sand)",
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggleManualApplicant(candidate.id)}
                                  />
                                  <div>
                                    <div style={{ fontWeight: 600, fontSize: "0.84rem" }}>{candidate.candidateName}</div>
                                    <div style={{ fontSize: "0.72rem", color: "var(--muted)" }}>
                                      {candidate.candidateEmail} · {candidate.stageCode} · {candidate.status}
                                    </div>
                                  </div>
                                  {manualGroupCount > 1 ? (
                                    <select
                                      className="filter-select"
                                      value={groupAssignments[candidate.id] ?? "1"}
                                      onChange={(event) => setApplicantGroup(candidate.id, event.target.value)}
                                      disabled={!isSelected}
                                    >
                                      {Array.from({ length: manualGroupCount }, (_, index) => (
                                        <option key={index + 1} value={String(index + 1)}>
                                          {`Grupo ${index + 1}`}
                                        </option>
                                      ))}
                                    </select>
                                  ) : null}
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  ) : null}

                  {targetMode === "randomSample" ? (
                    <div style={{ marginTop: "1rem", display: "grid", gap: "0.75rem", gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
                      <label style={{ display: "grid", gap: "0.35rem" }}>
                        <span className="field-label">Número de grupos</span>
                        <input
                          type="number"
                          min={1}
                          max={25}
                          value={randomGroupCount}
                          onChange={(event) => setRandomGroupCount(Math.max(1, Number(event.target.value) || 1))}
                          className="search-input"
                        />
                      </label>
                      <label style={{ display: "grid", gap: "0.35rem" }}>
                        <span className="field-label">Postulantes por grupo</span>
                        <input
                          type="number"
                          min={1}
                          max={100}
                          value={randomApplicantsPerGroup}
                          onChange={(event) => setRandomApplicantsPerGroup(Math.max(1, Number(event.target.value) || 1))}
                          className="search-input"
                        />
                      </label>
                    </div>
                  ) : null}
                </div>

                <div className="card" style={{ padding: "1rem", border: "1px solid var(--sand)" }}>
                  <div style={{ fontSize: "0.82rem", fontWeight: 700, marginBottom: "0.75rem" }}>Cómo descargar</div>
                  <div className="export-builder__format-row">
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

                  {exportModeUsesGrouping ? (
                    <div style={{ display: "grid", gap: "0.6rem", marginTop: "0.85rem" }}>
                      <label className="export-builder__format-option">
                        <input
                          type="radio"
                          name="grouped-export-mode"
                          checked={groupedExportMode === "single-sheet"}
                          onChange={() => setGroupedExportMode("single-sheet")}
                        />
                        <span>Una sola hoja con todos los grupos</span>
                      </label>
                      <label className="export-builder__format-option">
                        <input
                          type="radio"
                          name="grouped-export-mode"
                          checked={groupedExportMode === "multi-sheet"}
                          onChange={() => setGroupedExportMode("multi-sheet")}
                          disabled={format !== "xlsx"}
                        />
                        <span>Un archivo Excel con una hoja por grupo</span>
                      </label>
                      <label className="export-builder__format-option">
                        <input
                          type="radio"
                          name="grouped-export-mode"
                          checked={groupedExportMode === "separate-files"}
                          onChange={() => setGroupedExportMode("separate-files")}
                        />
                        <span>Un archivo por grupo (ZIP si hay varios)</span>
                      </label>
                    </div>
                  ) : null}

                  <div className="export-builder__btn-row" style={{ marginTop: "1rem" }}>
                    <button className="btn btn-secondary" onClick={() => void handlePreview()} disabled={isPreviewing || selectedFields.length === 0}>
                      {isPreviewing ? "Cargando..." : "Vista previa"}
                    </button>
                    <button className="btn btn-primary" onClick={() => void handleDownload()} disabled={isDownloading || selectedFields.length === 0}>
                      {isDownloading ? "Descargando..." : `Descargar ${format.toUpperCase()}`}
                    </button>
                  </div>
                </div>
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

      {(previewData || previewError) ? (
        <div className="export-builder__preview card">
          <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "baseline" }}>
            <h4>Vista previa</h4>
            {previewMeta ? (
              <div className="muted-text" style={{ fontSize: "0.78rem" }}>
                {`${previewMeta.exportedApplicants} exportados · ${previewMeta.totalFiltered} filtrados · ${previewMeta.sheetCount} hoja(s)`}
              </div>
            ) : null}
          </div>
          {previewError ? <div className="error-callout" role="alert">{previewError}</div> : null}
          {previewData ? (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Campo</th>
                    {previewData.applicantHeaders.map((header) => (
                      <th key={header}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewData.rows.map((row) => (
                    <tr key={row.label}>
                      <td style={{ fontWeight: 700 }}>{row.label}</td>
                      {row.values.map((value, index) => (
                        <td
                          key={`${row.label}-${previewData.applicantHeaders[index] ?? index}`}
                          style={{
                            maxWidth: 220,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={value}
                        >
                          {value}
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
