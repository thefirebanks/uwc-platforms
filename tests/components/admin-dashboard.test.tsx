import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminDashboard } from "@/components/admin-dashboard";

const cycle = {
  id: "11111111-1111-4111-8111-111111111111",
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
    cycle_id: cycle.id,
    stage_code: "documents",
    stage_label: "Stage 1: Documentos",
    milestone_label: "Recepción y validación documental",
    due_at: "2026-05-31T23:59:59.000Z",
    sort_order: 1,
    created_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "template-2",
    cycle_id: cycle.id,
    stage_code: "exam_placeholder",
    stage_label: "Stage 2: Examen (placeholder)",
    milestone_label: "Evaluación externa y consolidación",
    due_at: "2026-12-31T23:59:59.000Z",
    sort_order: 2,
    created_at: "2026-01-01T00:00:00.000Z",
  },
] as const;

function okJson(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200 });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AdminDashboard", () => {
  it("triggers exam import endpoint", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(okJson({ logs: [], campaigns: [], summary: {} }))
      .mockResolvedValueOnce(
        okJson({
          imported: 1,
          skipped: 0,
        }),
      );

    render(
      <AdminDashboard
        initialApplications={[]}
        cycle={cycle}
        cycleTemplates={[...cycleTemplates]}
        initialWorkspaceSection="communications"
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Importar CSV" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/exam-imports",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("saves stage templates via API", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      okJson({
        templates: cycleTemplates,
      }),
    );

    render(
      <AdminDashboard
        initialApplications={[]}
        cycle={cycle}
        cycleTemplates={[...cycleTemplates]}
        initialWorkspaceSection="stages"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Guardar plantillas" }));

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/cycles/${cycle.id}/templates`,
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("processes communication queue and refreshes communication status", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(okJson({ logs: [], campaigns: [], summary: {} }))
      .mockResolvedValueOnce(
        okJson({
          processed: 1,
          sent: 1,
          failed: 0,
          skipped: 0,
        }),
      )
      .mockResolvedValueOnce(
        okJson({
          logs: [],
          campaigns: [],
          summary: { queued: 0, processing: 0, sent: 1, failed: 0, total: 1 },
        }),
      );

    render(
      <AdminDashboard
        initialApplications={[]}
        cycle={cycle}
        cycleTemplates={[...cycleTemplates]}
        initialWorkspaceSection="communications"
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Procesar cola" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/communications/process",
        expect.objectContaining({ method: "POST" }),
      );
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/communications?cycleId=${cycle.id}&limit=8`,
      );
    });
  });

  it("previews and confirms a broadcast campaign with recipient count", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(okJson({ logs: [], campaigns: [], summary: {} }))
      .mockResolvedValueOnce(
        okJson({
          subject: "Actualización de tu postulación UWC Perú",
          bodyHtml: "<p>Hola ejemplo</p>",
        }),
      )
      .mockResolvedValueOnce(
        okJson({
          recipientCount: 2,
          deduplicated: false,
        }),
      )
      .mockResolvedValueOnce(
        okJson({
          recipientCount: 2,
          deduplicated: false,
        }),
      )
      .mockResolvedValueOnce(
        okJson({
          campaignId: "campaign-1",
          recipientCount: 2,
          deduplicated: false,
        }),
      )
      .mockResolvedValueOnce(
        okJson({
          processed: 2,
          sent: 2,
          failed: 0,
          skipped: 0,
        }),
      )
      .mockResolvedValueOnce(
        okJson({
          logs: [],
          campaigns: [
            {
              id: "campaign-1",
              name: "Actualización general",
              subject: "Actualización de tu postulación UWC Perú",
              status: "sent",
              createdAt: "2026-01-01T00:00:00.000Z",
              sentAt: "2026-01-01T00:01:00.000Z",
              recipientCount: 2,
              sentCount: 2,
              failedCount: 0,
            },
          ],
          summary: { queued: 0, processing: 0, sent: 2, failed: 0, total: 2 },
        }),
      )
      .mockResolvedValueOnce(
        okJson({
          logs: [],
          campaigns: [
            {
              id: "campaign-1",
              name: "Actualización general",
              subject: "Actualización de tu postulación UWC Perú",
              status: "sent",
              createdAt: "2026-01-01T00:00:00.000Z",
              sentAt: "2026-01-01T00:01:00.000Z",
              recipientCount: 2,
              sentCount: 2,
              failedCount: 0,
            },
          ],
          summary: { queued: 0, processing: 0, sent: 2, failed: 0, total: 2 },
        }),
      );

    render(
      <AdminDashboard
        initialApplications={[]}
        cycle={cycle}
        cycleTemplates={[...cycleTemplates]}
        initialWorkspaceSection="communications"
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Vista previa y conteo" }));

    expect(await screen.findByText("2 destinatario(s)")).toBeInTheDocument();
    expect(await screen.findByText("Hola ejemplo")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Send now" }));
    expect(await screen.findByText("Confirmación de campaña")).toBeInTheDocument();
    expect(screen.getByText("Esta campaña enviará 2 correo(s) ahora mismo.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Confirmar envío" }));

    await waitFor(() => {
      const sendCalls = fetchMock.mock.calls.filter(
        ([url, init]) =>
          url === "/api/communications/send" &&
          typeof init === "object" &&
          init !== null &&
          (init as RequestInit).method === "POST",
      );

      expect(sendCalls).toHaveLength(3);
    });

    expect(await screen.findByText("Actualización general")).toBeInTheDocument();
  });
});
