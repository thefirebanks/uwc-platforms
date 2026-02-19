import { describe, expect, it } from "vitest";
import { validateRecommendationPayload } from "@/lib/server/recommendations-service";

describe("validateRecommendationPayload", () => {
  const basePayload = {
    recommenderName: "Mariela Quispe",
    relationshipTitle: "Tutora de literatura",
    knownDuration: "2 años",
    strengths:
      "Es una estudiante disciplinada, curiosa y constante. Participa activamente y ayuda al grupo.",
    growthAreas:
      "Puede mejorar su manejo del tiempo en semanas de alta carga académica, aunque responde bien a feedback.",
    endorsement:
      "La recomiendo para el proceso por su compromiso, madurez y potencial para aportar a una comunidad diversa.",
    confirmsNoFamily: false,
  };

  it("requires non-family confirmation for friend recommender role", () => {
    const result = validateRecommendationPayload({
      role: "friend",
      payload: basePayload,
    });

    expect(result.isValid).toBe(false);
    expect(result.errors.confirmsNoFamily).toContain("no tienes relación familiar");
  });

  it("accepts mentor payload without non-family confirmation", () => {
    const result = validateRecommendationPayload({
      role: "mentor",
      payload: basePayload,
    });

    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual({});
  });

  it("rejects short narrative answers", () => {
    const result = validateRecommendationPayload({
      role: "mentor",
      payload: {
        ...basePayload,
        strengths: "Buena",
      },
    });

    expect(result.isValid).toBe(false);
    expect(result.errors.strengths).toBeTruthy();
  });
});

