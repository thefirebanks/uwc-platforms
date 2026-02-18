import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminDashboard } from "@/components/admin-dashboard";

const cycle = {
  id: "cycle-1",
  name: "Proceso de Selección 2026",
  is_active: true,
  stage1_open_at: "2026-01-01T00:00:00.000Z",
  stage1_close_at: "2026-05-31T23:59:59.000Z",
  stage2_open_at: "2026-06-01T00:00:00.000Z",
  stage2_close_at: "2026-12-31T23:59:59.000Z",
  max_applications_per_user: 3,
  created_at: "2026-01-01T00:00:00.000Z",
} as const;

const cycleTemplates = [
  {
    id: "template-1",
    cycle_id: "cycle-1",
    stage_code: "documents",
    stage_label: "Stage 1: Documentos",
    milestone_label: "Recepción y validación documental",
    due_at: "2026-05-31T23:59:59.000Z",
    sort_order: 1,
    created_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "template-2",
    cycle_id: "cycle-1",
    stage_code: "exam_placeholder",
    stage_label: "Stage 2: Examen (placeholder)",
    milestone_label: "Evaluación externa y consolidación",
    due_at: "2026-12-31T23:59:59.000Z",
    sort_order: 2,
    created_at: "2026-01-01T00:00:00.000Z",
  },
] as const;

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
        cycle={cycle}
        cycleTemplates={[...cycleTemplates]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Importar CSV" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/exam-imports",
      expect.objectContaining({ method: "POST" }),
    );

    fetchMock.mockRestore();
  });

  it("saves stage templates via API", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            templates: cycleTemplates,
          }),
          { status: 200 },
        ),
      );

    render(
      <AdminDashboard
        initialApplications={[]}
        cycle={cycle}
        cycleTemplates={[...cycleTemplates]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Guardar plantillas" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/cycles/cycle-1/templates",
      expect.objectContaining({ method: "PATCH" }),
    );

    fetchMock.mockRestore();
  });
});
