import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApplicantTopNav } from "@/components/applicant-top-nav";

const pushMock = vi.fn();
const refreshMock = vi.fn();
const signOutMock = vi.fn(() => Promise.resolve({ error: null }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    refresh: refreshMock,
  }),
}));

vi.mock("@/components/language-provider", () => ({
  useAppLanguage: () => ({
    t: (key: string) => {
      if (key === "nav.roleApplicant") return "Postulante";
      if (key === "nav.logout") return "Cerrar sesión";
      return key;
    },
    language: "es",
    setLanguage: vi.fn(),
    canUseEnglish: true,
  }),
}));

vi.mock("@/components/app-theme-provider", () => ({
  useThemeMode: () => ({
    mode: "light",
    toggleMode: vi.fn(),
  }),
}));

vi.mock("@/lib/supabase/browser", () => ({
  clearSupabaseBrowserSessionCache: vi.fn(),
  resetSupabaseBrowserClient: vi.fn(),
  getSupabaseBrowserClient: () => ({
    auth: {
      signOut: signOutMock,
    },
  }),
}));

describe("ApplicantTopNav", () => {
  it("shows the signed-in account in the bar and menu", () => {
    render(
      <ApplicantTopNav
        accountDisplayName="Comité Selección"
        accountEmail="informes@pe.uwc.org"
      />,
    );

    expect(screen.getByText("Sesión actual")).toBeInTheDocument();
    expect(screen.getByText("Comité Selección")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Menu" }));

    expect(screen.getAllByText("Sesión actual").length).toBeGreaterThan(0);
    expect(screen.getByText("informes@pe.uwc.org")).toBeInTheDocument();
  });
});
