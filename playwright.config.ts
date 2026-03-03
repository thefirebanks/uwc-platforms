import { defineConfig, devices } from "@playwright/test";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

export default defineConfig({
  testDir: "tests/e2e",
  retries: 0,
  workers: 1,
  timeout: 90_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3001",
    trace: "on-first-retry",
  },
  webServer: {
    command: "bun run dev -- --port 3001",
    url: process.env.E2E_BASE_URL ?? "http://localhost:3001",
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
