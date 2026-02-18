import { describe, expect, it } from "vitest";
import {
  buildDefaultCycleStageFields,
  buildDefaultCycleStageTemplates,
  buildDefaultStageAutomationTemplates,
} from "@/lib/stages/templates";

describe("buildDefaultCycleStageTemplates", () => {
  it("creates 2 ordered default templates from cycle dates", () => {
    const templates = buildDefaultCycleStageTemplates({
      cycleId: "cycle-2027",
      stage1CloseAt: "2027-05-31T23:59:59.000Z",
      stage2CloseAt: "2027-12-31T23:59:59.000Z",
    });

    expect(templates).toHaveLength(2);
    expect(templates[0]).toMatchObject({
      cycle_id: "cycle-2027",
      stage_code: "documents",
      sort_order: 1,
      due_at: "2027-05-31T23:59:59.000Z",
    });
    expect(templates[1]).toMatchObject({
      cycle_id: "cycle-2027",
      stage_code: "exam_placeholder",
      sort_order: 2,
      due_at: "2027-12-31T23:59:59.000Z",
    });
  });

  it("creates default documents stage fields", () => {
    const fields = buildDefaultCycleStageFields({ cycleId: "cycle-2027" });

    expect(fields.length).toBeGreaterThanOrEqual(7);
    expect(fields[0]).toMatchObject({
      cycle_id: "cycle-2027",
      stage_code: "documents",
      field_key: "fullName",
    });
    expect(fields.some((field) => field.field_type === "file")).toBe(true);
  });

  it("creates default automation templates", () => {
    const automations = buildDefaultStageAutomationTemplates({ cycleId: "cycle-2027" });

    expect(automations).toHaveLength(2);
    expect(automations[0]).toMatchObject({
      cycle_id: "cycle-2027",
      trigger_event: "application_submitted",
      channel: "email",
    });
    expect(automations[1]).toMatchObject({
      trigger_event: "stage_result",
    });
  });
});
