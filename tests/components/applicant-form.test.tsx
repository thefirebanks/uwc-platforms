import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApplicantApplicationForm } from "@/components/applicant-application-form";
import type { CycleStageField, StageSection } from "@/types/domain";

/* ── Shared fixtures ───────────────────────────────────────── */

function makeSection(overrides: Partial<StageSection> & { section_key: string; title: string; sort_order: number }): StageSection {
  return {
    id: `section-${overrides.section_key}`,
    cycle_id: "cycle-1",
    stage_code: "documents",
    description: "",
    is_visible: true,
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const DEFAULT_SECTIONS: StageSection[] = [
  makeSection({ section_key: "eligibility", title: "Elegibilidad", sort_order: 1 }),
  makeSection({ section_key: "identity", title: "Datos personales", sort_order: 2 }),
  makeSection({ section_key: "family", title: "Familia y apoderados", sort_order: 3 }),
  makeSection({ section_key: "school", title: "Colegio y notas", sort_order: 4 }),
  makeSection({ section_key: "motivation", title: "Motivación", sort_order: 5 }),
  makeSection({ section_key: "recommenders", title: "Datos de recomendadores", sort_order: 6 }),
  makeSection({ section_key: "documents", title: "Pago y soporte", sort_order: 7 }),
  makeSection({ section_key: "other", title: "Campos adicionales", sort_order: 8 }),
];

function makeField(overrides: Partial<CycleStageField> & { field_key: string; field_label: string; sort_order: number }): CycleStageField {
  return {
    id: `field-${overrides.field_key}`,
    cycle_id: "cycle-1",
    stage_code: "documents",
    field_type: "short_text",
    is_required: false,
    placeholder: null,
    help_text: null,
    is_active: true,
    section_id: null,
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const DEFAULT_STAGE_FIELDS: CycleStageField[] = [
  makeField({ field_key: "eligibilityBirthYear", field_label: "Año de nacimiento", sort_order: 1, section_id: "section-eligibility", is_required: true }),
  makeField({ field_key: "fullName", field_label: "Nombre completo", sort_order: 2, section_id: "section-identity", is_required: true }),
  makeField({ field_key: "dateOfBirth", field_label: "Fecha de nacimiento", sort_order: 3, section_id: "section-identity", field_type: "date", is_required: true }),
  makeField({ field_key: "nationality", field_label: "Nacionalidad", sort_order: 4, section_id: "section-identity" }),
  makeField({ field_key: "guardian1FullName", field_label: "Apoderado 1", sort_order: 5, section_id: "section-family" }),
  makeField({ field_key: "schoolName", field_label: "Información del colegio - Colegio", sort_order: 6, section_id: "section-school" }),
  makeField({ field_key: "essay", field_label: "Hoja de vida e interés en UWC - Ensayo", sort_order: 7, section_id: "section-motivation", field_type: "long_text", is_required: true }),
  makeField({ field_key: "identificationDocument", field_label: "Documentos - Documento de identidad", sort_order: 8, section_id: "section-documents", field_type: "file", is_required: true }),
];

const DRAFT_APP = {
  id: "app-draft",
  applicant_id: "user-1",
  cycle_id: "cycle-1",
  stage_code: "documents" as const,
  status: "draft" as const,
  payload: {
    fullName: "Applicant Demo",
    dateOfBirth: "2009-03-14",
    nationality: "Peruana",
    schoolName: "Colegio Demo",
    gradeAverage: 16.2,
    essay: "Este es un ensayo de prueba suficientemente largo para pasar la validacion.",
  },
  files: {},
  validation_notes: null,
  error_report_count: 0,
  created_at: "2026-02-18T20:00:00.000Z",
  updated_at: "2026-02-18T20:00:00.000Z",
};

describe("ApplicantApplicationForm", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps submit disabled until a draft exists", async () => {
    render(<ApplicantApplicationForm existingApplication={null} cycleId="cycle-1" />);

    expect(screen.getAllByText("Instrucciones").length).toBeGreaterThanOrEqual(1);

    fireEvent.click(screen.getByRole("button", { name: /Revisión y envío/i }));
    // Both the inline submit button and the action bar show "Enviar postulación" on last step
    const submitButtons = screen.getAllByRole("button", { name: /Enviar postulación/i });
    expect(submitButtons.length).toBeGreaterThanOrEqual(1);
    expect(submitButtons[0]).toBeDisabled();
    expect(screen.getByText("Progreso por secciones")).toBeInTheDocument();
  });

  it("locks submitted forms until user enables edit mode", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ recommenders: [] }), { status: 200 }),
    );

    render(
      <ApplicantApplicationForm
        cycleId="cycle-1"
        sections={DEFAULT_SECTIONS}
        stageFields={DEFAULT_STAGE_FIELDS}
        existingApplication={{
          id: "app-1",
          applicant_id: "user-1",
          cycle_id: "cycle-1",
          stage_code: "documents",
          status: "submitted",
          payload: {
            fullName: "Applicant Demo",
            dateOfBirth: "2009-03-14",
            nationality: "Peruana",
            schoolName: "Colegio Demo",
            gradeAverage: 16.2,
            essay: "Este es un ensayo de prueba suficientemente largo para pasar la validación.",
          },
          files: {},
          validation_notes: null,
          error_report_count: 0,
          created_at: "2026-02-18T20:00:00.000Z",
          updated_at: "2026-02-18T20:00:00.000Z",
        }}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: /Datos personales/i })[0]);
    const dobInput = screen.getByLabelText(/Fecha de nacimiento/i);
    expect(dobInput).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Editar respuesta" }));

    expect(await screen.findByText(/Modo: edición manual habilitada/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Fecha de nacimiento/i)).not.toBeDisabled();
  });

  it("shows previously registered recommenders from API", async () => {
    render(
      <ApplicantApplicationForm
        cycleId="cycle-2"
        sections={DEFAULT_SECTIONS}
        stageFields={DEFAULT_STAGE_FIELDS}
        initialRecommenders={[
          {
            id: "rec-mentor",
            role: "mentor",
            email: "mentor@example.com",
            status: "sent",
            submittedAt: null,
            inviteSentAt: "2026-02-18T20:00:00.000Z",
            openedAt: null,
            startedAt: null,
            reminderCount: 0,
            lastReminderAt: null,
            invalidatedAt: null,
            createdAt: "2026-02-18T20:00:00.000Z",
          },
          {
            id: "rec-friend",
            role: "friend",
            email: "amigo@example.com",
            status: "sent",
            submittedAt: null,
            inviteSentAt: "2026-02-18T20:00:00.000Z",
            openedAt: null,
            startedAt: null,
            reminderCount: 0,
            lastReminderAt: null,
            invalidatedAt: null,
            createdAt: "2026-02-18T20:00:00.000Z",
          },
        ]}
        existingApplication={{
          id: "app-2",
          applicant_id: "user-1",
          cycle_id: "cycle-1",
          stage_code: "documents",
          status: "draft",
          payload: {
            fullName: "Applicant Demo",
            dateOfBirth: "2009-03-14",
            nationality: "Peruana",
            schoolName: "Colegio Demo",
            gradeAverage: 16.2,
            essay: "Este es un ensayo de prueba suficientemente largo para pasar la validación.",
          },
          files: {},
          validation_notes: null,
          error_report_count: 0,
          created_at: "2026-02-18T20:00:00.000Z",
          updated_at: "2026-02-18T20:00:00.000Z",
        }}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: /Recomendadores/i })[0]);
    expect(await screen.findByDisplayValue("mentor@example.com")).toBeInTheDocument();
    expect(screen.getByDisplayValue("amigo@example.com")).toBeInTheDocument();
  });

  it("reports registered recommenders accurately when invite emails fail", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            recommenders: [
              {
                id: "rec-mentor",
                role: "mentor",
                email: "mentor@example.com",
                status: "invited",
                submittedAt: null,
                inviteSentAt: null,
                openedAt: null,
                startedAt: null,
                reminderCount: 0,
                lastReminderAt: null,
                invalidatedAt: null,
                createdAt: "2026-02-18T20:00:00.000Z",
              }
            ],
            createdCount: 1,
            replacedCount: 0,
            failedEmailCount: 1,
          }),
          { status: 200 },
        ),
      ),
    );

    render(
      <ApplicantApplicationForm
        cycleId="cycle-2"
        sections={DEFAULT_SECTIONS}
        stageFields={DEFAULT_STAGE_FIELDS}
        existingApplication={DRAFT_APP}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: /Recomendadores/i })[0]);
    fireEvent.change(screen.getByLabelText(/Correo \(Tutor\/Profesor\/Mentor\)/i), {
      target: { value: "mentor@example.com" },
    });

    fireEvent.click(screen.getAllByRole("button", { name: /Guardar y enviar/i })[0]);

    expect(
      await screen.findByText(/Tutor\/Profesor\/Mentor registrado, pero el correo no salió/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reintentar envío/i })).toBeInTheDocument();
  });

  it("allows saving a single recommender without requiring the second one yet", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url === "/api/recommendations" && init?.method === "PUT") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              recommenders: [
                {
                  id: "rec-mentor",
                  role: "mentor",
                  email: "mentor@example.com",
                  status: "sent",
                  submittedAt: null,
                  inviteSentAt: "2026-02-18T20:00:00.000Z",
                  openedAt: null,
                  startedAt: null,
                  reminderCount: 0,
                  lastReminderAt: null,
                  invalidatedAt: null,
                  createdAt: "2026-02-18T20:00:00.000Z",
                },
              ],
              createdCount: 1,
              replacedCount: 0,
              failedEmailCount: 0,
            }),
            { status: 200 },
          ),
        );
      }

      return Promise.resolve(new Response(JSON.stringify({ recommenders: [] }), { status: 200 }));
    });

    render(
      <ApplicantApplicationForm
        cycleId="cycle-2"
        sections={DEFAULT_SECTIONS}
        stageFields={DEFAULT_STAGE_FIELDS}
        existingApplication={DRAFT_APP}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: /Recomendadores/i })[0]);
    fireEvent.change(screen.getByLabelText(/Correo \(Tutor\/Profesor\/Mentor\)/i), {
      target: { value: "mentor@example.com" },
    });

    fireEvent.click(screen.getAllByRole("button", { name: /Guardar y enviar/i })[0]);

    await screen.findByText(/Invitación enviada a mentor@example\.com\./i);
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/recommendations",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          applicationId: "app-draft",
          recommenders: [{ role: "mentor", email: "mentor@example.com" }],
        }),
      }),
    );
  });

  it("blocks applicants from registering themselves as a recommender", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ recommenders: [] }), { status: 200 }),
    );

    render(
      <ApplicantApplicationForm
        cycleId="cycle-2"
        sections={DEFAULT_SECTIONS}
        stageFields={DEFAULT_STAGE_FIELDS}
        existingApplication={DRAFT_APP}
        accountEmail="applicant@example.com"
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: /Recomendadores/i })[0]);
    fireEvent.change(screen.getByLabelText(/Correo \(Tutor\/Profesor\/Mentor\)/i), {
      target: { value: " applicant@example.com " },
    });
    fireEvent.change(screen.getByLabelText(/Correo \(Amigo/i), {
      target: { value: "friend@example.com" },
    });

    fireEvent.click(screen.getAllByRole("button", { name: /Guardar y enviar/i })[0]);

    expect(
      await screen.findByText(
        "No puedes registrarte como tu propio recomendador. Usa dos correos distintos al de tu cuenta.",
      ),
    ).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalledWith(
      "/api/recommendations",
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("shows the server configuration error and error id when recommender registration fails on the backend", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url === "/api/recommendations" && init?.method === "PUT") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              message: "Falta configuración del servidor. Contacta al administrador con este error.",
              errorId: "err-rec-config",
            }),
            { status: 500 },
          ),
        );
      }

      return Promise.resolve(new Response(JSON.stringify({ recommenders: [] }), { status: 200 }));
    });

    render(
      <ApplicantApplicationForm
        cycleId="cycle-2"
        sections={DEFAULT_SECTIONS}
        stageFields={DEFAULT_STAGE_FIELDS}
        existingApplication={DRAFT_APP}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: /Recomendadores/i })[0]);
    fireEvent.change(screen.getByLabelText(/Correo \(Tutor\/Profesor\/Mentor\)/i), {
      target: { value: "mentor@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/Correo \(Amigo/i), {
      target: { value: "friend@example.com" },
    });

    fireEvent.click(screen.getAllByRole("button", { name: /Guardar y enviar/i })[0]);

    expect(
      await screen.findByText(
        "Falta configuración del servidor. Contacta al administrador con este error.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Error ID: err-rec-config/i)).toBeInTheDocument();
  });

  it("shows reminder-only controls after a recommender was already invited until the email changes", async () => {
    render(
      <ApplicantApplicationForm
        cycleId="cycle-reminder-ui"
        sections={DEFAULT_SECTIONS}
        stageFields={DEFAULT_STAGE_FIELDS}
        existingApplication={DRAFT_APP}
        initialRecommenders={[
          {
            id: "rec-mentor",
            role: "mentor",
            email: "mentor@example.com",
            status: "sent",
            submittedAt: null,
            inviteSentAt: "2026-02-18T20:00:00.000Z",
            openedAt: null,
            startedAt: null,
            reminderCount: 0,
            lastReminderAt: null,
            invalidatedAt: null,
            createdAt: "2026-02-18T20:00:00.000Z",
          },
        ]}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: /Recomendadores/i })[0]);

    expect(screen.queryByRole("button", { name: /Guardar y reenviar/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Enviar recordatorio/i })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Correo \(Tutor\/Profesor\/Mentor\)/i), {
      target: { value: "nuevo-mentor@example.com" },
    });

    expect(screen.getByRole("button", { name: /Guardar y reenviar/i })).toBeInTheDocument();
  });

  it("shows progress summary based on submitted state", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ recommenders: [] }), { status: 200 }),
    );

    render(
      <ApplicantApplicationForm
        cycleId="cycle-3"
        sections={DEFAULT_SECTIONS}
        stageFields={DEFAULT_STAGE_FIELDS}
        existingApplication={{
          id: "app-3",
          applicant_id: "user-1",
          cycle_id: "cycle-1",
          stage_code: "documents",
          status: "submitted",
          payload: {
            fullName: "Applicant Demo",
            dateOfBirth: "2009-03-14",
            nationality: "Peruana",
            schoolName: "Colegio Demo",
            gradeAverage: 16.2,
            essay: "Este es un ensayo de prueba suficientemente largo para pasar la validación.",
          },
          files: {
            identificationDocument: "bucket/path/file.pdf",
          },
          validation_notes: null,
          error_report_count: 0,
          created_at: "2026-02-18T20:00:00.000Z",
          updated_at: "2026-02-18T20:00:00.000Z",
        }}
      />,
    );

    // Sidebar always shows progress label (e.g. "3 de 7 completado")
    expect(screen.getAllByText(/\d+ de \d+ completado/).length).toBeGreaterThanOrEqual(1);

    // Navigate to review_submit to see the full section progress summary
    fireEvent.click(screen.getAllByRole("button", { name: /Revisión y envío/i })[0]);
    expect(screen.getByText("Progreso por secciones")).toBeInTheDocument();
  });

  it("shows instructions first even when a draft already exists", () => {
    render(
      <ApplicantApplicationForm
        cycleId="cycle-resume"
        sections={DEFAULT_SECTIONS}
        stageFields={DEFAULT_STAGE_FIELDS}
        existingApplication={DRAFT_APP}
      />,
    );

    expect(screen.getAllByText(/Instrucciones/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Checklist rápida de preparación/i)).toBeInTheDocument();
  });

  it("does not mark documents/recommenders/review as in-progress for an untouched draft", () => {
    render(
      <ApplicantApplicationForm
        cycleId="cycle-review-status"
        sections={DEFAULT_SECTIONS}
        stageFields={DEFAULT_STAGE_FIELDS}
        existingApplication={{
          ...DRAFT_APP,
          payload: {},
          files: {},
        }}
        initialRecommenders={[]}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: /Revisión y envío/i })[0]);
    expect(screen.queryAllByText(/En progreso/i).length).toBe(0);
  });

  it("does not mark documents in progress when file uploads are all optional and empty", () => {
    const optionalDocumentsFields = DEFAULT_STAGE_FIELDS.map((field) =>
      field.field_key === "identificationDocument"
        ? { ...field, is_required: false }
        : field,
    );

    render(
      <ApplicantApplicationForm
        cycleId="cycle-optional-docs"
        sections={DEFAULT_SECTIONS}
        stageFields={optionalDocumentsFields}
        existingApplication={{
          ...DRAFT_APP,
          payload: {},
          files: {},
        }}
        initialRecommenders={[]}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: /Revisión y envío/i })[0]);
    expect(screen.queryAllByText(/En progreso/i).length).toBe(0);
  });

  it("autosaves partial draft after field edits", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          application: {
            id: "app-auto",
            applicant_id: "user-1",
            cycle_id: "cycle-4",
            stage_code: "documents",
            status: "draft",
            payload: { eligibilityBirthYear: 2009 },
            files: {},
            validation_notes: null,
            error_report_count: 0,
            created_at: "2026-02-18T20:00:00.000Z",
            updated_at: "2026-02-18T20:00:00.000Z",
          },
        }),
        { status: 200 },
      ),
    );

    render(<ApplicantApplicationForm existingApplication={null} cycleId="cycle-4" sections={DEFAULT_SECTIONS} stageFields={DEFAULT_STAGE_FIELDS} />);
    fireEvent.click(screen.getByRole("button", { name: /Datos personales/i }));

    fireEvent.change(screen.getByLabelText(/Nacionalidad/i), {
      target: { value: "Peruana" },
    });

    // Both sidebar and mobile progress show the draft status label
    expect(screen.getAllByText("Cambios pendientes").length).toBeGreaterThanOrEqual(1);

    await waitFor(
      () =>
        expect(fetchMock).toHaveBeenCalledWith(
          "/api/applications",
          expect.objectContaining({
            method: "POST",
          }),
        ),
      { timeout: 5000 },
    );

    const call = fetchMock.mock.calls.find(([url]) => url === "/api/applications");
    expect(call).toBeTruthy();
    const [, requestInit] = call as [string, RequestInit];
    expect(typeof requestInit.body).toBe("string");
    const parsed = JSON.parse(requestInit.body as string) as { allowPartial?: boolean };
    expect(parsed.allowPartial).toBe(true);
  });

  /* ── Phase 2 DOM structure tests ───────────────────────────── */

  it("action bar shows arrow characters on navigation buttons", () => {
    render(<ApplicantApplicationForm existingApplication={null} cycleId="cycle-arrows" />);

    // Default section is eligibility — should have "Siguiente" with right arrow in action bar
    const nextButtons = screen.getAllByRole("button", { name: /Siguiente/ });
    // At least one button should contain the right arrow character
    expect(nextButtons.some((btn) => btn.textContent?.includes("\u2192"))).toBe(true);

    // Navigate to a section that has a previous — click Siguiente first
    fireEvent.click(nextButtons[0]);
    // Now "Anterior" with left arrow should be visible
    const prevButtons = screen.getAllByRole("button", { name: /Anterior/ });
    expect(prevButtons.some((btn) => btn.textContent?.includes("\u2190"))).toBe(true);
  });

  it("action bar shows 'Enviar postulacion' on review_submit step", () => {
    render(<ApplicantApplicationForm existingApplication={null} cycleId="cycle-submit-label" />);

    // Navigate to review_submit — button has accented text "Revisión y envío"
    fireEvent.click(screen.getByRole("button", { name: /Revisi\u00f3n y env\u00edo/i }));

    // The action bar next button should now say "Enviar postulación"
    const submitButtons = screen.getAllByRole("button", { name: /Enviar postulaci\u00f3n/i });
    expect(submitButtons.length).toBeGreaterThanOrEqual(1);

    // The left arrow "Anterior" should still be present since review_submit is not the first step
    const prevButtons = screen.getAllByRole("button", { name: /Anterior/ });
    expect(prevButtons.length).toBeGreaterThanOrEqual(1);
  });

  it("keeps a single submit control source on final review", () => {
    render(<ApplicantApplicationForm existingApplication={null} cycleId="cycle-single-submit" />);

    fireEvent.click(screen.getByRole("button", { name: /Revisi\u00f3n y env\u00edo/i }));

    expect(screen.getAllByRole("button", { name: /Enviar postulaci\u00f3n/i })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /Guardar borrador/i })).toHaveLength(1);
  });

  it("sidebar shows percentage status badges for in-progress sections", () => {
    render(
      <ApplicantApplicationForm
        cycleId="cycle-badges"
        sections={DEFAULT_SECTIONS}
        stageFields={DEFAULT_STAGE_FIELDS}
        existingApplication={{
          ...DRAFT_APP,
          id: "app-badges",
          payload: {
            // Fill some eligibility fields to make it in_progress
            eligibilityBirthYear: 2009,
          },
        }}
      />,
    );

    // At least one sidebar status badge should show a percentage like "50%" or "33%"
    const percentageBadges = screen.queryAllByText(/%$/);
    // We expect at least one percentage badge since eligibility is partially filled
    expect(percentageBadges.length).toBeGreaterThanOrEqual(1);
  });

  it("documents section renders UploadZone drop zones instead of old button/textfield UI", () => {
    render(
      <ApplicantApplicationForm
        cycleId="cycle-uploads"
        sections={DEFAULT_SECTIONS}
        stageFields={DEFAULT_STAGE_FIELDS}
        existingApplication={DRAFT_APP}
      />,
    );

    // Navigate to documents section
    fireEvent.click(screen.getAllByRole("button", { name: /Documentos/i })[0]);

    // UploadZone renders "Arrastra aquí o" text for empty upload slots
    const dropZoneTexts = screen.queryAllByText(/Arrastra aquí o/);
    // Should have at least one upload zone (the form has file fields)
    expect(dropZoneTexts.length).toBeGreaterThanOrEqual(1);

    // Should show the "selecciona archivo" link text
    expect(screen.queryAllByText(/selecciona archivo/).length).toBeGreaterThanOrEqual(1);

    // Should show max file size hint
    expect(screen.queryAllByText(/max\. 10 MB/).length).toBeGreaterThanOrEqual(1);

    // Should have hidden file inputs
    const fileInputs = document.querySelectorAll('input[type="file"]');
    expect(fileInputs.length).toBeGreaterThanOrEqual(1);
  });

  it("reports document replacement with precise success copy", async () => {
    const updatedApplication = {
      ...DRAFT_APP,
      id: "app-files",
      cycle_id: "cycle-files",
      files: {
        identificationDocument: {
          path: "uploads/original-id.png",
          title: "original-id.png",
          original_name: "original-id.png",
          mime_type: "image/png",
          size_bytes: 1024,
          uploaded_at: "2026-03-03T08:00:00.000Z",
        },
      },
    };

    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);

      if (url === "/api/applications/app-files/upload-url") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              signedUrl: "https://uploads.example.com/replacement-id.png",
              path: "uploads/replacement-id.png",
            }),
            { status: 200 },
          ),
        );
      }

      if (url === "https://uploads.example.com/replacement-id.png") {
        expect(init?.method).toBe("PUT");
        return Promise.resolve(new Response(null, { status: 200 }));
      }

      if (url === "/api/applications/app-files/files") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              application: {
                ...updatedApplication,
                files: {
                  identificationDocument: {
                    path: "uploads/replacement-id.png",
                    title: "replacement-id.png",
                    original_name: "replacement-id.png",
                    mime_type: "image/png",
                    size_bytes: 2048,
                    uploaded_at: "2026-03-03T08:05:00.000Z",
                  },
                },
              },
            }),
            { status: 200 },
          ),
        );
      }

      if (url === "/api/applications?cycleId=cycle-files") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              application: {
                ...updatedApplication,
                files: {
                  identificationDocument: {
                    path: "uploads/replacement-id.png",
                    title: "replacement-id.png",
                    original_name: "replacement-id.png",
                    mime_type: "image/png",
                    size_bytes: 2048,
                    uploaded_at: "2026-03-03T08:05:00.000Z",
                  },
                },
              },
            }),
            { status: 200 },
          ),
        );
      }

      if (url === "/api/recommendations?applicationId=app-files") {
        return Promise.resolve(new Response(JSON.stringify({ recommenders: [] }), { status: 200 }));
      }

      throw new Error(`Unexpected fetch call: ${url}`);
    });

    render(
      <ApplicantApplicationForm
        cycleId="cycle-files"
        sections={DEFAULT_SECTIONS}
        stageFields={DEFAULT_STAGE_FIELDS}
        existingApplication={updatedApplication}
        initialRecommenders={[]}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: /Documentos/i })[0]);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(fileInput).not.toBeNull();

    fireEvent.change(fileInput as HTMLInputElement, {
      target: {
        files: [new File(["replacement"], "replacement-id.png", { type: "image/png" })],
      },
    });

    await waitFor(() => {
      expect(screen.getByText("Documento actualizado correctamente.")).toBeInTheDocument();
    });
  });

  it("recommenders section shows guardian-card pattern with numbered avatars", () => {
    render(
      <ApplicantApplicationForm
        cycleId="cycle-guardians"
        sections={DEFAULT_SECTIONS}
        stageFields={DEFAULT_STAGE_FIELDS}
        existingApplication={DRAFT_APP}
        initialRecommenders={[]}
      />,
    );

    // Navigate to recommenders section
    fireEvent.click(screen.getAllByRole("button", { name: /Recomendadores/i })[0]);

    // Should show numbered avatars: "1" for mentor, "2" for friend
    // (sidebar step indicators may also render numbers, so use getAllByText)
    expect(screen.getAllByText("1").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("2").length).toBeGreaterThanOrEqual(1);

    // Should show "Sin registrar" for unregistered recommenders
    const unregisteredTexts = screen.getAllByText("Sin registrar");
    expect(unregisteredTexts.length).toBe(2);

    // Should show one send button per recommender slot
    expect(screen.getAllByRole("button", { name: /Guardar y enviar/i })).toHaveLength(2);
  });

  it("marks the recommender step complete once both recommenders are registered", async () => {
    render(
      <ApplicantApplicationForm
        cycleId="cycle-rec-fraction"
        sections={DEFAULT_SECTIONS}
        stageFields={DEFAULT_STAGE_FIELDS}
        existingApplication={DRAFT_APP}
        initialRecommenders={[
          {
            id: "rec-1",
            role: "mentor",
            email: "mentor@test.com",
            status: "submitted",
            submittedAt: "2026-02-18T20:00:00.000Z",
            inviteSentAt: "2026-02-18T20:00:00.000Z",
            openedAt: null,
            startedAt: null,
            reminderCount: 0,
            lastReminderAt: null,
            invalidatedAt: null,
            createdAt: "2026-02-18T20:00:00.000Z",
          },
          {
            id: "rec-2",
            role: "friend",
            email: "friend@test.com",
            status: "sent",
            submittedAt: null,
            inviteSentAt: "2026-02-18T20:00:00.000Z",
            openedAt: null,
            startedAt: null,
            reminderCount: 0,
            lastReminderAt: null,
            invalidatedAt: null,
            createdAt: "2026-02-18T20:00:00.000Z",
          },
        ]}
      />,
    );

    const sidebar = screen.getByTestId("applicant-sidebar");
    expect(within(sidebar).queryByText("0/2")).not.toBeInTheDocument();
    expect(
      within(sidebar)
        .getByTestId("sidebar-nav-recommenders_flow")
        .querySelector('[data-testid="CheckIcon"]'),
    ).not.toBeNull();
  });
});
