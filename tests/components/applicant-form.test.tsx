import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApplicantApplicationForm } from "@/components/applicant-application-form";

describe("ApplicantApplicationForm", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps submit disabled until a draft exists", async () => {
    render(<ApplicantApplicationForm existingApplication={null} cycleId="cycle-1" />);

    fireEvent.click(screen.getByRole("button", { name: /Revisión y envío/i }));
    expect(screen.getByRole("button", { name: "Enviar postulación" })).toBeDisabled();
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
});
