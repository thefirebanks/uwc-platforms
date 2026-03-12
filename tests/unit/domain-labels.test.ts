import { describe, it, expect } from "vitest";
import {
  roleLabel,
  roleLabelShort,
  getApplicationStatusLabel,
  getRecommendationStatusLabel,
  getStageLabel,
} from "@/lib/utils/domain-labels";

describe("roleLabel", () => {
  it("returns Spanish mentor label by default", () => {
    expect(roleLabel("mentor")).toBe("Tutor/Profesor/Mentor");
  });

  it("returns English mentor label", () => {
    expect(roleLabel("mentor", "en")).toBe("Tutor/Teacher/Mentor");
  });

  it("returns Spanish friend label with clarification", () => {
    expect(roleLabel("friend")).toBe("Amigo (no familiar)");
  });

  it("returns English friend label", () => {
    expect(roleLabel("friend", "en")).toBe("Friend (non-family)");
  });
});

describe("roleLabelShort", () => {
  it("returns short mentor label", () => {
    expect(roleLabelShort("mentor")).toBe("Tutor/Profesor/Mentor");
  });

  it("returns short friend label", () => {
    expect(roleLabelShort("friend")).toBe("Amigo");
  });
});

describe("getApplicationStatusLabel", () => {
  it("maps known statuses", () => {
    expect(getApplicationStatusLabel("draft")).toBe("En progreso");
    expect(getApplicationStatusLabel("submitted")).toBe("Submitted");
    expect(getApplicationStatusLabel("eligible")).toBe("Completado");
    expect(getApplicationStatusLabel("ineligible")).toBe("No elegible");
    expect(getApplicationStatusLabel("advanced")).toBe("Completado");
  });

  it("returns unknown status as-is", () => {
    expect(getApplicationStatusLabel("custom_status")).toBe("custom_status");
  });
});

describe("getRecommendationStatusLabel", () => {
  it("maps known statuses", () => {
    expect(getRecommendationStatusLabel("submitted")).toBe("Formulario enviado");
    expect(getRecommendationStatusLabel("in_progress")).toBe("En progreso");
    expect(getRecommendationStatusLabel("opened")).toBe("Acceso verificado");
    expect(getRecommendationStatusLabel("sent")).toBe("Invitación enviada");
    expect(getRecommendationStatusLabel("expired")).toBe("Enlace vencido");
    expect(getRecommendationStatusLabel("invalidated")).toBe("Enlace reemplazado");
  });

  it("returns Pendiente for unknown status", () => {
    expect(getRecommendationStatusLabel("unknown")).toBe("Pendiente");
  });
});

describe("getStageLabel", () => {
  it("maps known stage codes", () => {
    expect(getStageLabel("documents")).toBe("1. Formulario Principal");
    expect(getStageLabel("exam_placeholder")).toBe("2. Examen Academico");
  });

  it("returns default for custom stages", () => {
    expect(getStageLabel("custom_stage")).toBe("Etapa personalizada");
  });
});
