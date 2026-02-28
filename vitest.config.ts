import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "**/.next/**",
        "**/.claude/**",
        "**/*.d.ts",
        "next.config.ts",
        "playwright.config.ts",
        "eslint.config.mjs",
        "scripts/**",
        "src/types/**",
        "src/styles/**",
        "src/app/layout.tsx",
        "src/app/page.tsx",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
