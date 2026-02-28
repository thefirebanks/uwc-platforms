import { expect, test } from "@playwright/test";

test("unauthenticated root redirects to login page", async ({ page }) => {
  await page.goto("/");
  // Root now redirects unauthenticated users to /login
  await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  // Login page should show the sign-in heading
  await expect(page.getByRole("heading", { name: /Iniciar sesión/i })).toBeVisible();
});
