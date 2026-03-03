import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminApplicationViewer } from "@/components/admin-application-viewer";

const applicationExport = {
  application: {
    id: "app-1",
    applicant_id: "applicant-1",
    cycle_id: "cycle-1",
    stage_code: "documents",
    status: "submitted",
    payload: {
      full_name: "Ana Perez",
      school_name: "Colegio UWC",
    },
    files: {},
    validation_notes: null,
    created_at: "2026-03-03T00:00:00.000Z",
    updated_at: "2026-03-03T00:00:00.000Z",
  },
  applicant: {
    email: "ana@example.com",
    full_name: "Ana Perez",
  },
  cycle: {
    id: "cycle-1",
    name: "Proceso 2026",
  },
  recommendations: [],
} as const;

function okJson(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200 });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AdminApplicationViewer", () => {
  it("shows active Stage 1 blockers in the data tab", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/api/exports?applicationId=app-1")) {
        return Promise.resolve(okJson(applicationExport));
      }
      if (url.includes("/api/applications/app-1/admin-edit")) {
        return Promise.resolve(okJson({ history: [] }));
      }
      if (url.includes("/api/applications/app-1/files")) {
        return Promise.resolve(okJson({ files: [] }));
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });

    render(
      <AdminApplicationViewer
        applicationId="app-1"
        stage1Blockers={[
          {
            code: "missing_payment",
            label: "Pago pendiente",
            detail: "Falta validar el comprobante de pago.",
            count: 1,
          },
        ]}
        onClose={() => {}}
        onApplicationUpdated={() => {}}
      />,
    );

    expect(await screen.findByRole("heading", { name: "Ana Perez" })).toBeInTheDocument();
    expect(screen.getByText("Bloqueos de Stage 1")).toBeInTheDocument();
    expect(screen.getByText("1 bloqueo(s)")).toBeInTheDocument();
    expect(screen.getByText("Pago pendiente")).toBeInTheDocument();
    expect(screen.getByText("Falta validar el comprobante de pago.")).toBeInTheDocument();
  });

  it("shows the empty blocker state when Stage 1 is clear", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/api/exports?applicationId=app-1")) {
        return Promise.resolve(okJson(applicationExport));
      }
      if (url.includes("/api/applications/app-1/admin-edit")) {
        return Promise.resolve(okJson({ history: [] }));
      }
      if (url.includes("/api/applications/app-1/files")) {
        return Promise.resolve(okJson({ files: [] }));
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });

    render(
      <AdminApplicationViewer
        applicationId="app-1"
        stage1Blockers={[]}
        onClose={() => {}}
        onApplicationUpdated={() => {}}
      />,
    );

    expect(await screen.findByRole("heading", { name: "Ana Perez" })).toBeInTheDocument();
    expect(screen.getByText("Sin bloqueos activos")).toBeInTheDocument();
    expect(
      screen.getByText("La postulación no tiene bloqueos activos en Stage 1."),
    ).toBeInTheDocument();
  });
});
