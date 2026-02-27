import Link from "next/link";
import { groupApplicantFormFieldsWithCustomSections } from "@/lib/stages/applicant-sections";
import type {
  BuiltinStageSectionId,
  PersistedCustomSection,
} from "@/lib/stages/stage-admin-config";
import type { CycleStageField, StageCode } from "@/types/domain";

function getDisplayStageLabel(stageCode: StageCode, stageLabel: string) {
  const normalizedLabel = stageLabel.trim();

  if (stageCode === "documents") {
    return normalizedLabel || "Formulario Principal";
  }

  if (stageCode === "exam_placeholder") {
    return normalizedLabel || "Examen Académico";
  }

  return normalizedLabel;
}

function renderPreviewControl(field: CycleStageField) {
  if (field.field_type === "long_text") {
    return (
      <textarea
        rows={3}
        disabled
        placeholder={field.placeholder ?? undefined}
        value=""
        readOnly
      />
    );
  }

  if (field.field_type === "file") {
    return (
      <div className="upload-zone" aria-disabled="true">
        <div className="upload-text">Subir archivo (previsualización)</div>
      </div>
    );
  }

  return (
    <input
      type={field.field_type === "email" ? "email" : field.field_type === "date" ? "date" : field.field_type === "number" ? "number" : "text"}
      disabled
      placeholder={field.placeholder ?? undefined}
      value=""
      readOnly
    />
  );
}

export function AdminStageFormPreview({
  cycleId,
  stageId,
  cycleName,
  stageCode,
  stageLabel,
  fields,
  customSections = [],
  builtinSectionOrder = [],
  hiddenBuiltinSectionIds = [],
  fieldSectionAssignments = {},
}: {
  cycleId: string;
  stageId: string;
  cycleName: string;
  stageCode: StageCode;
  stageLabel: string;
  fields: CycleStageField[];
  customSections?: PersistedCustomSection[];
  builtinSectionOrder?: BuiltinStageSectionId[];
  hiddenBuiltinSectionIds?: BuiltinStageSectionId[];
  fieldSectionAssignments?: Record<string, string>;
}) {
  const sections = groupApplicantFormFieldsWithCustomSections(fields, {
    includeInactive: false,
    includeFileFields: true,
    customSections,
    builtinSectionOrder,
    hiddenBuiltinSectionIds,
    fieldSectionAssignments,
    omitEligibility: stageCode === "documents",
  });

  const displayStageLabel = getDisplayStageLabel(stageCode, stageLabel);

  return (
    <main className="main full-width">
      <div className="canvas-header">
        <div className="canvas-title-row">
          <div>
            <div className="stage-status">Previsualización</div>
            <h1>{displayStageLabel}</h1>
            <p>
              Vista previa de solo lectura usando la misma agrupación de secciones del formulario del postulante.
            </p>
          </div>
          <div className="admin-stage-header-actions">
            <Link
              href={`/admin/process/${cycleId}/stage/${stageId}`}
              className="btn btn-outline"
            >
              Volver al editor
            </Link>
            <Link href="/admin/processes" className="btn btn-ghost">
              Procesos
            </Link>
          </div>
        </div>
      </div>

      <div className="canvas-body wide admin-page-stack">
        <section className="settings-card">
          <div className="settings-card-header">
            <h3>{cycleName}</h3>
            <p>Los controles están deshabilitados porque esta vista no guarda respuestas.</p>
          </div>
        </section>

        {sections.length === 0 ? (
          <section className="settings-card">
            <div className="settings-card-header">
              <h3>Sin campos activos</h3>
              <p>Activa o agrega campos en el editor para previsualizarlos aquí.</p>
            </div>
          </section>
        ) : (
          sections.map((section, index) => (
            <section key={section.id} className="settings-card">
              <div className="settings-card-header">
                <h3>{`Sección ${index + 1}: ${section.title}`}</h3>
                <p>{section.description}</p>
              </div>
              <div className="editor-grid">
                {section.fields.map((field) => (
                  <div
                    key={field.id}
                    className={`form-field ${field.field_type === "long_text" ? "full" : ""}`}
                  >
                    <label htmlFor={`preview-${field.id}`}>
                      {field.field_label}
                      {field.is_required ? " *" : ""}
                    </label>
                    <div id={`preview-${field.id}`}>{renderPreviewControl(field)}</div>
                    {field.help_text ? (
                      <small className="admin-text-muted">{field.help_text}</small>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </main>
  );
}
