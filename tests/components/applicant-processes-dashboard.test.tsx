import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ApplicantProcessesDashboard } from "@/components/applicant-processes-dashboard";

describe("ApplicantProcessesDashboard", () => {
  it("shows existing applications and blocks new ones when limit is reached", () => {
    render(
      <ApplicantProcessesDashboard
        processes={[
          {
            id: "cycle-1",
            name: "Proceso de Selección 2026",
            is_active: true,
            stage1_open_at: "2026-01-01T00:00:00.000Z",
            stage1_close_at: "2026-05-31T23:59:59.000Z",
            stage2_open_at: "2026-06-01T00:00:00.000Z",
            stage2_close_at: "2026-12-31T23:59:59.000Z",
            max_applications_per_user: 3,
            created_at: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "cycle-2",
            name: "Proceso de Selección 2027",
            is_active: false,
            stage1_open_at: "2027-01-01T00:00:00.000Z",
            stage1_close_at: "2027-05-31T23:59:59.000Z",
            stage2_open_at: "2027-06-01T00:00:00.000Z",
            stage2_close_at: "2027-12-31T23:59:59.000Z",
            max_applications_per_user: 3,
            created_at: "2027-01-01T00:00:00.000Z",
          },
          {
            id: "cycle-3",
            name: "Proceso de Selección 2028",
            is_active: false,
            stage1_open_at: "2028-01-01T00:00:00.000Z",
            stage1_close_at: "2028-05-31T23:59:59.000Z",
            stage2_open_at: "2028-06-01T00:00:00.000Z",
            stage2_close_at: "2028-12-31T23:59:59.000Z",
            max_applications_per_user: 3,
            created_at: "2028-01-01T00:00:00.000Z",
          },
          {
            id: "cycle-4",
            name: "Proceso de Selección 2029",
            is_active: false,
            stage1_open_at: "2029-01-01T00:00:00.000Z",
            stage1_close_at: "2029-05-31T23:59:59.000Z",
            stage2_open_at: "2029-06-01T00:00:00.000Z",
            stage2_close_at: "2029-12-31T23:59:59.000Z",
            max_applications_per_user: 3,
            created_at: "2029-01-01T00:00:00.000Z",
          },
        ]}
        applications={[
          {
            id: "app-1",
            cycle_id: "cycle-1",
            status: "submitted",
            stage_code: "documents",
            updated_at: "2026-02-01T12:00:00.000Z",
          },
          {
            id: "app-2",
            cycle_id: "cycle-2",
            status: "draft",
            stage_code: "documents",
            updated_at: "2027-02-01T12:00:00.000Z",
          },
          {
            id: "app-3",
            cycle_id: "cycle-3",
            status: "eligible",
            stage_code: "exam_placeholder",
            updated_at: "2028-02-01T12:00:00.000Z",
          },
        ]}
      />,
    );

    expect(screen.getByText("Postulaciones actuales: 3/3")).toBeInTheDocument();
    expect(screen.getAllByText("Abrir postulación")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Límite alcanzado" })).toBeDisabled();
  });
});
