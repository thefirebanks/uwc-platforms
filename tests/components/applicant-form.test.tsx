import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ApplicantApplicationForm } from "@/components/applicant-application-form";

describe("ApplicantApplicationForm", () => {
  it("shows guidance when submit is attempted without draft", async () => {
    render(<ApplicantApplicationForm existingApplication={null} />);

    fireEvent.click(screen.getByRole("button", { name: "Enviar postulación" }));

    expect(
      await screen.findByText("Primero guarda tu borrador antes de enviar."),
    ).toBeInTheDocument();
  });
});
