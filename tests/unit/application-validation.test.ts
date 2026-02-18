import { describe, expect, it } from "vitest";
import { applicationSchema } from "@/lib/validation/application";

describe("applicationSchema", () => {
  it("accepts valid data", () => {
    const result = applicationSchema.safeParse({
      fullName: "Ana Perez",
      dateOfBirth: "2008-01-01",
      nationality: "Peruana",
      schoolName: "Colegio Nacional",
      gradeAverage: 16.5,
      essay: "Este es un ensayo suficientemente largo para validar la postulación inicial.",
    });

    expect(result.success).toBe(true);
  });

  it("rejects short essay", () => {
    const result = applicationSchema.safeParse({
      fullName: "Ana Perez",
      dateOfBirth: "2008-01-01",
      nationality: "Peruana",
      schoolName: "Colegio Nacional",
      gradeAverage: 16.5,
      essay: "Muy corto",
    });

    expect(result.success).toBe(false);
  });
});
