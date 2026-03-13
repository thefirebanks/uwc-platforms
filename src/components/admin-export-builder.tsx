"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ExportCatalogField, ExportPresetSummary } from "@/lib/server/exports-service";
import {
  fetchApi,
  fetchApiResponse,
  toNormalizedApiError,
} from "@/lib/client/api-client";
import {
  groupFields,
  filterGroupedFields,
} from "@/components/admin-export-builder-types";
import type {
  ExportFormat,
  EligibilityFilter,
  ExportTargetMode,
  GroupedExportMode,
  ManualCandidateRow,
  PreviewResponse,
} from "@/components/admin-export-builder-types";

type Props = {
  cycleId?: string | null;
  stageCode?: string | null;
};

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

  const [exportMode, setExportMode] = useState<"quick" | "custom">("quick");
  const [catalogSearch, setCatalogSearch] = useState("");
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
  const [previewMeta, setPreviewMeta] = useState<{
    totalFiltered: number;
    exportedApplicants: number;
    sheetCount: number;
  } | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const fieldLabelMap = useMemo(
    () => new Map(catalogFields.map((field) => [field.key, field])),
    [catalogFields],
  );

  const groupedFields = useMemo(() => groupFields(catalogFields), [catalogFields]);

  const filteredGroupedFields = useMemo(
    () => filterGroupedFields(groupedFields, catalogSearch),
    [groupedFields, catalogSearch],
  );

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
      const body = await fetchApi<{
        fields?: ExportCatalogField[];
        presets?: ExportPresetSummary[];
      }>(`/api/exports?catalog=1&cycleId=${cycleId}`);

      const nextFields = body.fields ?? [];
      const nextPresets = body.presets ?? [];
      setCatalogFields(nextFields);
      setPresets(nextPresets);
      setSelectedFields((current) => {
        if (current.length > 0) {
          return current.filter((fieldKey) => nextFields.some((field) => field.key === fieldKey));
        }
        // Auto-apply first preset (used as the "quick export" default)
        if (nextPresets.length > 0) return nextPresets[0].selectedFields;
        return nextFields.filter((field) => field.defaultSelected).map((field) => field.key);
      });
      setActivePresetId((currentId) => {
        if (!currentId && nextPresets.length > 0) return nextPresets[0].id;
        return currentId;
      });
    } catch (requestError) {
      setCatalogError(
        toNormalizedApiError(requestError, "No se pudo cargar el catalogo.").message,
      );
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
        const body = await fetchApi<{
          rows?: ManualCandidateRow[];
        }>(`/api/applications/search?${params.toString()}`, {
          signal: controller.signal,
        });
        setManualCandidates(body.rows ?? []);
      } catch (requestError) {
        if (requestError instanceof Error && requestError.name === "AbortError") return;
        setManualCandidatesError(
          toNormalizedApiError(
            requestError,
            "No se pudo cargar la lista de postulantes.",
          ).message,
        );
      } finally {
        setManualCandidatesLoading(false);
      }
    })();

    return () => controller.abort();
  }, [cycleId, targetMode, searchQuery, stageFilter, statusFilter, eligibilityFilter]);

  function toggleField(fieldKey: string) {
    setActivePresetId(null);
    setSelectedFields((current) =>
      current.includes(fieldKey)
        ? current.filter((entry) => entry !== fieldKey)
        : [...current, fieldKey],
    );
  }

  function moveField(fieldKey: string, direction: "up" | "down") {
    setActivePresetId(null);
    setSelectedFields((current) => {
      const index = current.indexOf(fieldKey);
      if (index === -1) return current;
      const nextIndex = direction === "up" ? index - 1 : index + 1;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
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
    setGroupAssignments((current) => ({ ...current, [applicationId]: groupKey }));
  }

  async function handleSavePreset() {
    if (!cycleId || selectedFields.length === 0) return;

    const presetName = window.prompt(
      "Nombre del preset:",
      activePresetId
        ? presets.find((preset) => preset.id === activePresetId)?.name ?? ""
        : "Exportacion personalizada",
    );

    if (!presetName || presetName.trim().length < 2) return;

    setIsSavingPreset(true);
    try {
      const body = await fetchApi<{
        preset?: ExportPresetSummary;
      }>("/api/exports", {
        method: "POST",
        body: JSON.stringify({
          cycleId,
          presetId: activePresetId,
          name: presetName,
          selectedFields,
        }),
      });
      if (!body.preset) {
        throw new Error("No se pudo guardar el preset.");
      }

      await loadCatalog();
      setActivePresetId(body.preset.id);
    } catch (requestError) {
      setDownloadError(
        toNormalizedApiError(requestError, "No se pudo guardar el preset.").message,
      );
    } finally {
      setIsSavingPreset(false);
    }
  }

  function buildExportPayload(action: "preview" | "download") {
    if (!cycleId) throw new Error("Selecciona un proceso para exportar.");

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
          ? { groupCount: randomGroupCount, applicantsPerGroup: randomApplicantsPerGroup }
          : undefined,
      groupedExportMode: exportModeUsesGrouping ? groupedExportMode : "single-sheet",
    };
  }

  async function handlePreview() {
    if (selectedFields.length === 0) return;

    setIsPreviewing(true);
    setPreviewError(null);

    try {
      const body = await fetchApi<PreviewResponse>("/api/exports", {
        method: "POST",
        body: JSON.stringify(buildExportPayload("preview")),
      });

      setPreviewData(body.preview ?? null);
      setPreviewMeta({
        totalFiltered: body.totalFiltered ?? 0,
        exportedApplicants: body.exportedApplicants ?? 0,
        sheetCount: body.sheetCount ?? 0,
      });
    } catch (requestError) {
      setPreviewError(
        toNormalizedApiError(requestError, "No se pudo generar la vista previa.").message,
      );
    } finally {
      setIsPreviewing(false);
    }
  }

  async function handleDownload() {
    if (selectedFields.length === 0) return;

    setIsDownloading(true);
    setDownloadError(null);

    try {
      const response = await fetchApiResponse("/api/exports", {
        method: "POST",
        body: JSON.stringify(buildExportPayload("download")),
      });

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
    } catch (requestError) {
      setDownloadError(
        toNormalizedApiError(requestError, "No se pudo descargar la exportacion.").message,
      );
    } finally {
      setIsDownloading(false);
    }
  }

  const selectedCount = selectedApplicationIds.length;

  return (
    <div className="export-builder">

      {/* ── Mode bar ── */}
      <div className="export-builder__mode-bar">
        <button
          type="button"
          className={`export-builder__mode-btn${exportMode === "quick" ? " active" : ""}`}
          onClick={() => setExportMode("quick")}
        >
          Exportación rápida
        </button>
        <button
          type="button"
          className={`export-builder__mode-btn${exportMode === "custom" ? " active" : ""}`}
          onClick={() => setExportMode("custom")}
        >
          Personalizar campos
        </button>
      </div>

      {/* ── Quick export panel ── */}
      {exportMode === "quick" && (
        <div className="export-builder__quick">
          <div className="export-builder__quick-body">

            {/* Preset info */}
            <div className="export-builder__quick-preset">
              <div className="export-builder__quick-preset-name">
                {loadingCatalog
                  ? "Cargando…"
                  : activePresetId
                    ? (presets.find((p) => p.id === activePresetId)?.name ?? "Preset")
                    : "Campos por defecto"}
              </div>
              <div className="export-builder__quick-preset-meta">
                {!cycleId
                  ? "Selecciona un proceso para habilitar la exportación."
                  : catalogError
                    ? catalogError
                    : `${selectedFields.length} campo${selectedFields.length !== 1 ? "s" : ""} seleccionados`}
              </div>
            </div>

            {/* Filters */}
            <div className="export-builder__quick-filters">
              <div className="export-builder__quick-filter-field">
                <span className="export-builder__quick-filter-label">Etapa</span>
                <select
                  className="filter-select"
                  value={stageFilter}
                  onChange={(e) => setStageFilter(e.target.value)}
                >
                  <option value="all">Todas las etapas</option>
                  <option value="documents">1. Formulario Principal</option>
                  <option value="exam_placeholder">2. Examen Académico</option>
                </select>
              </div>
              <div className="export-builder__quick-filter-field">
                <span className="export-builder__quick-filter-label">Estado</span>
                <select
                  className="filter-select"
                  value={statusFilter}
                  onChange={(e) => {
                    const value = e.target.value;
                    setStatusFilter(value);
                    if (value !== "all") setEligibilityFilter("all");
                  }}
                >
                  <option value="all">Todos los estados</option>
                  <option value="draft">En progreso</option>
                  <option value="submitted">Submitted</option>
                  <option value="eligible">Completado</option>
                  <option value="ineligible">No elegible</option>
                  <option value="advanced">Avanzado</option>
                </select>
              </div>
            </div>

            {/* Download actions */}
            <div className="export-builder__quick-actions">
              <button
                className="btn btn-primary"
                onClick={() => void handleDownload()}
                disabled={isDownloading || selectedFields.length === 0 || !cycleId}
              >
                {isDownloading ? "Descargando…" : `Descargar ${format.toUpperCase()}`}
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => void handlePreview()}
                disabled={isPreviewing || selectedFields.length === 0 || !cycleId}
              >
                {isPreviewing ? "Cargando…" : "Vista previa"}
              </button>
              {downloadError ? (
                <div className="error-callout" role="alert" style={{ width: "100%", marginTop: "0.25rem" }}>{downloadError}</div>
              ) : null}
            </div>

            {/* Link to custom mode */}
            <div className="export-builder__quick-footer">
              <button
                type="button"
                className="export-builder__quick-customize-link"
                onClick={() => setExportMode("custom")}
              >
                Personalizar campos →
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ── Custom mode: top bar + 3-panel ── */}
      {exportMode === "custom" && <>

      {/* Top bar: presets + Todos/Ninguno */}
      <div className="export-builder__topbar">
        <div className="export-builder__topbar-left">
          {presets.length > 0 ? (
            <div className="export-builder__topbar-presets">
              <span className="export-builder__preset-label">Preset:</span>
              {presets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={`export-builder__preset-pill${activePresetId === preset.id ? " active" : ""}`}
                  onClick={() => applyPreset(preset)}
                >
                  {preset.name}
                </button>
              ))}
            </div>
          ) : (
            <span className="export-builder__preset-label">
              {loadingCatalog ? "Cargando…" : "Sin presets guardados"}
            </span>
          )}
        </div>

        <div className="export-builder__topbar-right">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setActivePresetId(null);
              setSelectedFields(catalogFields.map((f) => f.key));
            }}
            disabled={!cycleId || loadingCatalog}
          >
            Todos
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setActivePresetId(null);
              setSelectedFields([]);
            }}
            disabled={!cycleId || loadingCatalog}
          >
            Ninguno
          </button>
        </div>
      </div>

      {/* ── 3-panel grid ── */}
      <div className="export-builder__panels">

        {/* Panel 1: Field catalog */}
        <div className="export-builder__catalog-panel">
          <div className="export-builder__panel-header">
            <span className="export-builder__panel-title">① Elige campos</span>
          </div>

          <div className="export-builder__catalog-search">
            <input
              type="text"
              className="search-input"
              placeholder="Buscar campo…"
              value={catalogSearch}
              onChange={(e) => setCatalogSearch(e.target.value)}
              disabled={!cycleId}
              aria-label="Buscar campo"
            />
          </div>

          <div className="export-builder__catalog-scroll">
            {!cycleId ? (
              <p className="muted-text">Selecciona un proceso para habilitar la exportación.</p>
            ) : loadingCatalog ? (
              <p className="muted-text">Cargando catálogo…</p>
            ) : catalogError ? (
              <div className="error-callout" role="alert">{catalogError}</div>
            ) : filteredGroupedFields.length === 0 ? (
              <p className="muted-text">No hay campos que coincidan con la búsqueda.</p>
            ) : (
              filteredGroupedFields.map((group) => {
                const selectedInGroup = group.fields.filter(
                  (f) => selectedFields.includes(f.key),
                ).length;

                return (
                  <div key={group.key} className="export-builder__group">
                    <div className="export-builder__group-header">
                      <span className="export-builder__group-label">{group.label}</span>
                      <span
                        className={`export-builder__group-count${selectedInGroup > 0 ? " has-selected" : ""}`}
                      >
                        {selectedInGroup > 0
                          ? `${selectedInGroup} de ${group.fields.length}`
                          : group.fields.length}
                      </span>
                    </div>
                    <div className="export-builder__columns">
                      {group.fields.map((field) => (
                        <label key={field.key} className="export-builder__col-label">
                          <input
                            type="checkbox"
                            checked={selectedFields.includes(field.key)}
                            onChange={() => toggleField(field.key)}
                          />
                          <span className="export-builder__col-label-text">{field.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="export-builder__panel-divider" />

        {/* Panel 2: Selected fields (reorder) */}
        <div className="export-builder__selected-panel">
          <div className="export-builder__panel-header">
            <span className="export-builder__panel-title">② Ordena</span>
            <button
              className="btn btn-outline btn-xs"
              onClick={() => void handleSavePreset()}
              disabled={isSavingPreset || selectedFields.length === 0 || !cycleId}
            >
              {isSavingPreset ? "Guardando…" : "Guardar preset"}
            </button>
          </div>

          <div className="export-builder__selected-count">
            {selectedFields.length === 0
              ? "Ningún campo seleccionado"
              : `${selectedFields.length} campo${selectedFields.length !== 1 ? "s" : ""} · usa las flechas para reordenar`}
          </div>

          <div className="export-builder__selected-scroll">
            {selectedFields.length === 0 ? (
              <p className="muted-text">Selecciona campos en el catálogo de la izquierda.</p>
            ) : (
              selectedFields.map((fieldKey, index) => {
                const field = fieldLabelMap.get(fieldKey);
                return (
                  <div key={fieldKey} className="export-builder__field-item">
                    <span className="export-builder__field-drag" aria-hidden="true">⠿</span>
                    <div className="export-builder__field-info">
                      <div className="export-builder__field-label">{field?.label ?? fieldKey}</div>
                      <div className="export-builder__field-group">
                        {field?.groupLabel ?? "Campo"}
                      </div>
                    </div>
                    <div className="export-builder__field-actions">
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs"
                        onClick={() => moveField(fieldKey, "up")}
                        disabled={index === 0}
                        aria-label={`Mover ${field?.label ?? fieldKey} arriba`}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs"
                        onClick={() => moveField(fieldKey, "down")}
                        disabled={index === selectedFields.length - 1}
                        aria-label={`Mover ${field?.label ?? fieldKey} abajo`}
                      >
                        ↓
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="export-builder__panel-divider" />

        {/* Panel 3: Filters + Download */}
        <div className="export-builder__controls-panel">
          <div className="export-builder__panel-header">
            <span className="export-builder__panel-title">③ Filtros y descarga</span>
          </div>

          <div className="export-builder__controls-scroll">

            {/* Applicant search filters */}
            <div className="export-builder__controls-section">
              <div className="export-builder__controls-section-title">Buscar postulantes</div>
              <input
                type="text"
                className="search-input"
                placeholder="Nombre o email"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <select
                className="filter-select"
                value={stageFilter}
                onChange={(e) => setStageFilter(e.target.value)}
              >
                <option value="all">Todas las etapas</option>
                <option value="documents">1. Formulario Principal</option>
                <option value="exam_placeholder">2. Examen Académico</option>
              </select>
              <select
                className="filter-select"
                value={statusFilter}
                onChange={(e) => {
                  const value = e.target.value;
                  setStatusFilter(value);
                  if (value !== "all") setEligibilityFilter("all");
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
                onChange={(e) => {
                  const value = e.target.value as EligibilityFilter;
                  setEligibilityFilter(value);
                  if (value !== "all") setStatusFilter("all");
                }}
              >
                <option value="all">Todas las elegibilidades</option>
                <option value="eligible">Solo elegibles</option>
                <option value="ineligible">Solo no elegibles</option>
                <option value="pending">Pendientes</option>
                <option value="advanced">Avanzados</option>
              </select>
            </div>

            {/* Target mode */}
            <div className="export-builder__controls-section">
              <div className="export-builder__controls-section-title">Quiénes exportar</div>
              <div className="export-builder__radio-group">
                <label className="export-builder__radio-option">
                  <input
                    type="radio"
                    name="target-mode"
                    checked={targetMode === "filtered"}
                    onChange={() => setTargetMode("filtered")}
                  />
                  <span>Todos los postulantes filtrados</span>
                </label>
                <label className="export-builder__radio-option">
                  <input
                    type="radio"
                    name="target-mode"
                    checked={targetMode === "manual"}
                    onChange={() => setTargetMode("manual")}
                  />
                  <span>Selección manual</span>
                </label>
                <label className="export-builder__radio-option">
                  <input
                    type="radio"
                    name="target-mode"
                    checked={targetMode === "randomSample"}
                    onChange={() => setTargetMode("randomSample")}
                  />
                  <span>Muestra aleatoria por grupos</span>
                </label>
              </div>

              {targetMode === "manual" ? (
                <div style={{ display: "grid", gap: "0.6rem", marginTop: "0.2rem" }}>
                  <label style={{ display: "grid", gap: "0.3rem" }}>
                    <span className="field-label">Cantidad de grupos</span>
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={manualGroupCount}
                      onChange={(e) => setManualGroupCount(Math.max(1, Number(e.target.value) || 1))}
                      className="search-input"
                    />
                  </label>
                  <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                    {selectedCount} postulante(s) seleccionados
                  </div>
                  {manualCandidatesLoading ? (
                    <p className="muted-text">Cargando postulantes…</p>
                  ) : manualCandidatesError ? (
                    <div className="error-callout" role="alert">{manualCandidatesError}</div>
                  ) : (
                    <div className="export-builder__candidate-list">
                      {manualCandidates.length === 0 ? (
                        <div style={{ padding: "0.75rem" }} className="muted-text">
                          No hay postulantes con esos filtros.
                        </div>
                      ) : (
                        manualCandidates.map((candidate) => {
                          const isSelected = selectedApplicationIds.includes(candidate.id);
                          return (
                            <div
                              key={candidate.id}
                              className="export-builder__candidate-row"
                              style={{
                                gridTemplateColumns:
                                  manualGroupCount > 1 ? "auto 1fr 110px" : "auto 1fr",
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleManualApplicant(candidate.id)}
                              />
                              <div>
                                <div className="export-builder__candidate-name">
                                  {candidate.candidateName}
                                </div>
                                <div className="export-builder__candidate-meta">
                                  {candidate.candidateEmail} · {candidate.stageCode} ·{" "}
                                  {candidate.status}
                                </div>
                              </div>
                              {manualGroupCount > 1 ? (
                                <select
                                  className="filter-select"
                                  value={groupAssignments[candidate.id] ?? "1"}
                                  onChange={(e) => setApplicantGroup(candidate.id, e.target.value)}
                                  disabled={!isSelected}
                                >
                                  {Array.from({ length: manualGroupCount }, (_, i) => (
                                    <option key={i + 1} value={String(i + 1)}>
                                      Grupo {i + 1}
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
                <div className="export-builder__random-grid" style={{ marginTop: "0.2rem" }}>
                  <label style={{ display: "grid", gap: "0.3rem" }}>
                    <span className="field-label">Nº de grupos</span>
                    <input
                      type="number"
                      min={1}
                      max={25}
                      value={randomGroupCount}
                      onChange={(e) =>
                        setRandomGroupCount(Math.max(1, Number(e.target.value) || 1))
                      }
                      className="search-input"
                    />
                  </label>
                  <label style={{ display: "grid", gap: "0.3rem" }}>
                    <span className="field-label">Por grupo</span>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={randomApplicantsPerGroup}
                      onChange={(e) =>
                        setRandomApplicantsPerGroup(Math.max(1, Number(e.target.value) || 1))
                      }
                      className="search-input"
                    />
                  </label>
                </div>
              ) : null}
            </div>

            {/* File format */}
            <div className="export-builder__controls-section">
              <div className="export-builder__controls-section-title">Formato de archivo</div>
              <div className="export-builder__format-row">
                <label className="export-builder__radio-option">
                  <input
                    type="radio"
                    name="export-format"
                    value="xlsx"
                    checked={format === "xlsx"}
                    onChange={() => setFormat("xlsx")}
                  />
                  <span>Excel (.xlsx)</span>
                </label>
                <label className="export-builder__radio-option">
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

              {exportModeUsesGrouping ? (
                <div className="export-builder__radio-group" style={{ marginTop: "0.35rem" }}>
                  <label className="export-builder__radio-option">
                    <input
                      type="radio"
                      name="grouped-export-mode"
                      checked={groupedExportMode === "single-sheet"}
                      onChange={() => setGroupedExportMode("single-sheet")}
                    />
                    <span>Una sola hoja con todos los grupos</span>
                  </label>
                  <label className="export-builder__radio-option">
                    <input
                      type="radio"
                      name="grouped-export-mode"
                      checked={groupedExportMode === "multi-sheet"}
                      onChange={() => setGroupedExportMode("multi-sheet")}
                      disabled={format !== "xlsx"}
                    />
                    <span>Una hoja por grupo (.xlsx)</span>
                  </label>
                  <label className="export-builder__radio-option">
                    <input
                      type="radio"
                      name="grouped-export-mode"
                      checked={groupedExportMode === "separate-files"}
                      onChange={() => setGroupedExportMode("separate-files")}
                    />
                    <span>Un archivo por grupo (ZIP)</span>
                  </label>
                </div>
              ) : null}

              {downloadError ? (
                <div className="error-callout" role="alert">{downloadError}</div>
              ) : null}
            </div>

          </div>

          {/* Footer: action buttons */}
          <div className="export-builder__controls-footer">
            <button
              className="btn btn-secondary"
              onClick={() => void handlePreview()}
              disabled={isPreviewing || selectedFields.length === 0}
            >
              {isPreviewing ? "Cargando…" : "Vista previa"}
            </button>
            <button
              className="btn btn-primary"
              onClick={() => void handleDownload()}
              disabled={isDownloading || selectedFields.length === 0}
            >
              {isDownloading ? "Descargando…" : `Descargar ${format.toUpperCase()}`}
            </button>
          </div>
        </div>

      </div>

      </> /* end exportMode === "custom" */}

      {/* ── Preview table ── */}
      {(previewData ?? previewError) ? (
        <div className="export-builder__preview">
          <div className="export-builder__preview-header">
            <h4>Vista previa</h4>
            {previewMeta ? (
              <div className="export-builder__preview-meta">
                {`${previewMeta.exportedApplicants} exportados · ${previewMeta.totalFiltered} filtrados · ${previewMeta.sheetCount} hoja(s)`}
              </div>
            ) : null}
          </div>
          {previewError ? (
            <div className="error-callout" role="alert">{previewError}</div>
          ) : null}
          {previewData ? (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Campo</th>
                    {previewData.applicantHeaders.map((header) => {
                      // Strip "(email)" suffix for display — email visible on hover via title
                      const nameOnly = header.replace(/\s*\([^)]*\)$/, "").trim();
                      return <th key={header} title={header}>{nameOnly || header}</th>;
                    })}
                  </tr>
                </thead>
                <tbody>
                  {previewData.rows.map((row) => (
                    <tr key={row.label}>
                      <td>{row.label}</td>
                      {row.values.map((value, index) => (
                        <td
                          key={`${row.label}-${previewData.applicantHeaders[index] ?? index}`}
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
