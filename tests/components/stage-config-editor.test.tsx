import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StageConfigEditor } from "@/components/stage-config-editor";
import type { CycleStageField, StageSection } from "@/types/domain";

afterEach(() => {
  vi.restoreAllMocks();
});

function makeOtherSection(overrides?: Partial<StageSection>): StageSection {
  return {
    id: "section-other",
    cycle_id: "cycle-1",
    stage_code: "documents",
    section_key: "other",
    title: "Otros campos",
    description: "",
    sort_order: 99,
    is_visible: true,
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeWizardReadyFields(): CycleStageField[] {
  return [
    {
      id: "field-id-doc",
      cycle_id: "cycle-1",
      stage_code: "documents",
      field_key: "dniUpload",
      field_label: "Documento DNI",
      field_type: "file",
      is_required: true,
      placeholder: null,
      help_text: null,
      sort_order: 1,
      is_active: true,
      section_id: null,
      ai_parser_config: {
        enabled: true,
        extractionInstructions: "Extrae datos de identidad.",
        expectedSchemaTemplate:
          "{\"fullName\":\"string\",\"birthYear\":\"int\",\"documentType\":\"string\",\"documentIssue\":\"string\"}",
        expectedOutputFields: [
          { key: "fullName", type: "text" },
          { key: "birthYear", type: "number" },
          { key: "documentType", type: "text" },
          { key: "documentIssue", type: "text" },
        ],
        strictSchema: true,
      },
      created_at: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "field-grades",
      cycle_id: "cycle-1",
      stage_code: "documents",
      field_key: "gradesOfficialDocument",
      field_label: "Certificado de notas",
      field_type: "file",
      is_required: true,
      placeholder: null,
      help_text: null,
      sort_order: 2,
      is_active: true,
      section_id: null,
      ai_parser_config: null,
      created_at: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "field-name",
      cycle_id: "cycle-1",
      stage_code: "documents",
      field_key: "fullName",
      field_label: "Nombre completo",
      field_type: "short_text",
      is_required: true,
      placeholder: null,
      help_text: null,
      sort_order: 3,
      is_active: true,
      section_id: null,
      ai_parser_config: null,
      created_at: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "field-average",
      cycle_id: "cycle-1",
      stage_code: "documents",
      field_key: "gradeAverage",
      field_label: "Promedio",
      field_type: "number",
      is_required: true,
      placeholder: null,
      help_text: null,
      sort_order: 4,
      is_active: true,
      section_id: null,
      ai_parser_config: null,
      created_at: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "field-auth",
      cycle_id: "cycle-1",
      stage_code: "documents",
      field_key: "signedAuthorization",
      field_label: "Autorización firmada",
      field_type: "file",
      is_required: true,
      placeholder: null,
      help_text: null,
      sort_order: 5,
      is_active: true,
      section_id: null,
      ai_parser_config: null,
      created_at: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "field-photo",
      cycle_id: "cycle-1",
      stage_code: "documents",
      field_key: "applicantPhoto",
      field_label: "Foto del postulante",
      field_type: "file",
      is_required: true,
      placeholder: null,
      help_text: null,
      sort_order: 6,
      is_active: true,
      section_id: null,
      ai_parser_config: null,
      created_at: "2026-01-01T00:00:00.000Z",
    },
  ];
}

describe("StageConfigEditor", () => {
  const stageTemplates = [
    {
      id: "template-docs",
      cycle_id: "cycle-1",
      stage_code: "documents",
      stage_label: "Documentos",
      milestone_label: "Recepción",
      due_at: null,
      ocr_prompt_template: null,
      sort_order: 1,
      created_at: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "template-exam",
      cycle_id: "cycle-1",
      stage_code: "exam_placeholder",
      stage_label: "Examen",
      milestone_label: "Evaluación",
      due_at: null,
      ocr_prompt_template: null,
      sort_order: 2,
      created_at: "2026-01-01T00:00:00.000Z",
    },
  ] as const;

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
          ocrPromptTemplate: "Prompt OCR",
        }),
        { status: 200 },
      ),
    );

    render(
      <StageConfigEditor
        cycleId="cycle-1"
        cycleName="Proceso 2026"
        stageId="template-docs"
        stageCode="documents"
        stageLabel="Stage 1"
        stageOpenAt={null}
        stageCloseAt={null}
        stageTemplates={[...stageTemplates]}
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
            section_id: null,
            created_at: "2026-01-01T00:00:00.000Z",
          },
        ]}
        initialSections={[makeOtherSection()]}
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
        initialOcrPromptTemplate="Prompt OCR"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Añadir nuevo campo" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar configuración" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/cycles/cycle-1/stages/template-docs/config",
        expect.objectContaining({ method: "PATCH" }),
      );
    });
  });

  it("can add a field from the section toolbar and send ordered payload", async () => {
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
        stageId="template-docs"
        stageCode="documents"
        stageLabel="Stage 1"
        stageOpenAt={null}
        stageCloseAt={null}
        stageTemplates={[...stageTemplates]}
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
            section_id: null,
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
            section_id: null,
            created_at: "2026-01-01T00:00:00.000Z",
          },
        ]}
        initialSections={[makeOtherSection()]}
        initialAutomations={[]}
        initialOcrPromptTemplate="Prompt OCR"
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Añadir nuevo campo" })[0]!);
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

  it("shows per-section add controls and the add-section action", () => {
    render(
      <StageConfigEditor
        cycleId="cycle-1"
        cycleName="Proceso 2026"
        stageId="template-docs"
        stageCode="documents"
        stageLabel="Stage 1"
        stageOpenAt={null}
        stageCloseAt={null}
        stageTemplates={[...stageTemplates]}
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
            section_id: null,
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
            section_id: null,
            created_at: "2026-01-01T00:00:00.000Z",
          },
        ]}
        initialSections={[makeOtherSection()]}
        initialAutomations={[]}
        initialOcrPromptTemplate="Prompt OCR"
      />,
    );

    expect(screen.getAllByRole("button", { name: "Añadir nuevo campo" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /\+ Añadir nueva sección/i })).toBeInTheDocument();
  });

  it("allows deleting the fallback section and persists an empty sections list", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          fields: [],
          sections: [],
          automations: [],
          settings: {
            stageName: "Stage 5",
            description: "",
            openDate: null,
            closeDate: null,
            previousStageRequirement: "none",
            blockIfPreviousNotMet: false,
          },
        }),
        { status: 200 },
      ),
    );
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(
      <StageConfigEditor
        cycleId="cycle-1"
        cycleName="Proceso 2026"
        stageId="template-stage-5"
        stageCode="custom_stage_5"
        stageLabel="Stage 5"
        stageOpenAt={null}
        stageCloseAt={null}
        stageTemplates={[...stageTemplates]}
        initialFields={[]}
        initialSections={[makeOtherSection({ title: "" })]}
        initialAutomations={[]}
        initialOcrPromptTemplate=""
      />,
    );

    const deleteButtons = screen.getAllByRole("button", { name: "Eliminar sección" });
    expect(deleteButtons[0]).not.toBeDisabled();
    fireEvent.click(deleteButtons[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Guardar configuración" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const request = fetchMock.mock.calls.at(-1)?.[1];
    const payload = request && typeof request === "object" && "body" in request
      ? JSON.parse(String(request.body))
      : null;

    expect(payload?.sections).toEqual([]);
  });

  it("sends a fallback section title when a section name is blank", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          fields: [],
          sections: [
            {
              id: "section-custom",
              cycle_id: "cycle-1",
              stage_code: "custom_stage_5",
              section_key: "custom",
              title: "Sección 1",
              description: "",
              sort_order: 1,
              is_visible: true,
              created_at: "2026-01-01T00:00:00.000Z",
            },
          ],
          automations: [],
          settings: {
            stageName: "Stage 5",
            description: "",
            openDate: null,
            closeDate: null,
            previousStageRequirement: "none",
            blockIfPreviousNotMet: false,
          },
        }),
        { status: 200 },
      ),
    );

    render(
      <StageConfigEditor
        cycleId="cycle-1"
        cycleName="Proceso 2026"
        stageId="template-stage-5"
        stageCode="custom_stage_5"
        stageLabel="Stage 5"
        stageOpenAt={null}
        stageCloseAt={null}
        stageTemplates={[...stageTemplates]}
        initialFields={[
          {
            id: "field-1",
            cycle_id: "cycle-1",
            stage_code: "custom_stage_5",
            field_key: "customField",
            field_label: "Campo",
            field_type: "short_text",
            is_required: false,
            placeholder: null,
            help_text: null,
            sort_order: 1,
            is_active: true,
            section_id: "section-custom",
            created_at: "2026-01-01T00:00:00.000Z",
          },
        ]}
        initialSections={[
          {
            ...makeOtherSection(),
            id: "section-custom",
            stage_code: "custom_stage_5",
            section_key: "custom",
            title: "",
            sort_order: 1,
          },
        ]}
        initialAutomations={[]}
        initialOcrPromptTemplate=""
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Añadir nuevo campo" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar configuración" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const request = fetchMock.mock.calls.at(-1)?.[1];
    const payload = request && typeof request === "object" && "body" in request
      ? JSON.parse(String(request.body))
      : null;

    expect(payload?.sections?.[0]?.title).toBe("Sección 1");
  });

  it("starts with all field editors collapsed", () => {
    render(
      <StageConfigEditor
        cycleId="cycle-1"
        cycleName="Proceso 2026"
        stageId="template-docs"
        stageCode="documents"
        stageLabel="Stage 1"
        stageOpenAt={null}
        stageCloseAt={null}
        stageTemplates={[...stageTemplates]}
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
            section_id: null,
            created_at: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "field-2",
            cycle_id: "cycle-1",
            stage_code: "documents",
            field_key: "dateOfBirth",
            field_label: "Fecha de nacimiento",
            field_type: "date",
            is_required: true,
            placeholder: null,
            help_text: null,
            sort_order: 2,
            is_active: true,
            section_id: null,
            created_at: "2026-01-01T00:00:00.000Z",
          },
        ]}
        initialSections={[makeOtherSection()]}
        initialAutomations={[]}
        initialOcrPromptTemplate="Prompt OCR"
      />,
    );

    expect(screen.queryByRole("button", { name: "Guardar Campo" })).not.toBeInTheDocument();
    expect(screen.getByText("Fecha de nacimiento")).toBeInTheDocument();
  });

  it("includes settings changes in the global save payload and save scope messaging", async () => {
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
          automations: [],
          ocrPromptTemplate: "Prompt OCR",
          settings: {
            stageName: "Formulario Principal (editado)",
            description: "Nueva descripción",
            openDate: "2026-02-17",
            closeDate: "2026-06-17",
            previousStageRequirement: "none",
            blockIfPreviousNotMet: true,
          },
        }),
        { status: 200 },
      ),
    );

    render(
      <StageConfigEditor
        cycleId="cycle-1"
        cycleName="Proceso 2026"
        stageId="template-docs"
        stageCode="documents"
        stageLabel="Stage 1"
        stageOpenAt="2026-02-17T00:00:00.000Z"
        stageCloseAt="2026-06-17T00:00:00.000Z"
        stageTemplates={[...stageTemplates]}
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
            section_id: null,
            created_at: "2026-01-01T00:00:00.000Z",
          },
        ]}
        initialSections={[makeOtherSection()]}
        initialAutomations={[]}
        initialOcrPromptTemplate="Prompt OCR"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^Ajustes y Reglas$/i }));
    fireEvent.change(screen.getByLabelText("Nombre de la etapa"), {
      target: { value: "Formulario Principal (editado)" },
    });

    const saveStatus = screen
      .getByText(/^Hay cambios sin guardar$/i)
      .closest(".admin-stage-save-status");
    expect(saveStatus).not.toBeNull();
    expect(saveStatus).toHaveTextContent(
      "Hay cambios sin guardar en Ajustes y Reglas. Previsualizar también los guarda.",
    );

    fireEvent.click(screen.getByRole("button", { name: "Guardar configuración" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/cycles/cycle-1/stages/template-docs/config",
        expect.objectContaining({ method: "PATCH" }),
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/^Configuración guardada$/i)).toBeInTheDocument();
    });
    expect(
      screen.queryByText(/Hay cambios sin guardar en Ajustes y Reglas/i),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Guardar configuración" }),
    ).toBeDisabled();

    const request = fetchMock.mock.calls.at(-1)?.[1];
    const payload =
      request && typeof request === "object" && "body" in request
        ? JSON.parse(String(request.body))
        : null;

    expect(payload?.settings).toMatchObject({
      stageName: "Formulario Principal (editado)",
      previousStageRequirement: "none",
      blockIfPreviousNotMet: true,
    });
  });

  it("keeps applicant instructions only under Ajustes y Reglas", () => {
    render(
      <StageConfigEditor
        cycleId="cycle-1"
        cycleName="Proceso 2026"
        stageId="template-docs"
        stageCode="documents"
        stageLabel="Formulario Principal"
        stageOpenAt={null}
        stageCloseAt={null}
        stageTemplates={[...stageTemplates]}
        initialFields={[]}
        initialSections={[makeOtherSection()]}
        initialAutomations={[]}
        initialOcrPromptTemplate=""
      />,
    );

    expect(screen.queryByText(/Paso inicial: Instrucciones/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Ajustes y Reglas$/i }));
    expect(screen.getByLabelText(/Instrucciones de la etapa \(Markdown\)/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Prompt OCR de la etapa/i)).not.toBeInTheDocument();
  });

  it("labels the automation tab clearly instead of generic communications", () => {
    render(
      <StageConfigEditor
        cycleId="cycle-1"
        cycleName="Proceso 2026"
        stageId="template-docs"
        stageCode="documents"
        stageLabel="Formulario Principal"
        stageOpenAt={null}
        stageCloseAt={null}
        stageTemplates={[...stageTemplates]}
        initialFields={[]}
        initialSections={[makeOtherSection()]}
        initialAutomations={[]}
        initialOcrPromptTemplate=""
      />,
    );

    expect(screen.getByRole("button", { name: /^Automatizaciones$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Comunicaciones$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Prompt Studio$/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Automatizaciones$/i }));
    fireEvent.click(screen.getByRole("button", { name: /\+ Nueva Notificación/i }));
    expect(screen.getByLabelText(/Variables disponibles para el asunto/i)).toBeInTheDocument();
    expect(screen.queryByText("Variables para plantillas automáticas")).not.toBeInTheDocument();
  });

  it("opens Prompt Studio inside the same stage shell from Ajustes y Reglas", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          runs: [],
        }),
        { status: 200 },
      ),
    );

    render(
      <StageConfigEditor
        cycleId="cycle-1"
        cycleName="Proceso 2026"
        stageId="template-docs"
        stageCode="documents"
        stageLabel="Formulario Principal"
        stageOpenAt={null}
        stageCloseAt={null}
        stageTemplates={[...stageTemplates]}
        initialFields={[]}
        initialSections={[makeOtherSection()]}
        initialAutomations={[]}
        initialOcrPromptTemplate="Prompt OCR"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^Prompt Studio$/i }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /^Prompt Studio$/i })).toBeInTheDocument();
      expect(screen.getByText(/Sin pruebas anteriores\./i)).toBeInTheDocument();
    });
  });

  it("renames a section from the section toolbar pencil action", () => {
    const promptMock = vi.spyOn(window, "prompt").mockReturnValue("Identidad actualizada");

    render(
      <StageConfigEditor
        cycleId="cycle-1"
        cycleName="Proceso 2026"
        stageId="template-docs"
        stageCode="documents"
        stageLabel="Formulario Principal"
        stageOpenAt={null}
        stageCloseAt={null}
        stageTemplates={[...stageTemplates]}
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
            section_id: "section-identity",
            created_at: "2026-01-01T00:00:00.000Z",
          },
        ]}
        initialSections={[
          {
            id: "section-identity",
            cycle_id: "cycle-1",
            stage_code: "documents",
            section_key: "identity",
            title: "Datos personales",
            description: "",
            sort_order: 1,
            is_visible: true,
            created_at: "2026-01-01T00:00:00.000Z",
          },
          makeOtherSection({ sort_order: 2 }),
        ]}
        initialAutomations={[]}
        initialOcrPromptTemplate="Prompt OCR"
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Editar nombre de sección" })[0]!);

    expect(promptMock).toHaveBeenCalledWith("Nuevo nombre de la sección", "Datos personales");
    expect(screen.getByText("Sección 1: Identidad actualizada")).toBeInTheDocument();
  });

  it("appends a newly created section at the end of the section list", () => {
    const { container } = render(
      <StageConfigEditor
        cycleId="cycle-1"
        cycleName="Proceso 2026"
        stageId="template-docs"
        stageCode="documents"
        stageLabel="Formulario Principal"
        stageOpenAt={null}
        stageCloseAt={null}
        stageTemplates={[...stageTemplates]}
        initialFields={[
          {
            id: "field-a",
            cycle_id: "cycle-1",
            stage_code: "documents",
            field_key: "fullName",
            field_label: "Nombre",
            field_type: "short_text",
            is_required: true,
            placeholder: null,
            help_text: null,
            sort_order: 1,
            is_active: true,
            section_id: "section-a",
            created_at: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "field-b",
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
            section_id: "section-b",
            created_at: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "field-other",
            cycle_id: "cycle-1",
            stage_code: "documents",
            field_key: "legacyExtra",
            field_label: "Otro",
            field_type: "short_text",
            is_required: false,
            placeholder: null,
            help_text: null,
            sort_order: 3,
            is_active: true,
            section_id: "section-other",
            created_at: "2026-01-01T00:00:00.000Z",
          },
        ]}
        initialSections={[
          {
            id: "section-a",
            cycle_id: "cycle-1",
            stage_code: "documents",
            section_key: "identity",
            title: "Sección A",
            description: "",
            sort_order: 1,
            is_visible: true,
            created_at: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "section-b",
            cycle_id: "cycle-1",
            stage_code: "documents",
            section_key: "family",
            title: "Sección B",
            description: "",
            sort_order: 2,
            is_visible: true,
            created_at: "2026-01-01T00:00:00.000Z",
          },
          makeOtherSection({ sort_order: 99 }),
        ]}
        initialAutomations={[]}
        initialOcrPromptTemplate="Prompt OCR"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /\+ Añadir nueva sección/i }));

    const sectionHeadings = Array.from(
      container.querySelectorAll(".admin-stage-section-heading-row .builder-section-title"),
    )
      .map((node) => node.textContent?.trim() ?? "")
      .filter(Boolean);

    expect(sectionHeadings.at(-1)).toBe("Sección 4: Nueva sección 4");
  });

  it("persists optional group name for fields", async () => {
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
              group_name: "Identidad",
              sort_order: 1,
              is_active: true,
              section_id: "section-other",
              created_at: "2026-01-01T00:00:00.000Z",
            },
          ],
          sections: [makeOtherSection()],
          automations: [],
          ocrPromptTemplate: null,
        }),
        { status: 200 },
      ),
    );

    render(
      <StageConfigEditor
        cycleId="cycle-1"
        cycleName="Proceso 2026"
        stageId="template-docs"
        stageCode="documents"
        stageLabel="Formulario Principal"
        stageOpenAt={null}
        stageCloseAt={null}
        stageTemplates={[...stageTemplates]}
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
            group_name: null,
            sort_order: 1,
            is_active: true,
            section_id: "section-other",
            created_at: "2026-01-01T00:00:00.000Z",
          },
        ]}
        initialSections={[makeOtherSection()]}
        initialAutomations={[]}
        initialOcrPromptTemplate=""
      />,
    );

    fireEvent.click(screen.getByText("Nombre completo"));
    const groupNameInput = screen.getByLabelText(/Nombre de grupo \(opcional\)/i);
    fireEvent.change(groupNameInput, { target: { value: "Identidad" } });
    fireEvent.blur(groupNameInput);
    fireEvent.click(screen.getByRole("button", { name: "Guardar configuración" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const request = fetchMock.mock.calls.at(-1)?.[1];
    const payload =
      request && typeof request === "object" && "body" in request
        ? JSON.parse(String(request.body))
        : null;

    expect(payload?.fields?.[0]?.groupName).toBe("Identidad");
  });

  it("opens the communications center inside the same stage shell from Automatizaciones", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          logs: [],
          campaigns: [],
          summary: {
            queued: 0,
            processing: 0,
            sent: 0,
            failed: 0,
            total: 0,
          },
        }),
        { status: 200 },
      ),
    );

    render(
      <StageConfigEditor
        cycleId="cycle-1"
        cycleName="Proceso 2026"
        stageId="template-docs"
        stageCode="documents"
        stageLabel="Formulario Principal"
        stageOpenAt={null}
        stageCloseAt={null}
        stageTemplates={[...stageTemplates]}
        initialFields={[]}
        initialSections={[makeOtherSection()]}
        initialAutomations={[]}
        initialOcrPromptTemplate="Prompt OCR"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^Automatizaciones$/i }));
    fireEvent.click(screen.getByRole("button", { name: /Abrir centro de comunicaciones/i }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Centro de comunicaciones/i })).toBeInTheDocument();
    });
  });

  it("persists custom sections and field-section assignments in the global save payload", async () => {
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
          automations: [],
          customSections: [
            { id: "custom-section-1", title: "Sección personalizada", order: 1 },
          ],
          fieldSectionAssignments: {
            customSectionField8: "custom-section-1",
          },
          settings: {
            stageName: "Formulario Principal",
            description: "",
            openDate: null,
            closeDate: null,
            previousStageRequirement: "none",
            blockIfPreviousNotMet: true,
          },
        }),
        { status: 200 },
      ),
    );

    render(
      <StageConfigEditor
        cycleId="cycle-1"
        cycleName="Proceso 2026"
        stageId="template-docs"
        stageCode="documents"
        stageLabel="Stage 1"
        stageOpenAt={null}
        stageCloseAt={null}
        stageTemplates={[...stageTemplates]}
        initialFields={[
          {
            id: "field-identity",
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
            section_id: null,
            created_at: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "field-family",
            cycle_id: "cycle-1",
            stage_code: "documents",
            field_key: "guardian1FullName",
            field_label: "Apoderado",
            field_type: "short_text",
            is_required: true,
            placeholder: null,
            help_text: null,
            sort_order: 2,
            is_active: true,
            section_id: null,
            created_at: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "field-school",
            cycle_id: "cycle-1",
            stage_code: "documents",
            field_key: "schoolName",
            field_label: "Colegio",
            field_type: "short_text",
            is_required: true,
            placeholder: null,
            help_text: null,
            sort_order: 3,
            is_active: true,
            section_id: null,
            created_at: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "field-motivation",
            cycle_id: "cycle-1",
            stage_code: "documents",
            field_key: "essay",
            field_label: "Ensayo",
            field_type: "long_text",
            is_required: true,
            placeholder: null,
            help_text: null,
            sort_order: 4,
            is_active: true,
            section_id: null,
            created_at: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "field-recommenders",
            cycle_id: "cycle-1",
            stage_code: "documents",
            field_key: "recommenderRequestMessage",
            field_label: "Mensaje",
            field_type: "long_text",
            is_required: false,
            placeholder: null,
            help_text: null,
            sort_order: 5,
            is_active: true,
            section_id: null,
            created_at: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "field-docs",
            cycle_id: "cycle-1",
            stage_code: "documents",
            field_key: "paymentOperationNumber",
            field_label: "Pago",
            field_type: "short_text",
            is_required: false,
            placeholder: null,
            help_text: null,
            sort_order: 6,
            is_active: true,
            section_id: null,
            created_at: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "field-other",
            cycle_id: "cycle-1",
            stage_code: "documents",
            field_key: "legacyExtra",
            field_label: "Otro",
            field_type: "short_text",
            is_required: false,
            placeholder: null,
            help_text: null,
            sort_order: 7,
            is_active: true,
            section_id: null,
            created_at: "2026-01-01T00:00:00.000Z",
          },
        ]}
        initialSections={[makeOtherSection()]}
        initialAutomations={[]}
        initialOcrPromptTemplate="Prompt OCR"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /\+ Añadir nueva sección/i }));
    fireEvent.change(screen.getByLabelText("Nombre de la sección"), {
      target: { value: "Sección personalizada" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Añadir nuevo campo en esta sección" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Guardar configuración" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const request = fetchMock.mock.calls.at(-1)?.[1];
    const payload =
      request && typeof request === "object" && "body" in request
        ? JSON.parse(String(request.body))
        : null;

    // Verify the sections payload includes the custom section with the edited title
    expect(payload?.sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: "Sección personalizada" }),
      ]),
    );
    // Verify the new field has a sectionKey matching the new section
    const newField = payload?.fields?.find((f: { fieldKey: string }) => f.fieldKey?.startsWith("custom"));
    expect(newField).toBeTruthy();
  });

  it("persists per-file AI parser config and clears it when field type changes", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            fields: [
              {
                id: "field-file",
                cycle_id: "cycle-1",
                stage_code: "documents",
                field_key: "identificationDocument",
                field_label: "Documento de identidad",
                field_type: "file",
                is_required: true,
                placeholder: null,
                help_text: null,
                sort_order: 1,
                is_active: true,
                section_id: null,
                created_at: "2026-01-01T00:00:00.000Z",
              },
            ],
            sections: [makeOtherSection()],
            automations: [],
            ocrPromptTemplate: "Prompt OCR",
          }),
          { status: 200 },
        ),
      ),
    );

    render(
      <StageConfigEditor
        cycleId="cycle-1"
        cycleName="Proceso 2026"
        stageId="template-docs"
        stageCode="documents"
        stageLabel="Formulario Principal"
        stageOpenAt={null}
        stageCloseAt={null}
        stageTemplates={[...stageTemplates]}
        initialFields={[
          {
            id: "field-file",
            cycle_id: "cycle-1",
            stage_code: "documents",
            field_key: "identificationDocument",
            field_label: "Documento de identidad",
            field_type: "file",
            is_required: true,
            placeholder: null,
            help_text: null,
            sort_order: 1,
            is_active: true,
            section_id: null,
            created_at: "2026-01-01T00:00:00.000Z",
          },
        ]}
        initialSections={[makeOtherSection()]}
        initialAutomations={[]}
        initialOcrPromptTemplate="Prompt OCR"
      />,
    );

    fireEvent.click(screen.getByText("Documento de identidad"));
    fireEvent.click(
      screen.getByRole("checkbox", { name: /Habilitar parsing IA para Documento de identidad/i }),
    );
    fireEvent.change(screen.getByRole("textbox", { name: /Instrucciones de extracción/i }), {
      target: { value: "Extrae solo número de documento y nombre completo." },
    });
    fireEvent.click(screen.getByText(/Opciones avanzadas/i));
    fireEvent.change(screen.getByRole("textbox", { name: /Esquema JSON esperado \(avanzado\)/i }), {
      target: { value: "{\"document_number\":\"string\",\"birth-year\":\"int\"}" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar configuración" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const firstRequest = fetchMock.mock.calls.at(-1)?.[1];
    const firstPayload =
      firstRequest && typeof firstRequest === "object" && "body" in firstRequest
        ? JSON.parse(String(firstRequest.body))
        : null;

    expect(firstPayload?.fields?.[0]?.aiParser).toMatchObject({
      enabled: true,
      extractionInstructions: "Extrae solo número de documento y nombre completo.",
      expectedSchemaTemplate: "{\"document_number\":\"string\",\"birth-year\":\"int\"}",
      expectedOutputFields: [
        { key: "document_number", type: "text" },
        { key: "birth-year", type: "number" },
      ],
      strictSchema: true,
    });

    fireEvent.change(screen.getByLabelText(/Tipo de campo/i), {
      target: { value: "short_text" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar configuración" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const secondRequest = fetchMock.mock.calls.at(-1)?.[1];
    const secondPayload =
      secondRequest && typeof secondRequest === "object" && "body" in secondRequest
        ? JSON.parse(String(secondRequest.body))
        : null;
    expect(secondPayload?.fields?.[0]?.aiParser).toBeNull();
  });

  it("does not show AI parser controls for non-file fields", () => {
    render(
      <StageConfigEditor
        cycleId="cycle-1"
        cycleName="Proceso 2026"
        stageId="template-docs"
        stageCode="documents"
        stageLabel="Formulario Principal"
        stageOpenAt={null}
        stageCloseAt={null}
        stageTemplates={[...stageTemplates]}
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
            section_id: null,
            created_at: "2026-01-01T00:00:00.000Z",
          },
        ]}
        initialSections={[makeOtherSection()]}
        initialAutomations={[]}
        initialOcrPromptTemplate="Prompt OCR"
      />,
    );

    fireEvent.click(screen.getByText("Nombre completo"));
    expect(
      screen.queryByRole("checkbox", { name: /Habilitar parsing IA para Nombre completo/i }),
    ).not.toBeInTheDocument();
  });

  it("keeps advanced rubric mode disabled with a coming soon label", () => {
    render(
      <StageConfigEditor
        cycleId="cycle-1"
        cycleName="Proceso 2026"
        stageId="template-docs"
        stageCode="documents"
        stageLabel="Formulario Principal"
        stageOpenAt={null}
        stageCloseAt={null}
        stageTemplates={[...stageTemplates]}
        initialFields={makeWizardReadyFields()}
        initialSections={[makeOtherSection()]}
        initialAutomations={[]}
        initialOcrPromptTemplate="Prompt OCR"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^Ajustes y Reglas$/i }));
    expect(screen.getByRole("button", { name: /Advanced \(próximamente\)/i })).toBeDisabled();
  });

  it("supports multi-year birth input and persists editable wizard policy values", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          fields: makeWizardReadyFields(),
          sections: [makeOtherSection()],
          automations: [],
          settings: {
            stageName: "Formulario Principal",
            description: "",
            openDate: null,
            closeDate: null,
            previousStageRequirement: "none",
            blockIfPreviousNotMet: true,
          },
        }),
        { status: 200 },
      ),
    );

    render(
      <StageConfigEditor
        cycleId="cycle-1"
        cycleName="Proceso 2026"
        stageId="template-docs"
        stageCode="documents"
        stageLabel="Formulario Principal"
        stageOpenAt={null}
        stageCloseAt={null}
        stageTemplates={[...stageTemplates]}
        initialFields={makeWizardReadyFields()}
        initialSections={[makeOtherSection()]}
        initialAutomations={[]}
        initialOcrPromptTemplate="Prompt OCR"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^Ajustes y Reglas$/i }));
    for (const checkbox of screen.getAllByRole("checkbox", { name: /Documento DNI/i })) {
      if (!(checkbox as HTMLInputElement).checked) {
        fireEvent.click(checkbox);
      }
    }
    for (const checkbox of screen.getAllByRole("checkbox", { name: /Certificado de notas/i })) {
      if (!(checkbox as HTMLInputElement).checked) {
        fireEvent.click(checkbox);
      }
    }
    fireEvent.change(screen.getByLabelText(/Nombre postulante/i), {
      target: { value: "fullName" },
    });
    fireEvent.change(screen.getByLabelText(/Promedio manual/i), {
      target: { value: "gradeAverage" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: /Autorización firmada/i }), {
      target: { value: "signedAuthorization" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: /Foto del postulante/i }), {
      target: { value: "applicantPhoto" },
    });
    fireEvent.change(screen.getByLabelText(/Campo OCR: nombre/i), {
      target: { value: "fullName" },
    });
    fireEvent.change(screen.getByLabelText(/Campo OCR: año de nacimiento/i), {
      target: { value: "birthYear" },
    });
    fireEvent.change(screen.getByLabelText(/Campo OCR: tipo de documento/i), {
      target: { value: "documentType" },
    });
    fireEvent.change(screen.getByLabelText(/Campo OCR: excepción de documento/i), {
      target: { value: "documentIssue" },
    });

    fireEvent.click(screen.getByRole("button", { name: /^Continuar$/i }));

    const birthYearsInput = screen.getByLabelText(/Años de nacimiento permitidos/i);
    fireEvent.change(birthYearsInput, {
      target: { value: "2008, 2009 2010" },
    });
    expect(birthYearsInput).toHaveValue("2008, 2009 2010");

    fireEvent.change(screen.getByLabelText(/Política de recomendaciones/i), {
      target: { value: "minimum_answers" },
    });
    fireEvent.change(screen.getByLabelText(/Respuestas mínimas por recomendación/i), {
      target: { value: "2" },
    });
    fireEvent.change(screen.getByLabelText(/Múltiples certificados de notas/i), {
      target: { value: "single_or_not_eligible" },
    });
    fireEvent.change(screen.getByLabelText(/Excepciones de documento de identidad/i), {
      target: { value: "not_eligible" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Continuar$/i }));

    expect(screen.getByText(/m[ií]nimo 2 respuesta/i)).toBeInTheDocument();
    expect(screen.getByText(/Múltiples certificados de notas/i)).toBeInTheDocument();
    expect(screen.getByText(/Excepciones de documento de identidad/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Activar rúbrica de esta etapa/i }));
    fireEvent.click(screen.getByRole("button", { name: /Guardar configuración/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/cycles/cycle-1/stages/template-docs/config",
        expect.objectContaining({ method: "PATCH" }),
      );
    });

    const request = fetchMock.mock.calls.at(-1)?.[1];
    const payload =
      request && typeof request === "object" && "body" in request
        ? JSON.parse(String(request.body))
        : null;

    expect(payload?.settings?.rubricBlueprintV1?.policy).toMatchObject({
      allowedBirthYears: [2008, 2009, 2010],
      recommendationCompleteness: "minimum_answers",
      recommendationMinAnswers: 2,
      gradesCombinationRule: "single_or_not_eligible",
      idExceptionRule: "not_eligible",
    });
  });
});
