import { describe, expect, it } from "vitest";
import {
  buildRubricChecklistItems,
  classifyOcrOption,
} from "@/lib/rubric/wizard-review";

describe("wizard review helpers", () => {
  it("classifies technical OCR options deterministically", () => {
    expect(classifyOcrOption("confidence")).toBe("technical");
    expect(classifyOcrOption("summary")).toBe("technical");
    expect(classifyOcrOption("dni_raw_response")).toBe("technical");
    expect(classifyOcrOption("fecha_de_nacimiento")).toBe("business");
  });

  it("builds all-OK checklist when no blockers or technical OCR warnings exist", () => {
    const checklist = buildRubricChecklistItems({
      evidenceMissingCount: 0,
      ocrMissingCount: 0,
      policyMissingCount: 0,
      hasTechnicalOcrSelection: false,
    });

    expect(checklist.map((item) => item.status)).toEqual(["ok", "ok", "ok", "ok"]);
  });

  it("marks missing checklist states when required config is incomplete", () => {
    const checklist = buildRubricChecklistItems({
      evidenceMissingCount: 2,
      ocrMissingCount: 1,
      policyMissingCount: 0,
      hasTechnicalOcrSelection: false,
    });

    expect(checklist.find((item) => item.id === "evidence")?.status).toBe("missing");
    expect(checklist.find((item) => item.id === "ocr")?.status).toBe("missing");
    expect(checklist.find((item) => item.id === "result")?.status).toBe("missing");
  });

  it("marks OCR and result as review when technical OCR fields are selected", () => {
    const checklist = buildRubricChecklistItems({
      evidenceMissingCount: 0,
      ocrMissingCount: 0,
      policyMissingCount: 0,
      hasTechnicalOcrSelection: true,
    });

    expect(checklist.find((item) => item.id === "ocr")?.status).toBe("review");
    expect(checklist.find((item) => item.id === "result")?.status).toBe("review");
  });
});
