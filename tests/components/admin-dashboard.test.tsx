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

    render(
      <AdminDashboard
        initialApplications={[]}
        cycle={{
          id: "cycle-1",
          name: "Proceso de Selección 2026",
          is_active: true,
          stage1_open_at: "2026-01-01T00:00:00.000Z",
          stage1_close_at: "2026-05-31T23:59:59.000Z",
          stage2_open_at: "2026-06-01T00:00:00.000Z",
          stage2_close_at: "2026-12-31T23:59:59.000Z",
          max_applications_per_user: 3,
          created_at: "2026-01-01T00:00:00.000Z",
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Importar CSV" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/exam-imports",
      expect.objectContaining({ method: "POST" }),
    );

    fetchMock.mockRestore();
  });
});
