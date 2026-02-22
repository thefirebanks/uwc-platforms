import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApplicantApplicationForm } from "@/components/applicant-application-form";

/* ── Shared fixtures ───────────────────────────────────────── */

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

    fireEvent.click(screen.getByRole("button", { name: /Revisión y envío/i }));
    // Both the inline submit button and the action bar show "Enviar postulación" on last step
    const submitButtons = screen.getAllByRole("button", { name: /Enviar postulación/i });
    expect(submitButtons.length).toBeGreaterThanOrEqual(1);
    expect(submitButtons[0]).toBeDisabled();
    expect(screen.getByText("Antes de empezar")).toBeInTheDocument();
    expect(screen.getByText("Progreso por secciones")).toBeInTheDocument();
  });

  it("locks submitted forms until user enables edit mode", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ recommenders: [] }), { status: 200 }),
    );

    render(
      <ApplicantApplicationForm
        cycleId="cycle-1"
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
    const fullNameInput = screen.getByLabelText(/Nombre completo/i);
    expect(fullNameInput).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Editar respuesta" }));

    expect(await screen.findByText("Edición habilitada. Guarda cambios y vuelve a enviar.")).toBeInTheDocument();
    expect(screen.getByLabelText(/Nombre completo/i)).not.toBeDisabled();
  });

  it("shows previously registered recommenders from API", async () => {
    render(
      <ApplicantApplicationForm
        cycleId="cycle-2"
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

  it("shows progress summary based on submitted state", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ recommenders: [] }), { status: 200 }),
    );

    render(
      <ApplicantApplicationForm
        cycleId="cycle-3"
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

    render(<ApplicantApplicationForm existingApplication={null} cycleId="cycle-4" />);

    fireEvent.change(screen.getByLabelText(/Año de nacimiento/i), {
      target: { value: "2009" },
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

  it("sidebar shows percentage status badges for in-progress sections", () => {
    render(
      <ApplicantApplicationForm
        cycleId="cycle-badges"
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
        existingApplication={DRAFT_APP}
      />,
    );

    // Navigate to documents section
    fireEvent.click(screen.getAllByRole("button", { name: /Documentos/i })[0]);

    // UploadZone renders "Arrastra aqui o" text for empty upload slots
    const dropZoneTexts = screen.queryAllByText(/Arrastra aqui o/);
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

  it("recommenders section shows guardian-card pattern with numbered avatars", () => {
    render(
      <ApplicantApplicationForm
        cycleId="cycle-guardians"
        existingApplication={DRAFT_APP}
        initialRecommenders={[]}
      />,
    );

    // Navigate to recommenders section
    fireEvent.click(screen.getAllByRole("button", { name: /Recomendadores/i })[0]);

    // Should show numbered avatars: "1" for mentor, "2" for friend
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();

    // Should show "Sin registrar" for unregistered recommenders
    const unregisteredTexts = screen.getAllByText("Sin registrar");
    expect(unregisteredTexts.length).toBe(2);

    // Should show "Guardar recomendadores" button
    expect(screen.getByRole("button", { name: /Guardar recomendadores/i })).toBeInTheDocument();
  });

  it("sidebar progress label shows fraction format for recommenders", async () => {
    render(
      <ApplicantApplicationForm
        cycleId="cycle-rec-fraction"
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

    // 1 of 2 submitted -> sidebar should show "1/2"
    expect(screen.getByText("1/2")).toBeInTheDocument();
  });
});
