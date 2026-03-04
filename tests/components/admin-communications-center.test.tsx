import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("blocks confirmation when prepare-send detects a deduplicated campaign", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(okJson({ logs: [], campaigns: [], summary: {} }))
      .mockResolvedValueOnce(okJson({ recipientCount: 3, deduplicated: true }));

    render(<AdminCommunicationsCenter cycleId="cycle-1" defaultStageCode="documents" />);

    await screen.findByText("Centro de comunicaciones");
    fireEvent.click(screen.getByRole("button", { name: "Preparar envío" }));

    expect(
      await screen.findByText("Ya existe una campaña idéntica. Revisa el historial antes de reenviar."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirmar envío" })).not.toBeInTheDocument();
  });

  it("completes direct send confirmation flow with delivery status message", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(okJson({ logs: [], campaigns: [], summary: {} }))
      .mockResolvedValueOnce(okJson({ recipientCount: 1, deduplicated: false }))
      .mockResolvedValueOnce(okJson({ deliveryMode: "direct" }));

    render(<AdminCommunicationsCenter cycleId="cycle-1" defaultStageCode="documents" />);

    await screen.findByText("Centro de comunicaciones");
    fireEvent.change(screen.getByLabelText("Correo puntual (opcional)", { selector: "input" }), {
      target: { value: "dafirebanks@gmail.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preparar envío" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirmar envío" }));

    expect(await screen.findByText("Correo enviado a dafirebanks@gmail.com.")).toBeInTheDocument();
  });

  it("surfaces API error callout when sending a campaign test email fails", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(okJson({ logs: [], campaigns: [], summary: {} }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            message: "No se pudo enviar el correo de prueba.",
            errorId: "err-comms-test",
          }),
          { status: 500 },
        ),
      );

    render(<AdminCommunicationsCenter cycleId="cycle-1" defaultStageCode="documents" />);

    await screen.findByText("Centro de comunicaciones");
    fireEvent.click(screen.getByRole("button", { name: "Enviar prueba" }));

    expect(await screen.findByText("No se pudo enviar el correo de prueba.")).toBeInTheDocument();
    expect(screen.getByText("Error ID: err-comms-test")).toBeInTheDocument();
  });

  it("shows a no-audience status message and skips confirmation for zero recipients", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(okJson({ logs: [], campaigns: [], summary: {} }))
      .mockResolvedValueOnce(okJson({ recipientCount: 0, deduplicated: false }));

    render(<AdminCommunicationsCenter cycleId="cycle-1" defaultStageCode="documents" />);

    await screen.findByText("Centro de comunicaciones");
    fireEvent.click(screen.getByRole("button", { name: "Preparar envío" }));

    expect(
      await screen.findByText("No hay destinatarios que coincidan con los filtros actuales."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Confirmación de campaña")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirmar envío" })).not.toBeInTheDocument();
  });

  it("surfaces API error callout when audience counting fails during preview", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(okJson({ logs: [], campaigns: [], summary: {} }))
      .mockResolvedValueOnce(okJson({ subject: "Asunto", bodyHtml: "<p>Hola</p>" }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            message: "No se pudo estimar la audiencia.",
            errorId: "err-comms-count",
          }),
          { status: 500 },
        ),
      );

    render(<AdminCommunicationsCenter cycleId="cycle-1" defaultStageCode="documents" />);

    await screen.findByText("Centro de comunicaciones");
    fireEvent.click(screen.getByRole("button", { name: "Vista previa de audiencia" }));

    expect(await screen.findByText("No se pudo estimar la audiencia.")).toBeInTheDocument();
    expect(screen.getByText("Error ID: err-comms-count")).toBeInTheDocument();
  });

  it("queues a non-direct campaign and shows the final queue status message", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(okJson({ logs: [], campaigns: [], summary: {} }))
      .mockResolvedValueOnce(okJson({ recipientCount: 2, deduplicated: false }))
      .mockResolvedValueOnce(okJson({ recipientCount: 2, deliveryMode: "queue" }))
      .mockResolvedValueOnce(okJson({ processed: 2, sent: 2, failed: 0 }))
      .mockResolvedValueOnce(okJson({ logs: [], campaigns: [], summary: {} }))
      .mockResolvedValueOnce(okJson({ logs: [], campaigns: [], summary: {} }));

    render(<AdminCommunicationsCenter cycleId="cycle-1" defaultStageCode="documents" />);

    await screen.findByText("Centro de comunicaciones");
    fireEvent.click(screen.getByRole("button", { name: "Preparar envío" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirmar envío" }));

    expect(
      await screen.findByText("Campaña encolada para 2 destinatario(s)."),
    ).toBeInTheDocument();
  });

  it("sends trimmed search and direct recipient filters in prepare-send payload", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(okJson({ logs: [], campaigns: [], summary: {} }))
      .mockResolvedValueOnce(okJson({ recipientCount: 1, deduplicated: false }));

    render(<AdminCommunicationsCenter cycleId="cycle-1" defaultStageCode="documents" />);

    await screen.findByText("Centro de comunicaciones");
    fireEvent.change(
      screen.getByLabelText("Filtrar postulantes por nombre o correo", { selector: "input" }),
      {
        target: { value: "  dafirebanks@gmail.com  " },
      },
    );
    fireEvent.change(screen.getByLabelText("Correo puntual (opcional)", { selector: "input" }), {
      target: { value: "  dafirebanks@gmail.com  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preparar envío" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/communications/send",
        expect.objectContaining({ method: "POST" }),
      );
    });

    const sendCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        url === "/api/communications/send" &&
        typeof init === "object" &&
        Boolean((init as RequestInit).body),
    );
    const payload = JSON.parse(String((sendCall?.[1] as RequestInit | undefined)?.body ?? "{}"));
    expect(payload.broadcast.search).toBe("dafirebanks@gmail.com");
    expect(payload.broadcast.directRecipientEmail).toBe("dafirebanks@gmail.com");
  });
});
