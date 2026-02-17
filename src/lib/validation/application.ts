import { z } from "zod";

export const applicationSchema = z.object({
  fullName: z.string().min(2, "El nombre completo es obligatorio."),
  dateOfBirth: z
    .string()
    .min(1, "La fecha de nacimiento es obligatoria.")
    .refine((value) => !Number.isNaN(Date.parse(value)), "Fecha inválida."),
  nationality: z.string().min(2, "La nacionalidad es obligatoria."),
  schoolName: z.string().min(2, "El colegio es obligatorio."),
  gradeAverage: z
    .number()
    .min(0)
    .max(20),
  essay: z.string().min(50, "La respuesta debe tener al menos 50 caracteres."),
});

export type ApplicationInput = z.infer<typeof applicationSchema>;
