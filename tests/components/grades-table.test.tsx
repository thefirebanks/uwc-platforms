import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GradesTable, isGradeField } from "@/components/grades-table";
import type { CycleStageField } from "@/types/domain";

/* ── Helpers ──────────────────────────────────────────────────── */

function makeGradeField(fieldKey: string): CycleStageField {
  return {
    id: `id-${fieldKey}`,
    cycle_id: "cycle-1",
    stage_code: "documents",
    field_key: fieldKey,
    field_label: fieldKey,
    field_type: "number",
    is_required: false,
    placeholder: null,
    help_text: null,
    sort_order: 1,
    is_active: true,
    created_at: "2026-01-01T00:00:00.000Z",
  };
}

function makeFields(): CycleStageField[] {
  const subjects = ["matematica", "comunicacion", "ciencias"];
  const grades = ["primero", "segundo"] as const;
  const fields: CycleStageField[] = [];

  for (const grade of grades) {
    for (const subject of subjects) {
      fields.push(makeGradeField(`officialGrade_${grade}_${subject}`));
    }
    fields.push(makeGradeField(`officialGradeAverage_${grade}`));
  }

  return fields;
}

const defaultProps = {
  fields: makeFields(),
  formValues: {} as Record<string, string>,
  onFieldChange: vi.fn(),
  onFieldBlur: vi.fn(),
  disabled: false,
  language: "es" as const,
};

/* ── Tests ──────────────────────────────────────────────────── */

describe("GradesTable", () => {
  it("renders year tabs for grades with data", () => {
    render(<GradesTable {...defaultProps} />);
    // Year labels appear in both tabs and average row; use getAllByText
    const matches1ro = screen.getAllByText(/1ro/);
    const matches2do = screen.getAllByText(/2do/);
    expect(matches1ro.length).toBeGreaterThanOrEqual(1);
    expect(matches2do.length).toBeGreaterThanOrEqual(1);
    // The year tab buttons should exist
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBe(2);
  });

  it("renders English year tab labels", () => {
    render(<GradesTable {...defaultProps} language="en" />);
    const matches1st = screen.getAllByText(/1st/);
    const matches2nd = screen.getAllByText(/2nd/);
    expect(matches1st.length).toBeGreaterThanOrEqual(1);
    expect(matches2nd.length).toBeGreaterThanOrEqual(1);
  });

  it("renders subject rows for active year", () => {
    render(<GradesTable {...defaultProps} />);
    // First year (primero) should be active by default
    expect(screen.getByText("Matematica")).toBeInTheDocument();
    expect(screen.getByText("Comunicacion")).toBeInTheDocument();
    expect(screen.getByText("Ciencias")).toBeInTheDocument();
  });

  it("renders table headers in Spanish", () => {
    render(<GradesTable {...defaultProps} />);
    expect(screen.getByText("Materia")).toBeInTheDocument();
    expect(screen.getByText("Nota")).toBeInTheDocument();
  });

  it("renders table headers in English", () => {
    render(<GradesTable {...defaultProps} language="en" />);
    expect(screen.getByText("Subject")).toBeInTheDocument();
    expect(screen.getByText("Grade")).toBeInTheDocument();
  });

  it("renders inline number inputs for each subject", () => {
    const { container } = render(<GradesTable {...defaultProps} />);
    const numberInputs = container.querySelectorAll('input[type="number"]');
    // 3 subjects for primero (the active year)
    expect(numberInputs.length).toBe(3);
  });

  it("fires onFieldChange when a grade input is changed", () => {
    const onFieldChange = vi.fn();
    const { container } = render(
      <GradesTable {...defaultProps} onFieldChange={onFieldChange} />,
    );

    const inputs = container.querySelectorAll('input[type="number"]');
    fireEvent.change(inputs[0], { target: { value: "18" } });
    expect(onFieldChange).toHaveBeenCalledWith("officialGrade_primero_matematica", "18");
  });

  it("fires onFieldBlur when a grade input is blurred", () => {
    const onFieldBlur = vi.fn();
    const { container } = render(
      <GradesTable {...defaultProps} onFieldBlur={onFieldBlur} />,
    );

    const inputs = container.querySelectorAll('input[type="number"]');
    fireEvent.blur(inputs[0]);
    expect(onFieldBlur).toHaveBeenCalledTimes(1);
  });

  it("shows average row with -- when no values entered", () => {
    render(<GradesTable {...defaultProps} />);
    expect(screen.getByText("Promedio 1ro")).toBeInTheDocument();
    // "--" appears in both tab badges and average cell; use getAllByText
    const dashes = screen.getAllByText("--");
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it("shows English average label", () => {
    render(<GradesTable {...defaultProps} language="en" />);
    expect(screen.getByText("Average 1st")).toBeInTheDocument();
  });

  it("computes average from entered values", () => {
    const formValues: Record<string, string> = {
      officialGrade_primero_matematica: "18",
      officialGrade_primero_comunicacion: "16",
      officialGrade_primero_ciencias: "14",
    };
    render(<GradesTable {...defaultProps} formValues={formValues} />);
    // Average of 18, 16, 14 = 16.0; appears in tab badge and average row
    const avgElements = screen.getAllByText("16.0");
    expect(avgElements.length).toBeGreaterThanOrEqual(1);
  });

  it("switches year tab on click", () => {
    render(<GradesTable {...defaultProps} />);

    // Initially primero is active — check average label
    expect(screen.getByText("Promedio 1ro")).toBeInTheDocument();

    // Click on segundo tab
    fireEvent.click(screen.getByText("2do", { exact: false }));
    expect(screen.getByText("Promedio 2do")).toBeInTheDocument();
  });

  it("disables inputs when disabled prop is true", () => {
    const { container } = render(<GradesTable {...defaultProps} disabled={true} />);
    const inputs = container.querySelectorAll('input[type="number"]');
    for (const input of inputs) {
      expect((input as HTMLInputElement).disabled).toBe(true);
    }
  });

  it("shows pre-filled values in inputs", () => {
    const formValues: Record<string, string> = {
      officialGrade_primero_matematica: "15",
    };
    const { container } = render(
      <GradesTable {...defaultProps} formValues={formValues} />,
    );
    const inputs = container.querySelectorAll('input[type="number"]');
    expect((inputs[0] as HTMLInputElement).value).toBe("15");
  });

  it("returns null when no fields match grade pattern", () => {
    const { container } = render(
      <GradesTable {...defaultProps} fields={[]} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders hidden input for average field", () => {
    const { container } = render(
      <GradesTable
        {...defaultProps}
        formValues={{ officialGradeAverage_primero: "16.5" }}
      />,
    );
    const hiddenInput = container.querySelector(
      'input[type="hidden"][name="officialGradeAverage_primero"]',
    ) as HTMLInputElement;
    expect(hiddenInput).toBeTruthy();
    expect(hiddenInput.value).toBe("16.5");
  });
});

describe("isGradeField", () => {
  it("returns true for officialGrade_ fields", () => {
    expect(isGradeField("officialGrade_primero_matematica")).toBe(true);
    expect(isGradeField("officialGrade_quinto_ciencias")).toBe(true);
  });

  it("returns true for officialGradeAverage_ fields", () => {
    expect(isGradeField("officialGradeAverage_primero")).toBe(true);
    expect(isGradeField("officialGradeAverage_quinto")).toBe(true);
  });

  it("returns false for non-grade fields", () => {
    expect(isGradeField("fullName")).toBe(false);
    expect(isGradeField("gradeAverage")).toBe(false);
    expect(isGradeField("schoolName")).toBe(false);
    expect(isGradeField("")).toBe(false);
  });
});
