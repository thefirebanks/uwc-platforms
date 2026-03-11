import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminExportBuilder } from "@/components/admin-export-builder";

const CYCLE_ID = "11111111-1111-4111-8111-111111111111";

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
    key: "applicantName",
    label: "Nombre",
    helperText: "",
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

function errorJson(body: unknown, status = 400) {
  return new Response(JSON.stringify(body), { status });
}

/** Click the "Personalizar campos" tab to reveal the 3-panel layout. */
function switchToCustomMode() {
  fireEvent.click(screen.getByRole("button", { name: "Personalizar campos" }));
}

/** Get the catalog panel element (only visible in custom mode). */
function getCatalogPanel() {
  return screen.getByText("① Elige campos").closest(".export-builder__catalog-panel") as HTMLElement;
}

/** Get the selected-fields panel element (only visible in custom mode). */
function getSelectedPanel() {
  return screen.getByText("② Ordena").closest(".export-builder__selected-panel") as HTMLElement;
}

/**
 * Wait for the catalog to finish loading in custom mode.
 * Both defaultSelected fields are in "Datos base" → badge shows "2 de 2".
 */
async function waitForCatalog() {
  await screen.findByText("2 de 2");
}

/**
 * Wait for the catalog to finish loading in quick mode.
 * After load, quick download should be enabled (selected fields resolved).
 */
async function waitForQuickLoad() {
  await waitFor(() => {
    expect(screen.getByRole("button", { name: /Descargar/i })).toBeEnabled();
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AdminExportBuilder", () => {

  // ── Default state ─────────────────────────────────────────────────────────

  it("pre-selects fields with defaultSelected:true on load", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      okJson({ fields: catalogFields, presets: [] }),
    );

    render(<AdminExportBuilder cycleId={CYCLE_ID} />);
    switchToCustomMode();
    await waitForCatalog();

    const panel2 = getSelectedPanel();

    // Both defaultSelected fields should appear in panel 2
    expect(within(panel2).getByText("Correo")).toBeInTheDocument();
    expect(within(panel2).getByText("Nombre")).toBeInTheDocument();

    // Non-default field should NOT be in panel 2
    expect(within(panel2).queryByText("Ensayo")).not.toBeInTheDocument();

    // Selected count shows exactly 2
    expect(screen.getByText("2 campos · usa las flechas para reordenar")).toBeInTheDocument();
  });

  it("shows 'Selecciona un proceso' when cycleId is absent", () => {
    render(<AdminExportBuilder />);
    // Quick mode shows the message in the preset-meta area
    expect(
      screen.getByText("Selecciona un proceso para habilitar la exportación."),
    ).toBeInTheDocument();
  });

  it("disables Todos/Ninguno and the catalog search when no cycleId", () => {
    render(<AdminExportBuilder />);
    switchToCustomMode(); // These controls are only in custom mode
    expect(screen.getByRole("button", { name: "Todos" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Ninguno" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Buscar campo" })).toBeDisabled();
  });

  // ── Quick mode ─────────────────────────────────────────────────────────────

  it("quick mode: auto-applies the first preset on load and shows its name", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      okJson({ fields: catalogFields, presets }),
    );

    render(<AdminExportBuilder cycleId={CYCLE_ID} />);

    // Quick mode default: first preset name shown
    expect(await screen.findByText("Revision corta")).toBeInTheDocument();
    // Field count matches preset
    expect(screen.getByText("2 campos seleccionados")).toBeInTheDocument();
  });

  it("quick mode: Descargar button downloads with the preset fields", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(okJson({ fields: catalogFields, presets }))
      .mockResolvedValueOnce(
        new Response(new Blob(["data"], { type: "application/vnd.ms-excel" }), {
          status: 200,
          headers: {
            "Content-Type": "application/vnd.ms-excel",
            "Content-Disposition": 'attachment; filename="export.xlsx"',
          },
        }),
      );

    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:mock"), revokeObjectURL: vi.fn() });

    render(<AdminExportBuilder cycleId={CYCLE_ID} />);
    await waitForQuickLoad();

    fireEvent.click(screen.getByRole("button", { name: /Descargar/ }));

    await waitFor(() => {
      const body = JSON.parse(
        (fetchMock.mock.calls[1][1] as { body: string }).body,
      ) as Record<string, unknown>;
      expect(body.action).toBe("download");
      expect(body.selectedFields).toEqual(["payload.essay", "applicantEmail"]);
    });
  });

  // ── Preset application ────────────────────────────────────────────────────

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
              { label: "Correo", values: ["ana@example.com", "luis@example.com"] },
              { label: "Ensayo", values: ["Texto 1", "Texto 2"] },
            ],
          },
          totalFiltered: 2,
          exportedApplicants: 2,
          sheetCount: 1,
        }),
      );

    render(<AdminExportBuilder cycleId={CYCLE_ID} stageCode="documents" />);
    switchToCustomMode();

    // Preset pill appears in the top bar after catalog loads
    const presetBtn = await screen.findByRole("button", { name: "Revision corta" });
    expect(presetBtn).toBeInTheDocument();

    fireEvent.click(presetBtn);
    fireEvent.click(screen.getByRole("button", { name: "Vista previa" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/exports",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "preview",
            cycleId: CYCLE_ID,
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

  // ── Default export payload (no preset, no filters) ────────────────────────

  it("sends defaultSelected fields in the payload when previewing without applying a preset", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(okJson({ fields: catalogFields, presets: [] }))
      .mockResolvedValueOnce(
        okJson({
          preview: { sheetName: "P", applicantHeaders: [], rows: [] },
          totalFiltered: 0,
          exportedApplicants: 0,
          sheetCount: 1,
        }),
      );

    render(<AdminExportBuilder cycleId={CYCLE_ID} />);
    await waitForQuickLoad(); // Quick mode: wait for field count to appear

    fireEvent.click(screen.getByRole("button", { name: "Vista previa" }));

    await waitFor(() => {
      const body = JSON.parse(
        (fetchMock.mock.calls[1][1] as { body: string }).body,
      ) as Record<string, unknown>;

      expect(body.action).toBe("preview");
      expect(body.selectedFields).toEqual(["applicantEmail", "applicantName"]);
      expect(body.format).toBe("xlsx");
      expect(body.targetMode).toBe("filtered");
      expect(body.groupedExportMode).toBe("single-sheet");
      expect(body.status).toBeNull();
      expect(body.eligibility).toBe("all");
      expect(body.query).toBeNull();
    });
  });

  // ── Field toggling ────────────────────────────────────────────────────────

  it("adds a field to panel 2 when its checkbox is clicked, and removes it when unchecked", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      okJson({ fields: catalogFields, presets: [] }),
    );

    render(<AdminExportBuilder cycleId={CYCLE_ID} />);
    switchToCustomMode();
    await waitForCatalog();

    const catalog = getCatalogPanel();
    const panel2 = getSelectedPanel();

    // Ensayo not yet in panel 2
    expect(within(panel2).queryByText("Ensayo")).not.toBeInTheDocument();

    // Click label in catalog to toggle
    fireEvent.click(within(catalog).getByText("Ensayo"));
    expect(within(panel2).getByText("Ensayo")).toBeInTheDocument();

    // Click again to deselect
    fireEvent.click(within(catalog).getByText("Ensayo"));
    expect(within(panel2).queryByText("Ensayo")).not.toBeInTheDocument();
  });

  // ── Field ordering ────────────────────────────────────────────────────────

  it("reorders selected fields with ↑/↓ buttons", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      okJson({ fields: catalogFields, presets: [] }),
    );

    render(<AdminExportBuilder cycleId={CYCLE_ID} />);
    switchToCustomMode();
    await waitForCatalog();

    // Default order: Correo (index 0), Nombre (index 1)
    // Verified via aria-labels on buttons: first item's ↑ is disabled, last item's ↓ is disabled
    expect(screen.getByRole("button", { name: "Mover Correo arriba" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Mover Nombre abajo" })).toBeDisabled();

    // Click ↓ on Correo → Correo moves to index 1, Nombre moves to index 0
    fireEvent.click(screen.getByRole("button", { name: "Mover Correo abajo" }));

    // After swap: Nombre is first (its ↑ disabled), Correo is last (its ↓ disabled)
    expect(screen.getByRole("button", { name: "Mover Nombre arriba" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Mover Correo abajo" })).toBeDisabled();

    // Move Correo back up
    fireEvent.click(screen.getByRole("button", { name: "Mover Correo arriba" }));

    // Restored: Correo first, Nombre last
    expect(screen.getByRole("button", { name: "Mover Correo arriba" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Mover Nombre abajo" })).toBeDisabled();
  });

  it("disables ↑ on the first item and ↓ on the last item", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      okJson({ fields: catalogFields, presets: [] }),
    );

    render(<AdminExportBuilder cycleId={CYCLE_ID} />);
    switchToCustomMode();
    await waitForCatalog();

    expect(screen.getByRole("button", { name: "Mover Correo arriba" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Mover Correo abajo" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Mover Nombre arriba" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Mover Nombre abajo" })).toBeDisabled();
  });

  // ── Todos / Ninguno ───────────────────────────────────────────────────────

  it("selects all fields with the Todos button", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      okJson({ fields: catalogFields, presets: [] }),
    );

    render(<AdminExportBuilder cycleId={CYCLE_ID} />);
    switchToCustomMode();
    await waitForCatalog();

    fireEvent.click(screen.getByRole("button", { name: "Todos" }));

    const panel2 = getSelectedPanel();
    expect(within(panel2).getByText("Ensayo")).toBeInTheDocument();
    expect(screen.getByText("3 campos · usa las flechas para reordenar")).toBeInTheDocument();
  });

  it("clears all fields with the Ninguno button", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      okJson({ fields: catalogFields, presets: [] }),
    );

    render(<AdminExportBuilder cycleId={CYCLE_ID} />);
    switchToCustomMode();
    await waitForCatalog();

    fireEvent.click(screen.getByRole("button", { name: "Ninguno" }));

    expect(screen.getByText("Ningún campo seleccionado")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Vista previa" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Descargar/ })).toBeDisabled();
  });

  // ── Catalog search ────────────────────────────────────────────────────────

  it("filters the catalog by search query, hiding non-matching fields and groups", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      okJson({ fields: catalogFields, presets: [] }),
    );

    render(<AdminExportBuilder cycleId={CYCLE_ID} />);
    switchToCustomMode();
    await waitForCatalog();

    const searchInput = screen.getByRole("textbox", { name: "Buscar campo" });
    fireEvent.change(searchInput, { target: { value: "Ensayo" } });

    // Formulario group and Ensayo field should be visible
    const catalog = getCatalogPanel();
    expect(within(catalog).getByText("Formulario")).toBeInTheDocument();
    expect(within(catalog).getByText("Ensayo")).toBeInTheDocument();

    // Datos base group should be hidden in the catalog
    expect(within(catalog).queryByText("Datos base")).not.toBeInTheDocument();
    // Correo label not in catalog (catalog shows group-labels and col-label-texts)
    expect(within(catalog).queryByText("Correo")).not.toBeInTheDocument();
  });

  it("shows 'no coincidan' message when catalog search has no results", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      okJson({ fields: catalogFields, presets: [] }),
    );

    render(<AdminExportBuilder cycleId={CYCLE_ID} />);
    switchToCustomMode();
    await waitForCatalog();

    const searchInput = screen.getByRole("textbox", { name: "Buscar campo" });
    fireEvent.change(searchInput, { target: { value: "xyzzy_no_match" } });

    expect(screen.getByText("No hay campos que coincidan con la búsqueda.")).toBeInTheDocument();
  });

  // ── Group count badge ─────────────────────────────────────────────────────

  it("shows count badge on groups — maroon with fraction when fields selected, plain count otherwise", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      okJson({ fields: catalogFields, presets: [] }),
    );

    render(<AdminExportBuilder cycleId={CYCLE_ID} />);
    switchToCustomMode();
    await waitForCatalog();

    // "Datos base": 2 of 2 selected → "2 de 2"
    const datosBadge = screen.getByText("2 de 2");
    expect(datosBadge).toBeInTheDocument();
    expect(datosBadge.className).toContain("has-selected");

    // "Formulario": 0 of 1 → just "1"
    const formularioBadge = screen.getByText("1");
    expect(formularioBadge).toBeInTheDocument();
    expect(formularioBadge.className).not.toContain("has-selected");
  });

  // ── Preset saving ─────────────────────────────────────────────────────────

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
            selectedFields: ["applicantEmail", "applicantName"],
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
              selectedFields: ["applicantEmail", "applicantName"],
              updatedAt: "2026-03-03T01:00:00.000Z",
            },
          ],
        }),
      );

    render(<AdminExportBuilder cycleId={CYCLE_ID} />);
    switchToCustomMode();
    await screen.findByRole("button", { name: "Guardar preset" });

    fireEvent.click(screen.getByRole("button", { name: "Guardar preset" }));

    await waitFor(() => {
      expect(promptMock).toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/exports",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cycleId: CYCLE_ID,
            presetId: null,
            name: "Preset equipo",
            selectedFields: ["applicantEmail", "applicantName"],
          }),
        }),
      );
    });

    // Preset pill appears in topbar after save
    expect(await screen.findByText("Preset equipo")).toBeInTheDocument();
  });

  it("disables Guardar preset when no fields are selected", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      okJson({ fields: catalogFields, presets: [] }),
    );

    render(<AdminExportBuilder cycleId={CYCLE_ID} />);
    switchToCustomMode();
    await screen.findByRole("button", { name: "Guardar preset" });

    fireEvent.click(screen.getByRole("button", { name: "Ninguno" }));
    expect(screen.getByRole("button", { name: "Guardar preset" })).toBeDisabled();
  });

  // ── Download ──────────────────────────────────────────────────────────────

  it("calls the download endpoint with correct payload", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(okJson({ fields: catalogFields, presets: [] }))
      .mockResolvedValueOnce(
        new Response(new Blob(["data"], { type: "application/vnd.ms-excel" }), {
          status: 200,
          headers: {
            "Content-Type": "application/vnd.ms-excel",
            "Content-Disposition": 'attachment; filename="export.xlsx"',
          },
        }),
      );

    // Stub URL methods to avoid jsdom crashes on createObjectURL
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:mock"), revokeObjectURL: vi.fn() });

    render(<AdminExportBuilder cycleId={CYCLE_ID} />);
    await waitForQuickLoad(); // No presets → defaultSelected fields, quick mode

    fireEvent.click(screen.getByRole("button", { name: /Descargar/ }));

    await waitFor(() => {
      const body = JSON.parse(
        (fetchMock.mock.calls[1][1] as { body: string }).body,
      ) as Record<string, unknown>;
      expect(body.action).toBe("download");
      expect(body.selectedFields).toEqual(["applicantEmail", "applicantName"]);
      expect(body.format).toBe("xlsx");
    });
  });

  it("shows a download error message when the API returns an error", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(okJson({ fields: catalogFields, presets: [] }))
      .mockResolvedValueOnce(
        errorJson({ userMessage: "Error al exportar: sin postulantes." }, 422),
      );

    render(<AdminExportBuilder cycleId={CYCLE_ID} />);
    await waitForQuickLoad();

    fireEvent.click(screen.getByRole("button", { name: /Descargar/ }));

    expect(await screen.findByText("Error al exportar: sin postulantes.")).toBeInTheDocument();
  });

  // ── Catalog error ─────────────────────────────────────────────────────────

  it("shows an error callout when the catalog fails to load", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      errorJson({ userMessage: "Sin acceso al catalogo." }, 403),
    );

    render(<AdminExportBuilder cycleId={CYCLE_ID} />);
    // Quick mode shows catalogError in the preset-meta area
    expect(await screen.findByText("Sin acceso al catalogo.")).toBeInTheDocument();
  });

  // ── stageCode prop syncs to filter ────────────────────────────────────────

  it("initialises the stage filter from the stageCode prop", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(okJson({ fields: catalogFields, presets: [] }))
      .mockResolvedValueOnce(
        okJson({
          preview: { sheetName: "P", applicantHeaders: [], rows: [] },
          totalFiltered: 0,
          exportedApplicants: 0,
          sheetCount: 1,
        }),
      );

    render(<AdminExportBuilder cycleId={CYCLE_ID} stageCode="documents" />);
    await waitForQuickLoad(); // Quick mode: stageCode filter is the select in the quick panel

    fireEvent.click(screen.getByRole("button", { name: "Vista previa" }));

    await waitFor(() => {
      const body = JSON.parse(
        (fetchMock.mock.calls[1][1] as { body: string }).body,
      ) as Record<string, unknown>;
      expect(body.stageCode).toBe("documents");
    });
  });
});
