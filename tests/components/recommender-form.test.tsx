import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecommenderForm } from "@/components/recommender-form";

describe("RecommenderForm", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("hides OTP controls when the recommendation link is invalid", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ message: "El enlace de recomendación no es válido o ya no existe." }),
        { status: 404 },
      ),
    );

    render(<RecommenderForm token="missing-token" />);

    expect(await screen.findByText("Formulario de recomendación")).toBeInTheDocument();
    expect(
      await screen.findByText("El enlace de recomendación no es válido o ya no existe."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Enviar OTP" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Código OTP")).not.toBeInTheDocument();
  });

  it("restores a valid session and renders the saved recommendation form", async () => {
    window.localStorage.setItem("uwc-recommender-session:rec-token", "session-123");

    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);

      if (url === "/api/recommendations/public/rec-token") {
        return new Response(
          JSON.stringify({
            recommendation: {
              id: "rec-1",
              role: "friend",
              maskedEmail: "am****@example.com",
              status: "opened",
              submittedAt: null,
              accessExpiresAt: "2026-03-12T16:00:00.000Z",
            },
          }),
          { status: 200 },
        );
      }

      if (url === "/api/recommendations/public/rec-token/session") {
        const headers = new Headers((init as RequestInit | undefined)?.headers);
        expect(headers.get("x-recommender-session")).toBe("session-123");

        return new Response(
          JSON.stringify({
            recommendation: {
              id: "rec-1",
              role: "friend",
              status: "in_progress",
              submittedAt: null,
              responses: {
                recommenderName: "Mariela Quispe",
                relationshipTitle: "Tutora de literatura",
                knownDuration: "2 años",
                strengths:
                  "Conozco a la postulante como una estudiante muy curiosa, rigurosa y constante en clase.",
                growthAreas:
                  "A veces necesita priorizar mejor su tiempo cuando combina varios proyectos intensos.",
                endorsement:
                  "La recomiendo con confianza por su madurez, capacidad de escucha y compromiso con su comunidad.",
                confirmsNoFamily: true,
              },
            },
          }),
          { status: 200 },
        );
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(<RecommenderForm token="rec-token" />);

    expect(await screen.findByText("Completa la recomendación")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Mariela Quispe")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Tutora de literatura")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirmo que no tengo vínculo familiar con el postulante.")).toBeChecked();
    expect(screen.queryByRole("button", { name: "Enviar OTP" })).not.toBeInTheDocument();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
