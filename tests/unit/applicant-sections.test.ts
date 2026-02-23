import { describe, expect, it } from "vitest";
import { classifyApplicantFieldKey, groupApplicantFormFields } from "@/lib/stages/applicant-sections";
import type { CycleStageField } from "@/types/domain";

function makeField(fieldKey: string): CycleStageField {
  return {
    id: `id-${fieldKey}`,
    cycle_id: "cycle-1",
    stage_code: "documents",
    field_key: fieldKey,
    field_label: fieldKey,
    field_type: "short_text",
    is_required: true,
    placeholder: null,
    help_text: null,
    sort_order: 1,
    is_active: true,
    created_at: "2026-01-01T00:00:00.000Z",
  };
}

describe("classifyApplicantFieldKey", () => {
  it("classifies known field families", () => {
    expect(classifyApplicantFieldKey("eligibilityBirthYear")).toBe("eligibility");
    expect(classifyApplicantFieldKey("fullName")).toBe("identity");
    expect(classifyApplicantFieldKey("guardian1FullName")).toBe("family");
    expect(classifyApplicantFieldKey("schoolDirectorName")).toBe("school");
    expect(classifyApplicantFieldKey("officialGrade_quinto_matematica")).toBe("school");
    expect(classifyApplicantFieldKey("whyShouldBeSelected")).toBe("motivation");
    expect(classifyApplicantFieldKey("mentorRecommenderName")).toBe("recommenders");
    expect(classifyApplicantFieldKey("paymentOperationNumber")).toBe("documents");
    expect(classifyApplicantFieldKey("customFutureField")).toBe("other");
  });
});

describe("groupApplicantFormFields", () => {
  it("returns ordered non-empty sections", () => {
    const sections = groupApplicantFormFields([
      makeField("guardian1FullName"),
      makeField("fullName"),
      makeField("officialGrade_quinto_matematica"),
      makeField("whyShouldBeSelected"),
      makeField("paymentOperationNumber"),
      makeField("customFutureField"),
    ]);

    expect(sections.map((section) => section.id)).toEqual([
      "identity",
      "family",
      "school",
      "motivation",
      "documents",
      "other",
    ]);
  });
});
