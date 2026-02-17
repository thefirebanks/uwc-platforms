import { describe, expect, it } from "vitest";
import { canTransition } from "@/lib/stages/transition";

describe("canTransition", () => {
  it("allows documents -> exam placeholder when eligible", () => {
    expect(
      canTransition({
        fromStage: "documents",
        toStage: "exam_placeholder",
        status: "eligible",
      }),
    ).toBe(true);
  });

  it("blocks documents -> exam placeholder when draft", () => {
    expect(
      canTransition({
        fromStage: "documents",
        toStage: "exam_placeholder",
        status: "draft",
      }),
    ).toBe(false);
  });

  it("allows rolling back from stage 2 placeholder to stage 1", () => {
    expect(
      canTransition({
        fromStage: "exam_placeholder",
        toStage: "documents",
        status: "advanced",
      }),
    ).toBe(true);
  });
});
