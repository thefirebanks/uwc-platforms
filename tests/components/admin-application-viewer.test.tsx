import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
      if (url.includes("/api/applications/app-1/evaluation")) {
        return Promise.resolve(okJson({ evaluations: [] }));
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
      if (url.includes("/api/applications/app-1/evaluation")) {
        return Promise.resolve(okJson({ evaluations: [] }));
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

  it("uses theme-aware surfaces in files and recommendations tabs", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/api/exports?applicationId=app-1")) {
        return Promise.resolve(
          okJson({
            ...applicationExport,
            recommendations: [
              {
                id: "rec-1",
                role: "mentor",
                recommender_name: "Mentora Demo",
                recommender_email: "mentor@example.com",
                status: "sent",
                invite_sent_at: "2026-03-03T00:00:00.000Z",
                submitted_at: null,
                last_reminder_at: null,
                reminder_count: 0,
                admin_received_at: null,
                admin_received_reason: null,
                admin_received_file: null,
                admin_notes: null,
              },
            ],
          }),
        );
      }
      if (url.includes("/api/applications/app-1/admin-edit")) {
        return Promise.resolve(okJson({ history: [] }));
      }
      if (url.includes("/api/applications/app-1/files")) {
        return Promise.resolve(
          okJson({
            files: [
              {
                key: "identificationDocument",
                path: "applications/app-1/document.pdf",
                title: "Documento de identidad",
                originalName: "document.pdf",
                mimeType: "application/pdf",
                sizeBytes: 1024,
                uploadedAt: "2026-03-03T00:00:00.000Z",
                category: null,
                notes: null,
                downloadUrl: "https://example.com/document.pdf",
              },
            ],
          }),
        );
      }
      if (url.includes("/api/applications/app-1/evaluation")) {
        return Promise.resolve(okJson({ evaluations: [] }));
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

    await screen.findByRole("heading", { name: "Ana Perez" });

    fireEvent.click(screen.getByRole("button", { name: "Archivos" }));
    const fileCard = await screen.findByTestId("admin-file-card-identificationDocument");
    expect(fileCard).toHaveStyle({ background: "var(--surface)" });

    fireEvent.click(screen.getByRole("button", { name: "Recs." }));
    const recommendationCard = await screen.findByTestId("admin-recommendation-card-rec-1");
    expect(recommendationCard).toHaveStyle({ background: "var(--surface)" });
  });

  it("runs AI parsing from file cards when parser is enabled", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = String(input);
      if (url.includes("/api/exports?applicationId=app-1")) {
        return Promise.resolve(okJson(applicationExport));
      }
      if (url.includes("/api/applications/app-1/admin-edit")) {
        return Promise.resolve(okJson({ history: [] }));
      }
      if (url.includes("/api/applications/app-1/files")) {
        return Promise.resolve(
          okJson({
            files: [
              {
                key: "identificationDocument",
                path: "applications/app-1/document.pdf",
                title: "Documento de identidad",
                originalName: "document.pdf",
                mimeType: "application/pdf",
                sizeBytes: 1024,
                uploadedAt: "2026-03-03T00:00:00.000Z",
                category: null,
                notes: null,
                downloadUrl: "https://example.com/document.pdf",
                aiParserEnabled: true,
              },
            ],
          }),
        );
      }
      if (url.includes("/api/applications/app-1/evaluation")) {
        return Promise.resolve(okJson({ evaluations: [] }));
      }
      if (url.includes("/api/applications/app-1/ocr-check")) {
        expect(init?.method).toBe("POST");
        return Promise.resolve(
          okJson({
            summary: "Documento legible y consistente.",
            confidence: 0.92,
            createdAt: "2026-03-04T00:00:00.000Z",
          }),
        );
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

    await screen.findByRole("heading", { name: "Ana Perez" });
    fireEvent.click(screen.getByRole("button", { name: "Archivos" }));
    fireEvent.click(await screen.findByRole("button", { name: "Analizar con IA" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/applications/app-1/ocr-check",
        expect.objectContaining({ method: "POST" }),
      );
    });
    expect(await screen.findByText("Documento legible y consistente.")).toBeInTheDocument();
  });

  it("hides AI parsing action when parser is not enabled for the file field", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/api/exports?applicationId=app-1")) {
        return Promise.resolve(okJson(applicationExport));
      }
      if (url.includes("/api/applications/app-1/admin-edit")) {
        return Promise.resolve(okJson({ history: [] }));
      }
      if (url.includes("/api/applications/app-1/files")) {
        return Promise.resolve(
          okJson({
            files: [
              {
                key: "identificationDocument",
                path: "applications/app-1/document.pdf",
                title: "Documento de identidad",
                originalName: "document.pdf",
                mimeType: "application/pdf",
                sizeBytes: 1024,
                uploadedAt: "2026-03-03T00:00:00.000Z",
                category: null,
                notes: null,
                downloadUrl: "https://example.com/document.pdf",
                aiParserEnabled: false,
              },
            ],
          }),
        );
      }
      if (url.includes("/api/applications/app-1/evaluation")) {
        return Promise.resolve(okJson({ evaluations: [] }));
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

    await screen.findByRole("heading", { name: "Ana Perez" });
    fireEvent.click(screen.getByRole("button", { name: "Archivos" }));
    await screen.findByTestId("admin-file-card-identificationDocument");
    expect(screen.queryByRole("button", { name: "Analizar con IA" })).not.toBeInTheDocument();
  });

  it("shows API error details when AI parsing fails", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/api/exports?applicationId=app-1")) {
        return Promise.resolve(okJson(applicationExport));
      }
      if (url.includes("/api/applications/app-1/admin-edit")) {
        return Promise.resolve(okJson({ history: [] }));
      }
      if (url.includes("/api/applications/app-1/files")) {
        return Promise.resolve(
          okJson({
            files: [
              {
                key: "identificationDocument",
                path: "applications/app-1/document.pdf",
                title: "Documento de identidad",
                originalName: "document.pdf",
                mimeType: "application/pdf",
                sizeBytes: 1024,
                uploadedAt: "2026-03-03T00:00:00.000Z",
                category: null,
                notes: null,
                downloadUrl: "https://example.com/document.pdf",
                aiParserEnabled: true,
              },
            ],
          }),
        );
      }
      if (url.includes("/api/applications/app-1/evaluation")) {
        return Promise.resolve(okJson({ evaluations: [] }));
      }
      if (url.includes("/api/applications/app-1/ocr-check")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              message: "Este archivo no tiene parsing IA habilitado en el editor de formulario.",
              errorId: "err-ocr-1",
            }),
            { status: 400 },
          ),
        );
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

    await screen.findByRole("heading", { name: "Ana Perez" });
    fireEvent.click(screen.getByRole("button", { name: "Archivos" }));
    fireEvent.click(await screen.findByRole("button", { name: "Analizar con IA" }));

    expect(
      await screen.findByText(
        "Este archivo no tiene parsing IA habilitado en el editor de formulario.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Error ID: err-ocr-1")).toBeInTheDocument();
  });
});
