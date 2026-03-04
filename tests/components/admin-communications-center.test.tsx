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
  it("supports a direct recipient field and keeps the audience estimate inside the preview block", async () => {
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
    expect(
      screen.getByLabelText("Filtrar postulantes por nombre o correo", { selector: "input" }),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Correo puntual (opcional)", { selector: "input" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Variables disponibles")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Correo puntual (opcional)", { selector: "input" }), {
      target: { value: "dafirebanks@gmail.com" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Vista previa de audiencia" }));

    expect(await screen.findByText("Audiencia estimada: 1 destinatario(s)")).toBeInTheDocument();
    expect(screen.getByText("Hola ejemplo")).toBeInTheDocument();
  });

  it("shows direct-send confirmation copy when a single recipient email is present", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(okJson({ logs: [], campaigns: [], summary: {} }))
      .mockResolvedValueOnce(okJson({ recipientCount: 1, deduplicated: false }));

    render(<AdminCommunicationsCenter cycleId="cycle-1" defaultStageCode="documents" />);

    await screen.findByText("Centro de comunicaciones");
    fireEvent.change(screen.getByLabelText("Correo puntual (opcional)", { selector: "input" }), {
      target: { value: "dafirebanks@gmail.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preparar envío" }));

    expect(await screen.findByText("Confirmar envío inmediato a dafirebanks@gmail.com.")).toBeInTheDocument();
  });
});
