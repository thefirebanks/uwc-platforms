import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const pushMock = vi.fn();
const refreshMock = vi.fn();
const signOutMock = vi.fn().mockResolvedValue(undefined);
const signInWithPasswordMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    refresh: refreshMock,
  }),
}));

vi.mock("@/lib/supabase/browser", () => ({
  clearSupabaseBrowserSessionCache: vi.fn(),
  resetSupabaseBrowserClient: vi.fn(),
  getSupabaseBrowserClient: vi.fn(() => ({
    auth: {
      signOut: signOutMock,
      signInWithPassword: signInWithPasswordMock,
      signInWithOAuth: vi.fn(),
    },
  })),
}));

vi.mock("@/components/theme-mode-toggle", () => ({
  ThemeModeToggle: () => <div>theme-toggle</div>,
}));

describe("LoginPage", () => {
  beforeEach(() => {
    vi.resetModules();
    pushMock.mockReset();
    refreshMock.mockReset();
    signOutMock.mockClear();
    signInWithPasswordMock.mockReset();
    process.env.NEXT_PUBLIC_ENABLE_DEV_BYPASS = "true";
    process.env.NEXT_PUBLIC_DEMO_ADMIN_EMAIL = "admin.demo@uwcperu.org";
    process.env.NEXT_PUBLIC_DEMO_APPLICANT_EMAIL = "applicant.demo@uwcperu.org";
    process.env.NEXT_PUBLIC_DEMO_APPLICANT_2_EMAIL = "applicant.demo2@uwcperu.org";
    process.env.NEXT_PUBLIC_DEMO_PASSWORD = "ChangeMe123!";
  });

  it("shows bypass buttons for both seeded demo applicants", async () => {
    const { default: LoginPage } = await import("@/app/(auth)/login/page");
    render(<LoginPage />);

    expect(
      screen.getByRole("button", { name: "Entrar como postulante demo 1" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Entrar como postulante demo 2" }),
    ).toBeInTheDocument();
  });

  it("uses the second demo applicant email when that bypass button is pressed", async () => {
    signInWithPasswordMock.mockResolvedValue({
      data: { session: { access_token: "token" } },
      error: null,
    });

    const { default: LoginPage } = await import("@/app/(auth)/login/page");
    render(<LoginPage />);

    fireEvent.click(screen.getByRole("button", { name: "Entrar como postulante demo 2" }));

    await waitFor(() => {
      expect(signInWithPasswordMock).toHaveBeenCalledWith({
        email: "applicant.demo2@uwcperu.org",
        password: "ChangeMe123!",
      });
    });
    expect(pushMock).toHaveBeenCalledWith("/applicant");
  });
});
