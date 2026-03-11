"use client";

import type { CycleStageField, StageAutomationTemplate } from "@/types/domain";

interface StageStatsPanelProps {
  fields: CycleStageField[];
  automations: StageAutomationTemplate[];
}

/**
 * Read-only stats dashboard for a stage configuration.
 * Shows field counts, automation counts, and a configuration funnel.
 */
export function StageStatsPanel({ fields, automations }: StageStatsPanelProps) {
  const totalFields = fields.length;
  const requiredFields = fields.filter((field) => field.is_required).length;
  const activeFields = fields.filter((field) => field.is_active).length;
  const activeAutomations = automations.filter(
    (automation) => automation.is_enabled,
  ).length;

  function pct(numerator: number, denominator: number) {
    return denominator === 0
      ? "0%"
      : `${Math.round((numerator / denominator) * 100)}%`;
  }

  return (
    <div id="tab-stats" className="tab-content active">
      <div className="dashboard-grid admin-stage-stats-grid">
        <div className="stat-card">
          <div className="stat-title">Campos totales</div>
          <div className="stat-value">{totalFields}</div>
          <div className="stat-trend neutral">Definidos para esta etapa</div>
        </div>
        <div className="stat-card">
          <div className="stat-title">Campos obligatorios</div>
          <div className="stat-value">{requiredFields}</div>
          <div className="stat-trend">Afectan validación</div>
        </div>
        <div className="stat-card">
          <div className="stat-title">Automatizaciones activas</div>
          <div className="stat-value">{activeAutomations}</div>
          <div className="stat-trend neutral">Correos habilitados</div>
        </div>
      </div>

      <div className="section-title">Embudo de configuración</div>
      <div className="funnel-container">
        <div className="funnel-bar">
          <div className="funnel-label">Campos definidos</div>
          <div className="funnel-track">
            <div className="funnel-fill" style={{ width: "100%" }}></div>
          </div>
          <div className="funnel-value">{totalFields}</div>
        </div>
        <div className="funnel-bar">
          <div className="funnel-label">Campos activos</div>
          <div className="funnel-track">
            <div
              className="funnel-fill blue"
              style={{ width: pct(activeFields, totalFields) }}
            ></div>
          </div>
          <div className="funnel-value">{activeFields}</div>
        </div>
        <div className="funnel-bar">
          <div className="funnel-label">Campos obligatorios</div>
          <div className="funnel-track">
            <div
              className="funnel-fill success"
              style={{ width: pct(requiredFields, totalFields) }}
            ></div>
          </div>
          <div className="funnel-value">{requiredFields}</div>
        </div>
      </div>
    </div>
  );
}
