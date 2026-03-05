import Link from "next/link";
import { groupFieldsBySections } from "@/lib/stages/applicant-sections";
import { getSubGroupsForSection } from "@/lib/stages/field-sub-groups";
import type { CycleStageField, StageCode, StageSection } from "@/types/domain";

function getDisplayStageLabel(stageCode: StageCode, stageLabel: string) {
  const normalizedLabel = stageLabel.trim();

  if (stageCode === "documents") {
    return normalizedLabel || "Formulario Principal";
  }

  if (stageCode === "exam_placeholder") {
    return normalizedLabel || "Examen Acad\u00e9mico";
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
        <div className="upload-text">Subir archivo (previsualizaci\u00f3n)</div>
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
  sections = [],
}: {
  cycleId: string;
  stageId: string;
  cycleName: string;
  stageCode: StageCode;
  stageLabel: string;
  fields: CycleStageField[];
  sections?: StageSection[];
}) {
  const resolvedSections = groupFieldsBySections(fields, sections, {
    includeInactive: false,
    includeFileFields: true,
  });

  const displayStageLabel = getDisplayStageLabel(stageCode, stageLabel);

  return (
    <main className="main full-width">
      <div className="canvas-header">
        <div className="canvas-title-row">
          <div>
            <div className="stage-status">Previsualizaci\u00f3n</div>
            <h1>{displayStageLabel}</h1>
            <p>
              Vista previa de solo lectura usando la misma agrupaci\u00f3n de secciones del formulario del postulante.
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
            <p>Los controles est\u00e1n deshabilitados porque esta vista no guarda respuestas.</p>
          </div>
        </section>

        {resolvedSections.length === 0 ? (
          <section className="settings-card">
            <div className="settings-card-header">
              <h3>Sin campos activos</h3>
              <p>Activa o agrega campos en el editor para previsualizarlos aqu\u00ed.</p>
            </div>
          </section>
        ) : (
          resolvedSections.map((section, index) => (
            <section key={section.id} className="settings-card">
              <div className="settings-card-header">
                <h3>{`Secci\u00f3n ${index + 1}: ${section.title}`}</h3>
                {(() => {
                  const sectionEmojis = Array.from(
                    new Set(
                      getSubGroupsForSection(section.sectionKey)
                        .map((group) => group.icon)
                        .filter((icon): icon is string => typeof icon === "string" && icon.trim().length > 0),
                    ),
                  );

                  if (sectionEmojis.length === 0) {
                    return null;
                  }

                  return (
                    <div className="admin-stage-preview-section-emojis" aria-label="Iconos visibles en la vista de postulante">
                      {sectionEmojis.map((emoji) => (
                        <span
                          key={`${section.id}-${emoji}`}
                          className="admin-stage-preview-section-emoji"
                          aria-hidden="true"
                        >
                          {emoji}
                        </span>
                      ))}
                    </div>
                  );
                })()}
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
