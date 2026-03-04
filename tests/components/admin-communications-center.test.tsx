import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminCommunicationsCenter } from "@/components/admin-communications-center";

function okJson(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200 });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AdminCommunicationsCenter", () => {
  it("shows clearer recipient filters, template variables, and inline preview count", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(okJson({ logs: [], campaigns: [], summary: {} }))
      .mockResolvedValueOnce(
        okJson({
          subject: "Actualización de tu postulación UWC Perú",
          bodyHtml: "<p>Hola ejemplo</p>",
        }),
      )
      .mockResolvedValueOnce(
        okJson({
          recipientCount: 1,
          deduplicated: false,
        }),
      );

    render(<AdminCommunicationsCenter cycleId="cycle-1" defaultStageCode="documents" />);

    expect(await screen.findByText("Centro de comunicaciones")).toBeInTheDocument();
    expect(screen.getByLabelText("Buscar por nombre o correo")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Úsalo para acotar la audiencia a un destinatario puntual o a coincidencias parciales.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("{{application_id}}")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Vista previa de audiencia" }));

    expect(await screen.findByText("Audiencia estimada: 1 destinatario(s)")).toBeInTheDocument();
    expect(screen.getByText("Hola ejemplo")).toBeInTheDocument();
  });

  it("uses Spanish send preparation copy for manual campaigns", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(okJson({ logs: [], campaigns: [], summary: {} }));

    render(<AdminCommunicationsCenter cycleId="cycle-1" defaultStageCode="documents" />);

    await screen.findByText("Centro de comunicaciones");
    expect(screen.getByRole("button", { name: "Preparar envío" })).toBeInTheDocument();
  });
});
