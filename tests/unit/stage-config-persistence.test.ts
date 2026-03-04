import { describe, expect, it } from "vitest";
import { partitionConfigRowsById } from "@/lib/server/stage-config-persistence";

describe("partitionConfigRowsById", () => {
  it("keeps existing rows in updates and strips id from new rows", () => {
    const result = partitionConfigRowsById([
      { id: "field-1", field_key: "existingField", sort_order: 1 },
      { field_key: "newField", sort_order: 2 },
    ]);

    expect(result.updates).toEqual([
      { id: "field-1", field_key: "existingField", sort_order: 1 },
    ]);
    expect(result.inserts).toEqual([
      { field_key: "newField", sort_order: 2 },
    ]);
  });

  it("treats blank ids as inserts", () => {
    const result = partitionConfigRowsById([
      { id: "", field_key: "blankIdField", sort_order: 3 },
    ]);

    expect(result.updates).toEqual([]);
    expect(result.inserts).toEqual([
      { field_key: "blankIdField", sort_order: 3 },
    ]);
  });
});
