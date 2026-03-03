import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminExportBuilder } from "@/components/admin-export-builder";

const catalogFields = [
  {
    key: "applicantEmail",
    label: "Correo",
    helperText: "Email principal",
    kind: "core",
    groupKey: "core",
    groupLabel: "Datos base",
    defaultSelected: true,
  },
  {
    key: "essay",
    label: "Ensayo",
    helperText: "Respuesta larga",
    kind: "payload",
    groupKey: "payload",
    groupLabel: "Formulario",
    defaultSelected: false,
  },
] as const;

const presets = [
  {
    id: "preset-1",
    name: "Revision corta",
    selectedFields: ["essay", "applicantEmail"],
    updatedAt: "2026-03-03T00:00:00.000Z",
  },
] as const;

function okJson(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200 });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AdminExportBuilder", () => {
  it("loads the catalog, applies a preset, and renders a preview", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(okJson({ fields: catalogFields, presets }))
      .mockResolvedValueOnce(
        new Response("Ensayo,Correo\nTexto 1,ana@example.com\nTexto 2,luis@example.com\n", {
          status: 200,
          headers: { "Content-Type": "text/csv" },
        }),
      );

    render(<AdminExportBuilder cycleId="cycle-1" stageCode="documents" />);

    expect(await screen.findByText("Revision corta")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Revision corta" }));
    fireEvent.click(screen.getByRole("button", { name: "Vista previa (5 filas)" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/exports?cycleId=cycle-1&stageCode=documents&format=csv&fields=essay%2CapplicantEmail&limit=5",
      );
    });

    expect(await screen.findByRole("heading", { name: "Vista previa" })).toBeInTheDocument();
    expect(screen.getByText("Texto 1")).toBeInTheDocument();
    expect(screen.getByText("ana@example.com")).toBeInTheDocument();
  });

  it("saves a preset with the current field selection", async () => {
    const promptMock = vi.spyOn(window, "prompt").mockReturnValue("Preset equipo");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(okJson({ fields: catalogFields, presets: [] }))
      .mockResolvedValueOnce(
        okJson({
          preset: {
            id: "preset-2",
            name: "Preset equipo",
            selectedFields: ["applicantEmail", "essay"],
            updatedAt: "2026-03-03T01:00:00.000Z",
          },
        }),
      )
      .mockResolvedValueOnce(
        okJson({
          fields: catalogFields,
          presets: [
            {
              id: "preset-2",
              name: "Preset equipo",
              selectedFields: ["applicantEmail", "essay"],
              updatedAt: "2026-03-03T01:00:00.000Z",
            },
          ],
        }),
      );

    render(<AdminExportBuilder cycleId="cycle-1" />);

    await screen.findByRole("button", { name: "Guardar preset" });

    fireEvent.click(screen.getByText("Ensayo"));
    fireEvent.click(screen.getByRole("button", { name: "Guardar preset" }));

    await waitFor(() => {
      expect(promptMock).toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/exports",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cycleId: "cycle-1",
            presetId: null,
            name: "Preset equipo",
            selectedFields: ["applicantEmail", "essay"],
          }),
        }),
      );
    });

    expect(await screen.findByText("Preset equipo")).toBeInTheDocument();
  });
});
