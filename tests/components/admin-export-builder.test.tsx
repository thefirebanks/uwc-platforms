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
    key: "payload.essay",
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
    selectedFields: ["payload.essay", "applicantEmail"],
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
  it("loads the catalog, applies a preset, and renders a matrix preview", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(okJson({ fields: catalogFields, presets }))
      .mockResolvedValueOnce(
        okJson({
          preview: {
            sheetName: "Postulantes",
            applicantHeaders: ["Ana Perez (ana@example.com)", "Luis Diaz (luis@example.com)"],
            rows: [
              {
                label: "Correo",
                values: ["ana@example.com", "luis@example.com"],
              },
              {
                label: "Ensayo",
                values: ["Texto 1", "Texto 2"],
              },
            ],
          },
          totalFiltered: 2,
          exportedApplicants: 2,
          sheetCount: 1,
        }),
      );

    render(<AdminExportBuilder cycleId="11111111-1111-4111-8111-111111111111" stageCode="documents" />);

    expect(await screen.findByText("Revision corta")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Revision corta" }));
    fireEvent.click(screen.getByRole("button", { name: "Vista previa" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/exports",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "preview",
            cycleId: "11111111-1111-4111-8111-111111111111",
            stageCode: "documents",
            status: null,
            eligibility: "all",
            query: null,
            selectedFields: ["payload.essay", "applicantEmail"],
            format: "xlsx",
            targetMode: "filtered",
            selectedApplicationIds: undefined,
            groupAssignments: undefined,
            randomSample: undefined,
            groupedExportMode: "single-sheet",
          }),
        }),
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
            selectedFields: ["applicantEmail", "payload.essay"],
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
              selectedFields: ["applicantEmail", "payload.essay"],
              updatedAt: "2026-03-03T01:00:00.000Z",
            },
          ],
        }),
      );

    render(<AdminExportBuilder cycleId="11111111-1111-4111-8111-111111111111" />);

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
            cycleId: "11111111-1111-4111-8111-111111111111",
            presetId: null,
            name: "Preset equipo",
            selectedFields: ["applicantEmail", "payload.essay"],
          }),
        }),
      );
    });

    expect(await screen.findByText("Preset equipo")).toBeInTheDocument();
  });
});
