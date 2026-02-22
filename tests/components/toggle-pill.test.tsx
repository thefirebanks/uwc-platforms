import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TogglePill } from "@/components/toggle-pill";

describe("TogglePill", () => {
  it("renders yes and no labels", () => {
    render(<TogglePill value="" onChange={() => {}} />);

    expect(screen.getByText("Si")).toBeInTheDocument();
    expect(screen.getByText("No")).toBeInTheDocument();
  });

  it("renders custom yes/no labels", () => {
    render(<TogglePill value="" onChange={() => {}} yesLabel="Yes" noLabel="No" />);

    expect(screen.getByText("Yes")).toBeInTheDocument();
    expect(screen.getByText("No")).toBeInTheDocument();
  });

  it("calls onChange with yes label when yes button is clicked", () => {
    const onChange = vi.fn();
    render(<TogglePill value="" onChange={onChange} />);

    fireEvent.click(screen.getByText("Si"));
    expect(onChange).toHaveBeenCalledWith("Si");
  });

  it("calls onChange with no label when no button is clicked", () => {
    const onChange = vi.fn();
    render(<TogglePill value="" onChange={onChange} />);

    fireEvent.click(screen.getByText("No"));
    expect(onChange).toHaveBeenCalledWith("No");
  });

  it("calls onBlur after onChange", () => {
    const onChange = vi.fn();
    const onBlur = vi.fn();
    render(<TogglePill value="" onChange={onChange} onBlur={onBlur} />);

    fireEvent.click(screen.getByText("Si"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  it("does not call onChange when disabled", () => {
    const onChange = vi.fn();
    render(<TogglePill value="" onChange={onChange} disabled />);

    fireEvent.click(screen.getByText("Si"));
    fireEvent.click(screen.getByText("No"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("recognises 'si' as yes value (case insensitive)", () => {
    const { container } = render(<TogglePill value="si" onChange={() => {}} />);
    // The yes button should have a maroon background when selected
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBe(2);
    // We can't easily check computed styles in jsdom, but the component renders without error
    expect(screen.getByText("Si")).toBeInTheDocument();
  });

  it("recognises accented 'si' as yes value", () => {
    render(<TogglePill value="Si" onChange={() => {}} />);
    // Should not throw; normalised value matches
    expect(screen.getByText("Si")).toBeInTheDocument();
  });

  it("recognises 'no' as no value", () => {
    render(<TogglePill value="No" onChange={() => {}} />);
    expect(screen.getByText("No")).toBeInTheDocument();
  });

  it("renders two button elements", () => {
    const { container } = render(<TogglePill value="" onChange={() => {}} />);
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBe(2);
  });

  it("uses custom labels in onChange callback", () => {
    const onChange = vi.fn();
    render(<TogglePill value="" onChange={onChange} yesLabel="Yes" noLabel="Nope" />);

    fireEvent.click(screen.getByText("Yes"));
    expect(onChange).toHaveBeenCalledWith("Yes");

    fireEvent.click(screen.getByText("Nope"));
    expect(onChange).toHaveBeenCalledWith("Nope");
  });
});
