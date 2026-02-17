import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminDashboard } from "@/components/admin-dashboard";

describe("AdminDashboard", () => {
  it("triggers exam import endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ imported: 1, skipped: 0 }), {
        status: 200,
      }),
    );

    render(<AdminDashboard initialApplications={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "Importar CSV" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/exam-imports",
      expect.objectContaining({ method: "POST" }),
    );

    fetchMock.mockRestore();
  });
});
