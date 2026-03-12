import { describe, it, expect } from "vitest";
import { toDateInputValue } from "@/lib/utils/date-formatters";

describe("toDateInputValue", () => {
  it("extracts YYYY-MM-DD from ISO string", () => {
    expect(toDateInputValue("2026-03-10T14:30:00.000Z")).toBe("2026-03-10");
  });

  it("returns empty string for null", () => {
    expect(toDateInputValue(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(toDateInputValue(undefined)).toBe("");
  });

  it("handles date-only string", () => {
    expect(toDateInputValue("2026-01-15")).toBe("2026-01-15");
  });
});
