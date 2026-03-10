import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminCandidatesDashboard } from "@/components/admin-candidates-dashboard";

const exportBuilderMock = vi.fn(({ cycleId }: { cycleId?: string }) => (
  <div data-testid="admin-export-builder">{cycleId ?? "no-cycle"}</div>
));

vi.mock("@/components/admin-export-builder", () => ({
  AdminExportBuilder: (props: { cycleId?: string }) => exportBuilderMock(props),
}));

vi.mock("@/components/admin-application-viewer", () => ({
  AdminApplicationViewer: () => null,
}));

function okJson(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200 });
}

afterEach(() => {
  vi.restoreAllMocks();
  exportBuilderMock.mockClear();
});

describe("AdminCandidatesDashboard", () => {
  it("shows the export workspace inside candidatos", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        okJson({
          rows: [],
          total: 0,
          page: 1,
          pageSize: 50,
          totalPages: 0,
        }),
      )
      .mockResolvedValueOnce(
        okJson({
          summary: {
            totalApplications: 0,
            readyForReview: 0,
            blocked: 0,
            notSubmitted: 0,
            missingRequiredFields: 0,
            missingRequiredFiles: 0,
            recommendationsNotRequested: 0,
            recommendationsPending: 0,
          },
          applications: [],
        }),
      );

    render(
      <AdminCandidatesDashboard
        cycleOptions={[{ id: "cycle-1", name: "Proceso 2026", isActive: true }]}
        defaultCycleId="cycle-1"
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Exportar datos" }));

    expect(await screen.findByTestId("admin-export-builder")).toHaveTextContent("cycle-1");
    expect(screen.queryByText("Listado de candidatos")).not.toBeInTheDocument();
  });

  it("supports opening directly on the export workspace", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        okJson({
          rows: [],
          total: 0,
          page: 1,
          pageSize: 50,
          totalPages: 0,
        }),
      )
      .mockResolvedValueOnce(
        okJson({
          summary: {
            totalApplications: 0,
            readyForReview: 0,
            blocked: 0,
            notSubmitted: 0,
            missingRequiredFields: 0,
            missingRequiredFiles: 0,
            recommendationsNotRequested: 0,
            recommendationsPending: 0,
          },
          applications: [],
        }),
      );

    render(
      <AdminCandidatesDashboard
        cycleOptions={[{ id: "cycle-1", name: "Proceso 2026", isActive: true }]}
        defaultCycleId="cycle-1"
        defaultView="export"
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId("admin-export-builder")).toHaveTextContent("cycle-1"),
    );
  });
});
