import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApplicantProcessesDashboard } from "@/components/applicant-processes-dashboard";

// ApplicantCommunicationsDashboard fetches on mount; keep tests isolated
vi.mock("@/components/applicant-communications-dashboard", () => ({
  ApplicantCommunicationsDashboard: () => null,
}));

// ApplicantSupportForm opens a dialog and fetches tickets; stub it out
vi.mock("@/components/applicant-support-form", () => ({
  ApplicantSupportForm: () => null,
}));

const ACTIVE_CYCLE = {
  id: "cycle-1",
  name: "Proceso de Selección 2026",
  is_active: true,
  stage1_open_at: "2026-01-01T00:00:00.000Z",
  stage1_close_at: "2026-05-31T23:59:59.000Z",
  stage2_open_at: "2026-06-01T00:00:00.000Z",
  stage2_close_at: "2026-12-31T23:59:59.000Z",
  max_applications_per_user: 3,
  created_at: "2026-01-01T00:00:00.000Z",
};

const INACTIVE_CYCLE = (id: string, name: string, year: string) => ({
  id,
  name,
  is_active: false,
  stage1_open_at: `${year}-01-01T00:00:00.000Z`,
  stage1_close_at: `${year}-05-31T23:59:59.000Z`,
  stage2_open_at: `${year}-06-01T00:00:00.000Z`,
  stage2_close_at: `${year}-12-31T23:59:59.000Z`,
  max_applications_per_user: 3,
  created_at: `${year}-01-01T00:00:00.000Z`,
});

describe("ApplicantProcessesDashboard", () => {
  it("shows hero card for the active process when the applicant has an application", () => {
    render(
      <ApplicantProcessesDashboard
        processes={[ACTIVE_CYCLE]}
        applications={[
          {
            id: "app-1",
            cycle_id: "cycle-1",
            status: "submitted",
            stage_code: "documents",
            updated_at: "2026-02-01T12:00:00.000Z",
          },
        ]}
        stageTemplates={[
          {
            cycle_id: "cycle-1",
            stage_code: "documents",
            stage_label: "Etapa 1 — Documentos",
            sort_order: 1,
          },
        ]}
        recentTransitions={[]}
      />,
    );

    // Hero card header
    expect(screen.getByText("Tu proceso activo")).toBeInTheDocument();
    expect(screen.getByText("Proceso de Selección 2026")).toBeInTheDocument();

    // Stage label from stageTemplates
    expect(screen.getByText("Etapa 1 — Documentos")).toBeInTheDocument();

    // CTA link
    expect(screen.getByRole("link", { name: /Continuar postulación/i })).toBeInTheDocument();
  });

  it("uses continue CTA for draft applications in the active process", () => {
    render(
      <ApplicantProcessesDashboard
        processes={[ACTIVE_CYCLE]}
        applications={[
          {
            id: "app-draft",
            cycle_id: "cycle-1",
            status: "draft",
            stage_code: "documents",
            updated_at: "2026-02-01T12:00:00.000Z",
          },
        ]}
        stageTemplates={[]}
        recentTransitions={[]}
      />,
    );

    expect(screen.getByRole("link", { name: /Continuar postulación/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Iniciar postulación/i })).not.toBeInTheDocument();
  });

  it("shows congratulations banner when a recent stage transition exists", () => {
    render(
      <ApplicantProcessesDashboard
        processes={[ACTIVE_CYCLE]}
        applications={[
          {
            id: "app-1",
            cycle_id: "cycle-1",
            status: "advanced",
            stage_code: "exam_placeholder",
            updated_at: "2026-03-01T12:00:00.000Z",
          },
        ]}
        stageTemplates={[
          {
            cycle_id: "cycle-1",
            stage_code: "exam_placeholder",
            stage_label: "Etapa 2 — Examen",
            sort_order: 2,
          },
        ]}
        recentTransitions={[
          {
            application_id: "app-1",
            from_stage: "documents",
            to_stage: "exam_placeholder",
            created_at: new Date().toISOString(),
          },
        ]}
      />,
    );

    // Congratulations banner should appear and contain stage name
    const banner = screen.getByRole("status");
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent(/Felicitaciones/i);
    expect(banner).toHaveTextContent(/Etapa 2/i);
  });

  it("shows multi-process list when no active application exists", () => {
    render(
      <ApplicantProcessesDashboard
        processes={[
          ACTIVE_CYCLE,
          INACTIVE_CYCLE("cycle-2", "Proceso de Selección 2027", "2027"),
        ]}
        applications={[]}   // no applications at all
        maxApplications={3}
        stageTemplates={[]}
        recentTransitions={[]}
      />,
    );

    // Multi-process list heading
    expect(screen.getByText("Tus procesos de selección")).toBeInTheDocument();

    // Only active processes shown in list; inactive ones not in the main list
    expect(screen.getByText("Proceso de Selección 2026")).toBeInTheDocument();

    // Start application CTA shown (not at limit)
    expect(screen.getByRole("link", { name: /Iniciar postulación/i })).toBeInTheDocument();
  });

  it("shows limit-reached state when applicant is at max active applications", () => {
    render(
      <ApplicantProcessesDashboard
        processes={[
          INACTIVE_CYCLE("cycle-2", "Proceso 2027", "2027"),
          INACTIVE_CYCLE("cycle-3", "Proceso 2028", "2028"),
          INACTIVE_CYCLE("cycle-4", "Proceso 2029", "2029"),
          // Add a 4th active cycle so the limit scenario applies
          {
            ...ACTIVE_CYCLE,
            id: "cycle-5",
            name: "Proceso 2030",
            is_active: true,
          },
        ]}
        applications={[
          // No applications for the active cycle — but at the max limit
          { id: "app-2", cycle_id: "cycle-2", status: "draft", stage_code: "documents", updated_at: "2027-01-01T00:00:00.000Z" },
          { id: "app-3", cycle_id: "cycle-3", status: "eligible", stage_code: "documents", updated_at: "2028-01-01T00:00:00.000Z" },
          { id: "app-4", cycle_id: "cycle-4", status: "submitted", stage_code: "documents", updated_at: "2029-01-01T00:00:00.000Z" },
        ]}
        maxApplications={3}
        stageTemplates={[]}
        recentTransitions={[]}
      />,
    );

    // Active cycle-5 has no application and limit is reached → Límite alcanzado
    expect(screen.getByText(/Límite alcanzado/i)).toBeInTheDocument();
  });

  it("shows collapsible previous processes when inactive cycles exist", () => {
    render(
      <ApplicantProcessesDashboard
        processes={[
          ACTIVE_CYCLE,
          INACTIVE_CYCLE("cycle-old", "Proceso de Selección 2024", "2024"),
        ]}
        applications={[
          {
            id: "app-1",
            cycle_id: "cycle-1",
            status: "submitted",
            stage_code: "documents",
            updated_at: "2026-02-01T12:00:00.000Z",
          },
        ]}
        stageTemplates={[]}
        recentTransitions={[]}
      />,
    );

    // Collapsible toggle button should appear with count
    expect(screen.getByRole("button", { name: /Procesos anteriores/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /\(1\)/i })).toBeInTheDocument();
  });
});
