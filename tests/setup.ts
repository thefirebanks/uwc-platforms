import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/react";
import { vi } from "vitest";

// CI runners can be slow — give waitFor more breathing room
configure({ asyncUtilTimeout: 4000 });

// Mock Next.js navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/applicant/process/test-cycle",
  useSearchParams: () => new URLSearchParams(),
}));

// Mock theme mode provider
vi.mock("@/components/app-theme-provider", () => ({
  useThemeMode: () => ({
    mode: "light" as const,
    toggleMode: vi.fn(),
  }),
  AppThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));
