import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ErrorCallout } from "@/components/error-callout";

describe("ErrorCallout", () => {
  it("shows error id", () => {
    render(
      <ErrorCallout
        message="Ocurrió un error"
        errorId="err-123"
        context="test_component"
      />,
    );

    expect(screen.getByText(/Error ID: err-123/)).toBeInTheDocument();
  });

  it("submits bug report", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    render(
      <ErrorCallout
        message="Ocurrió un error"
        errorId="err-123"
        context="test_component"
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Reportar este problema" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    fetchMock.mockRestore();
  });
});
