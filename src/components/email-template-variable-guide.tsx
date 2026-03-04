import { EMAIL_TEMPLATE_VARIABLES } from "@/lib/email-template-variables";

export function EmailTemplateVariableHintContent() {
  return (
    <div className="hint-rich-content">
      <div className="hint-rich-content__eyebrow">Variables disponibles</div>
      <ul className="hint-rich-content__list">
        {EMAIL_TEMPLATE_VARIABLES.map((variable) => (
          <li key={variable.token}>
            <code>{`{{${variable.token}}}`}</code>
            <span>{variable.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
