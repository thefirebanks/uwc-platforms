import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StageBadge } from "@/components/stage-badge";

describe("StageBadge", () => {
  it("renders stage 1 label", () => {
    render(<StageBadge stage="documents" />);

    expect(screen.getByText("Stage 1: Documentos")).toBeInTheDocument();
  });
});
