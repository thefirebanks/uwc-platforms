import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminStageSidebar } from "@/components/admin-stage-sidebar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/process/cycle-1/stage/template-docs",
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

describe("AdminStageSidebar", () => {
  it("updates the displayed stage label from optimistic events", () => {
    render(
      <AdminStageSidebar
        cycleId="cycle-1"
        cycleName="Proceso 2026"
        stages={[
          {
            id: "template-docs",
            cycle_id: "cycle-1",
            stage_code: "documents",
            stage_label: "Formulario Principal",
            milestone_label: "Recepcion",
            due_at: null,
            sort_order: 1,
            created_at: "2026-01-01T00:00:00.000Z",
          },
        ]}
      />,
    );

    expect(screen.getByText("Formulario Principal")).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(
        new CustomEvent("uwc:stage-label-updated", {
          detail: {
            cycleId: "cycle-1",
            stageId: "template-docs",
            stageLabel: "Documentos y anexos",
          },
        }),
      );
    });

    expect(screen.getByText("Documentos y anexos")).toBeInTheDocument();
  });
});
