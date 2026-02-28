import { describe, expect, it } from "vitest";
import {
  groupFieldsBySections,
} from "@/lib/stages/applicant-sections";
import type { CycleStageField, StageSection } from "@/types/domain";

function makeField(
  fieldKey: string,
  sectionId: string | null = null,
): CycleStageField {
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
    section_id: sectionId,
    created_at: "2026-01-01T00:00:00.000Z",
  };
}

function makeSection(
  overrides: Partial<StageSection> & { id: string; section_key: string },
): StageSection {
  return {
    cycle_id: "cycle-1",
    stage_code: "documents",
    title: overrides.section_key,
    description: "",
    sort_order: 0,
    is_visible: true,
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("groupFieldsBySections", () => {
  const identitySection = makeSection({
    id: "sec-identity",
    section_key: "identity",
    title: "Identidad",
    sort_order: 1,
  });
  const familySection = makeSection({
    id: "sec-family",
    section_key: "family",
    title: "Familia",
    sort_order: 2,
  });
  const otherSection = makeSection({
    id: "sec-other",
    section_key: "other",
    title: "Otros",
    sort_order: 99,
  });

  it("groups fields by their section_id", () => {
    const fields = [
      makeField("fullName", "sec-identity"),
      makeField("guardian1FullName", "sec-family"),
    ];
    const sections = [identitySection, familySection, otherSection];

    const result = groupFieldsBySections(fields, sections);
    expect(result.map((s) => s.sectionKey)).toEqual(["identity", "family"]);
    expect(result[0].fields.map((f) => f.field_key)).toEqual(["fullName"]);
    expect(result[1].fields.map((f) => f.field_key)).toEqual([
      "guardian1FullName",
    ]);
  });

  it("places fields with null section_id into 'other'", () => {
    const fields = [
      makeField("fullName", "sec-identity"),
      makeField("customField", null),
    ];
    const sections = [identitySection, otherSection];

    const result = groupFieldsBySections(fields, sections);
    expect(result.map((s) => s.sectionKey)).toEqual(["identity", "other"]);
    expect(result[1].fields.map((f) => f.field_key)).toEqual(["customField"]);
  });

  it("moves fields from hidden sections into 'other'", () => {
    const hiddenSection = makeSection({
      id: "sec-hidden",
      section_key: "hidden-stuff",
      title: "Hidden",
      sort_order: 3,
      is_visible: false,
    });
    const fields = [
      makeField("fullName", "sec-identity"),
      makeField("secretField", "sec-hidden"),
    ];
    const sections = [identitySection, hiddenSection, otherSection];

    const result = groupFieldsBySections(fields, sections);
    expect(result.map((s) => s.sectionKey)).toEqual(["identity", "other"]);
    expect(result[1].fields.map((f) => f.field_key)).toEqual(["secretField"]);
  });

  it("'other' section always appears last", () => {
    // Give 'other' a low sort_order to prove it still ends up last
    const earlyOther = makeSection({
      id: "sec-other",
      section_key: "other",
      title: "Otros",
      sort_order: 0,
    });
    const fields = [
      makeField("customField", null),
      makeField("fullName", "sec-identity"),
    ];
    const sections = [earlyOther, identitySection];

    const result = groupFieldsBySections(fields, sections);
    expect(result.map((s) => s.sectionKey)).toEqual(["identity", "other"]);
  });

  it("omits empty sections", () => {
    const fields = [makeField("fullName", "sec-identity")];
    const sections = [identitySection, familySection, otherSection];

    const result = groupFieldsBySections(fields, sections);
    expect(result.map((s) => s.sectionKey)).toEqual(["identity"]);
  });

  it("excludes inactive fields by default", () => {
    const inactiveField = {
      ...makeField("hidden", "sec-identity"),
      is_active: false,
    };
    const fields = [makeField("fullName", "sec-identity"), inactiveField];
    const sections = [identitySection, otherSection];

    const result = groupFieldsBySections(fields, sections);
    expect(result[0].fields).toHaveLength(1);
    expect(result[0].fields[0].field_key).toBe("fullName");
  });

  it("includes inactive fields when includeInactive is true", () => {
    const inactiveField = {
      ...makeField("hidden", "sec-identity"),
      is_active: false,
    };
    const fields = [makeField("fullName", "sec-identity"), inactiveField];
    const sections = [identitySection, otherSection];

    const result = groupFieldsBySections(fields, sections, {
      includeInactive: true,
    });
    expect(result[0].fields).toHaveLength(2);
  });

  it("excludes file fields by default", () => {
    const fileField: CycleStageField = {
      ...makeField("doc", "sec-identity"),
      field_type: "file",
    };
    const fields = [makeField("fullName", "sec-identity"), fileField];
    const sections = [identitySection, otherSection];

    const result = groupFieldsBySections(fields, sections);
    expect(result[0].fields).toHaveLength(1);
    expect(result[0].fields[0].field_key).toBe("fullName");
  });

  it("includes file fields when includeFileFields is true", () => {
    const fileField: CycleStageField = {
      ...makeField("doc", "sec-identity"),
      field_type: "file",
    };
    const fields = [makeField("fullName", "sec-identity"), fileField];
    const sections = [identitySection, otherSection];

    const result = groupFieldsBySections(fields, sections, {
      includeFileFields: true,
    });
    expect(result[0].fields).toHaveLength(2);
  });

  it("returns ResolvedSection with correct shape", () => {
    const fields = [makeField("fullName", "sec-identity")];
    const sections = [identitySection, otherSection];

    const result = groupFieldsBySections(fields, sections);
    expect(result[0]).toEqual({
      id: "sec-identity",
      sectionKey: "identity",
      title: "Identidad",
      description: "",
      fields: [expect.objectContaining({ field_key: "fullName" })],
    });
  });
});
