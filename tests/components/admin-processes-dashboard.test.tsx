import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminProcessesDashboard } from "@/components/admin-processes-dashboard";

const refreshMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: refreshMock,
  }),
}));

describe("AdminProcessesDashboard", () => {
  it("creates a new process via API", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          cycle: {
            id: "cycle-2",
            name: "Proceso de Selección 2027",
            is_active: false,
            stage1_open_at: "2027-01-01T00:00:00.000Z",
            stage1_close_at: "2027-05-31T23:59:59.000Z",
            stage2_open_at: "2027-06-01T00:00:00.000Z",
            stage2_close_at: "2027-12-31T23:59:59.000Z",
            max_applications_per_user: 3,
            created_at: "2027-01-01T00:00:00.000Z",
          },
        }),
        { status: 200 },
      ),
    );

    render(
      <AdminProcessesDashboard
        initialProcesses={[
          {
            id: "cycle-1",
            name: "Proceso de Selección 2026",
            is_active: true,
            stage1_open_at: "2026-01-01T00:00:00.000Z",
            stage1_close_at: "2026-05-31T23:59:59.000Z",
            stage2_open_at: "2026-06-01T00:00:00.000Z",
            stage2_close_at: "2026-12-31T23:59:59.000Z",
            max_applications_per_user: 3,
            created_at: "2026-01-01T00:00:00.000Z",
            applicationCount: 1,
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "+ Nuevo Proceso" }));
    fireEvent.click(screen.getByRole("button", { name: "Crear proceso" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/cycles",
        expect.objectContaining({ method: "POST" }),
      );
    });

    fetchMock.mockRestore();
  });
});
