import { describe, expect, it } from "vitest";
import {
  canTransition,
  canTransitionWithRules,
  deriveTransitionRules,
  type TransitionRule,
} from "@/lib/stages/transition";

/* -------------------------------------------------------------------------- */
/*  deriveTransitionRules                                                     */
/* -------------------------------------------------------------------------- */

describe("deriveTransitionRules", () => {
  it("returns empty array when fewer than 2 templates", () => {
    const rules = deriveTransitionRules([{ stage_code: "documents", sort_order: 1 }]);
    expect(rules).toHaveLength(0);
  });

  it("returns empty array for empty input", () => {
    expect(deriveTransitionRules([])).toHaveLength(0);
  });

  it("generates forward + rollback rules for 2 consecutive stages", () => {
    const templates = [
      { stage_code: "documents" as const, sort_order: 1 },
      { stage_code: "exam_placeholder" as const, sort_order: 2 },
    ];

    const rules = deriveTransitionRules(templates);

    expect(rules).toHaveLength(2);

    // Forward: documents → exam_placeholder requires eligible/advanced
    expect(rules[0]).toMatchObject({
      fromStage: "documents",
      toStage: "exam_placeholder",
      requiredStatuses: ["eligible", "advanced"],
    });

    // Rollback: exam_placeholder → documents always allowed
    expect(rules[1]).toMatchObject({
      fromStage: "exam_placeholder",
      toStage: "documents",
      requiredStatuses: [],
    });
  });

  it("generates pairwise rules for 3 consecutive stages", () => {
    const templates = [
      { stage_code: "documents" as const, sort_order: 1 },
      { stage_code: "exam_placeholder" as const, sort_order: 2 },
      { stage_code: "interview" as const, sort_order: 3 },
    ];

    const rules = deriveTransitionRules(templates);

    // 2 pairs × 2 rules each = 4 rules
    expect(rules).toHaveLength(4);

    // documents → exam_placeholder
    expect(rules[0]).toMatchObject({
      fromStage: "documents",
      toStage: "exam_placeholder",
    });
    // exam_placeholder → documents (rollback)
    expect(rules[1]).toMatchObject({
      fromStage: "exam_placeholder",
      toStage: "documents",
    });
    // exam_placeholder → interview
    expect(rules[2]).toMatchObject({
      fromStage: "exam_placeholder",
      toStage: "interview",
    });
    // interview → exam_placeholder (rollback)
    expect(rules[3]).toMatchObject({
      fromStage: "interview",
      toStage: "exam_placeholder",
    });
  });

  it("sorts by sort_order regardless of input order", () => {
    const templates = [
      { stage_code: "exam_placeholder" as const, sort_order: 2 },
      { stage_code: "documents" as const, sort_order: 1 },
    ];

    const rules = deriveTransitionRules(templates);

    expect(rules[0]).toMatchObject({
      fromStage: "documents",
      toStage: "exam_placeholder",
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  canTransitionWithRules                                                    */
/* -------------------------------------------------------------------------- */

describe("canTransitionWithRules", () => {
  const rules: TransitionRule[] = [
    {
      fromStage: "documents",
      toStage: "exam_placeholder",
      requiredStatuses: ["eligible", "advanced"],
    },
    {
      fromStage: "exam_placeholder",
      toStage: "documents",
      requiredStatuses: [], // rollback: always allowed
    },
  ];

  it("allows forward transition with eligible status", () => {
    expect(
      canTransitionWithRules({
        fromStage: "documents",
        toStage: "exam_placeholder",
        status: "eligible",
        rules,
      }),
    ).toBe(true);
  });

  it("allows forward transition with advanced status", () => {
    expect(
      canTransitionWithRules({
        fromStage: "documents",
        toStage: "exam_placeholder",
        status: "advanced",
        rules,
      }),
    ).toBe(true);
  });

  it("blocks forward transition with draft status", () => {
    expect(
      canTransitionWithRules({
        fromStage: "documents",
        toStage: "exam_placeholder",
        status: "draft",
        rules,
      }),
    ).toBe(false);
  });

  it("blocks forward transition with submitted status", () => {
    expect(
      canTransitionWithRules({
        fromStage: "documents",
        toStage: "exam_placeholder",
        status: "submitted",
        rules,
      }),
    ).toBe(false);
  });

  it("allows rollback regardless of status", () => {
    expect(
      canTransitionWithRules({
        fromStage: "exam_placeholder",
        toStage: "documents",
        status: "draft",
        rules,
      }),
    ).toBe(true);
  });

  it("falls back to legacy canTransition when no rule matches", () => {
    // No rule exists for this pair, but legacy hardcoded check covers it
    expect(
      canTransitionWithRules({
        fromStage: "documents",
        toStage: "exam_placeholder",
        status: "eligible",
        rules: [], // empty rules → fallback
      }),
    ).toBe(true);
  });

  it("fallback denies invalid transitions too", () => {
    expect(
      canTransitionWithRules({
        fromStage: "documents",
        toStage: "exam_placeholder",
        status: "draft",
        rules: [], // empty rules → fallback
      }),
    ).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/*  canTransition (legacy)                                                    */
/* -------------------------------------------------------------------------- */

describe("canTransition (legacy)", () => {
  it("allows documents → exam_placeholder for eligible", () => {
    expect(
      canTransition({ fromStage: "documents", toStage: "exam_placeholder", status: "eligible" }),
    ).toBe(true);
  });

  it("allows documents → exam_placeholder for advanced", () => {
    expect(
      canTransition({ fromStage: "documents", toStage: "exam_placeholder", status: "advanced" }),
    ).toBe(true);
  });

  it("denies documents → exam_placeholder for draft", () => {
    expect(
      canTransition({ fromStage: "documents", toStage: "exam_placeholder", status: "draft" }),
    ).toBe(false);
  });

  it("allows exam_placeholder → documents for any status", () => {
    expect(
      canTransition({ fromStage: "exam_placeholder", toStage: "documents", status: "draft" }),
    ).toBe(true);
  });

  it("denies unknown transition pairs", () => {
    expect(
      canTransition({
        fromStage: "documents" as const,
        toStage: "interview" as const,
        status: "eligible",
      }),
    ).toBe(false);
  });
});
