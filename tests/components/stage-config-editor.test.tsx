import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StageConfigEditor } from "@/components/stage-config-editor";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("StageConfigEditor", () => {
  it("saves stage config after adding a field", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          fields: [
            {
              id: "field-1",
              cycle_id: "cycle-1",
              stage_code: "documents",
              field_key: "fullName",
              field_label: "Nombre completo",
              field_type: "short_text",
              is_required: true,
              placeholder: null,
              help_text: null,
              sort_order: 1,
              is_active: true,
              created_at: "2026-01-01T00:00:00.000Z",
            },
          ],
          automations: [
            {
              id: "automation-1",
              cycle_id: "cycle-1",
              stage_code: "documents",
              trigger_event: "application_submitted",
              channel: "email",
              is_enabled: true,
              template_subject: "Asunto",
              template_body: "Cuerpo de prueba",
              created_at: "2026-01-01T00:00:00.000Z",
              updated_at: "2026-01-01T00:00:00.000Z",
            },
          ],
        }),
        { status: 200 },
      ),
    );

    render(
      <StageConfigEditor
        cycleId="cycle-1"
        cycleName="Proceso 2026"
        stageCode="documents"
        stageLabel="Stage 1"
        initialFields={[
          {
            id: "field-1",
            cycle_id: "cycle-1",
            stage_code: "documents",
            field_key: "fullName",
            field_label: "Nombre completo",
            field_type: "short_text",
            is_required: true,
            placeholder: null,
            help_text: null,
            sort_order: 1,
            is_active: true,
            created_at: "2026-01-01T00:00:00.000Z",
          },
        ]}
        initialAutomations={[
          {
            id: "automation-1",
            cycle_id: "cycle-1",
            stage_code: "documents",
            trigger_event: "application_submitted",
            channel: "email",
            is_enabled: true,
            template_subject: "Asunto",
            template_body: "Cuerpo de prueba",
            created_at: "2026-01-01T00:00:00.000Z",
            updated_at: "2026-01-01T00:00:00.000Z",
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Agregar campo al final" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar configuración" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/cycles/cycle-1/stages/documents/config",
        expect.objectContaining({ method: "PATCH" }),
      );
    });
  });

  it("can insert a field between rows and send ordered payload", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          fields: [],
          automations: [],
        }),
        { status: 200 },
      ),
    );

    render(
      <StageConfigEditor
        cycleId="cycle-1"
        cycleName="Proceso 2026"
        stageCode="documents"
        stageLabel="Stage 1"
        initialFields={[
          {
            id: "field-1",
            cycle_id: "cycle-1",
            stage_code: "documents",
            field_key: "fullName",
            field_label: "Nombre completo",
            field_type: "short_text",
            is_required: true,
            placeholder: null,
            help_text: null,
            sort_order: 1,
            is_active: true,
            created_at: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "field-2",
            cycle_id: "cycle-1",
            stage_code: "documents",
            field_key: "schoolName",
            field_label: "Colegio",
            field_type: "short_text",
            is_required: true,
            placeholder: null,
            help_text: null,
            sort_order: 2,
            is_active: true,
            created_at: "2026-01-01T00:00:00.000Z",
          },
        ]}
        initialAutomations={[]}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: /Agregar campo en posición/i })[1]!);
    fireEvent.click(screen.getByRole("button", { name: "Guardar configuración" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const request = fetchMock.mock.calls.at(-1)?.[1];
    const payload = request && typeof request === "object" && "body" in request
      ? JSON.parse(String(request.body))
      : null;

    expect(payload?.fields).toHaveLength(3);
    expect(payload?.fields?.map((field: { sortOrder: number }) => field.sortOrder)).toEqual([1, 2, 3]);
  });

  it("shows insertion controls between each field and at the end", () => {
    render(
      <StageConfigEditor
        cycleId="cycle-1"
        cycleName="Proceso 2026"
        stageCode="documents"
        stageLabel="Stage 1"
        initialFields={[
          {
            id: "field-1",
            cycle_id: "cycle-1",
            stage_code: "documents",
            field_key: "fullName",
            field_label: "Nombre completo",
            field_type: "short_text",
            is_required: true,
            placeholder: null,
            help_text: null,
            sort_order: 1,
            is_active: true,
            created_at: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "field-2",
            cycle_id: "cycle-1",
            stage_code: "documents",
            field_key: "schoolName",
            field_label: "Colegio",
            field_type: "short_text",
            is_required: true,
            placeholder: null,
            help_text: null,
            sort_order: 2,
            is_active: true,
            created_at: "2026-01-01T00:00:00.000Z",
          },
        ]}
        initialAutomations={[]}
      />,
    );

    expect(screen.getAllByRole("button", { name: /Agregar campo en posición/i })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Agregar campo al final" })).toBeInTheDocument();
  });
});
