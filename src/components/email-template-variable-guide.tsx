"use client";

import { EMAIL_TEMPLATE_VARIABLES } from "@/lib/email-template-variables";

export function EmailTemplateVariableGuide({
  title = "Variables disponibles",
  compact = false,
}: {
  title?: string;
  compact?: boolean;
}) {
  return (
    <div className={`template-variable-guide${compact ? " template-variable-guide--compact" : ""}`}>
      <div className="template-variable-guide__header">
        <strong>{title}</strong>
        <span className="form-hint">Escribe las variables tal cual entre llaves dobles.</span>
      </div>
      <div className="template-variable-guide__list">
        {EMAIL_TEMPLATE_VARIABLES.map((variable) => (
          <div key={variable.token} className="template-variable-guide__item">
            <code>{`{{${variable.token}}}`}</code>
            <div>
              <div className="template-variable-guide__label">{variable.label}</div>
              <div className="form-hint">{variable.description}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
