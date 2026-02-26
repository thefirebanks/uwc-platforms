import { describe, expect, it } from "vitest";
import {
  getSubGroupsForSection,
  isBooleanField,
} from "@/lib/stages/field-sub-groups";
import type { ApplicantFormSectionId } from "@/lib/stages/applicant-sections";

describe("getSubGroupsForSection", () => {
  it("returns eligibility sub-groups with expected keys", () => {
    const groups = getSubGroupsForSection("eligibility");
    expect(groups.length).toBe(2);
    expect(groups.map((g) => g.key)).toEqual(["academic-req", "prior-participation"]);
  });

  it("returns identity sub-groups with card variants", () => {
    const groups = getSubGroupsForSection("identity");
    expect(groups.length).toBe(4);
    expect(groups.map((g) => g.key)).toEqual([
      "name-identity",
      "address",
      "contact",
      "accessibility",
    ]);
    for (const g of groups) {
      expect(g.variant).toBe("card");
    }
  });

  it("returns family sub-groups with guardian variant and numbers", () => {
    const groups = getSubGroupsForSection("family");
    expect(groups.length).toBe(2);
    expect(groups[0].variant).toBe("guardian");
    expect(groups[0].guardianNumber).toBe(1);
    expect(groups[1].variant).toBe("guardian");
    expect(groups[1].guardianNumber).toBe(2);
  });

  it("returns school sub-groups with school-info card", () => {
    const groups = getSubGroupsForSection("school");
    expect(groups.length).toBe(1);
    expect(groups[0].key).toBe("school-info");
    expect(groups[0].variant).toBe("card");
  });

  it("returns empty array for sections without sub-groups", () => {
    const noGroupSections: ApplicantFormSectionId[] = [
      "motivation",
      "recommenders",
      "documents",
      "other",
    ];
    for (const sectionId of noGroupSections) {
      expect(getSubGroupsForSection(sectionId)).toEqual([]);
    }
  });

  it("each sub-group has both es and en labels", () => {
    const allSections: ApplicantFormSectionId[] = [
      "eligibility",
      "identity",
      "family",
      "school",
    ];
    for (const sectionId of allSections) {
      for (const group of getSubGroupsForSection(sectionId)) {
        expect(group.label).toBeTruthy();
        expect(group.labelEn).toBeTruthy();
      }
    }
  });

  it("identity sub-groups have icon styling metadata", () => {
    const groups = getSubGroupsForSection("identity");
    for (const g of groups) {
      expect(g.iconBg).toBeTruthy();
      expect(g.iconColor).toBeTruthy();
    }
  });

  it("eligibility academic-req sub-group contains expected boolean fields", () => {
    const groups = getSubGroupsForSection("eligibility");
    const academicReq = groups.find((g) => g.key === "academic-req")!;
    expect(academicReq.fieldKeys.has("isUpperThird")).toBe(true);
    expect(academicReq.fieldKeys.has("hasMinimumAverage14")).toBe(true);
    expect(academicReq.fieldKeys.has("hasStudiedIb")).toBe(true);
  });

  it("family guardian1 sub-group contains expected field keys", () => {
    const groups = getSubGroupsForSection("family");
    const g1 = groups.find((g) => g.key === "guardian1")!;
    expect(g1.fieldKeys.has("guardian1FullName")).toBe(true);
    expect(g1.fieldKeys.has("guardian1Email")).toBe(true);
    expect(g1.fieldKeys.has("guardian1MobilePhone")).toBe(true);
    expect(g1.fieldKeys.has("guardian1HasLegalCustody")).toBe(true);
  });
});

describe("isBooleanField", () => {
  it("returns true for known boolean field keys", () => {
    const knownBooleanFields = [
      "isUpperThird",
      "hasMinimumAverage14",
      "hasStudiedIb",
      "priorUwcPeruSelectionParticipation",
      "otherCountrySelection2025",
      "guardian1HasLegalCustody",
      "guardian2HasLegalCustody",
      "hasDisability",
      "hasLearningDisability",
      "receivedSchoolScholarship",
      "receivedFinancialAidForFee",
    ];
    for (const key of knownBooleanFields) {
      expect(isBooleanField(key)).toBe(true);
    }
  });

  it("returns false for non-boolean field keys", () => {
    const nonBooleanFields = [
      "fullName",
      "dateOfBirth",
      "schoolName",
      "guardian1FullName",
      "essay",
      "officialGrade_primero_matematica",
      "",
    ];
    for (const key of nonBooleanFields) {
      expect(isBooleanField(key)).toBe(false);
    }
  });
});
