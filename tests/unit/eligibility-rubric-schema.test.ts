import { describe, expect, it } from "vitest";
import { validateEligibilityRubricConfig } from "@/lib/rubric/eligibility-rubric";

describe("validateEligibilityRubricConfig", () => {
  it("rejects enabled rubric without criteria", () => {
    const result = validateEligibilityRubricConfig({ enabled: true, criteria: [] });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.join("\n")).toContain("Enabled rubrics must include at least one criterion");
    }
  });

  it("rejects duplicate criterion ids", () => {
    const result = validateEligibilityRubricConfig({
      enabled: true,
      criteria: [
        {
          id: "same",
          label: "A",
          kind: "field_present",
          fieldKey: "dob",
          onFail: "not_eligible",
          onMissingData: "needs_review",
        },
        {
          id: "same",
          label: "B",
          kind: "field_present",
          fieldKey: "nationality",
          onFail: "not_eligible",
          onMissingData: "needs_review",
        },
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.join("\n")).toContain("Duplicate criterion id \"same\"");
    }
  });

  it("rejects number_between where min is greater than max", () => {
    const result = validateEligibilityRubricConfig({
      enabled: true,
      criteria: [
        {
          id: "grades",
          label: "Grades",
          kind: "number_between",
          fieldKey: "gradeAverage",
          min: 18,
          max: 12,
          onFail: "not_eligible",
          onMissingData: "needs_review",
        },
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.join("\n")).toContain("number_between criterion requires min <= max");
    }
  });

  it("rejects duplicate allowedValues with case-insensitive field_in", () => {
    const result = validateEligibilityRubricConfig({
      enabled: true,
      criteria: [
        {
          id: "nat",
          label: "Nationality",
          kind: "field_in",
          fieldKey: "nationality",
          allowedValues: ["Peru", "peru"],
          caseSensitive: false,
          onFail: "not_eligible",
          onMissingData: "needs_review",
        },
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.join("\n")).toContain("Duplicate allowed value");
    }
  });

  it("accepts valid rubric and keeps defaults", () => {
    const result = validateEligibilityRubricConfig({
      enabled: true,
      criteria: [
        {
          id: "c1",
          label: "DOB present",
          kind: "field_present",
          fieldKey: "dob",
        },
      ],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.criteria[0]).toMatchObject({
        onFail: "not_eligible",
        onMissingData: "needs_review",
      });
    }
  });
});
