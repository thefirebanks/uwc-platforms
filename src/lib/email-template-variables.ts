export type EmailTemplateVariable = {
  token: "full_name" | "cycle_name" | "application_id" | "application_status" | "stage_label";
  label: string;
  description: string;
};

export const EMAIL_TEMPLATE_VARIABLES: EmailTemplateVariable[] = [
  {
    token: "full_name",
    label: "Nombre del postulante",
    description: "Usa el nombre completo registrado. Si falta, cae al correo del postulante.",
  },
  {
    token: "cycle_name",
    label: "Nombre del proceso",
    description: "Inserta el nombre visible del ciclo o convocatoria activa.",
  },
  {
    token: "application_id",
    label: "Código de postulación",
    description: "Incluye el identificador interno de la postulación para soporte y seguimiento.",
  },
  {
    token: "application_status",
    label: "Estado actual",
    description: "Muestra el estado interno actual de la postulación.",
  },
  {
    token: "stage_label",
    label: "Etapa actual",
    description: "Usa la etiqueta visible de la etapa asociada al correo.",
  },
];
