/**
 * E2E tests: Applicant application lifecycle (reversible)
 *
 * Tests the full applicant journey: logging in, navigating the multi-step form,
 * filling fields, saving drafts, checking progress, and mobile layout.
 *
 * Each test resets the demo applicant's application before AND after running,
 * so the demo database stays clean regardless of test outcome.
 *
 * Prerequisites:
 *   NEXT_PUBLIC_ENABLE_DEV_BYPASS=true
 *   NEXT_PUBLIC_DEMO_ADMIN_EMAIL set
 *   NEXT_PUBLIC_DEMO_APPLICANT_EMAIL set
 *   NEXT_PUBLIC_DEMO_PASSWORD set
 */
import { expect, test } from "@playwright/test";
import {
  bypassReady,
  clickSidebarStepByLabel,
  loginAndOpenForm,
  resetDemoApplicant,
} from "./helpers";

test.describe("Applicant application lifecycle (reversible)", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(
      !bypassReady,
      "Requires NEXT_PUBLIC_ENABLE_DEV_BYPASS=true and demo credentials in env.",
    );
    await resetDemoApplicant(page);
  });

  test.afterEach(async ({ page }) => {
    // Skip cleanup if bypass credentials are not available (tests were skipped)
    if (!bypassReady) return;
    // Ensure the DB is clean after every test regardless of outcome
    await resetDemoApplicant(page);
  });

  test("applicant can start a draft, navigate sections, and autosave", async ({ page }) => {
    await loginAndOpenForm(page);

    // Desktop sidebar is visible
    const sidebar = page.locator("aside");
    await expect(sidebar).toBeVisible({ timeout: 10_000 });

    // First section eyebrow is shown
    await expect(page.getByText(/Paso 1 de \d+|Step 1 of \d+/i)).toBeVisible({ timeout: 8_000 });

    // Navigate to personal data section
    await clickSidebarStepByLabel(page, /Datos personales|Personal info/i);
    await expect(page.getByText(/Paso 2 de \d+|Step 2 of \d+/i)).toBeVisible({ timeout: 8_000 });

    // Fill the first available text input
    const enabledInput = page.locator("input:not([disabled])").first();
    const canFill = await enabledInput.isVisible({ timeout: 3_000 }).catch(() => false);
    if (!canFill) {
      test.skip(true, "No enabled input found — stage may be closed");
      return;
    }
    await enabledInput.fill("Test Playwright");

    // Pending changes indicator appears
    await expect(page.getByText(/Cambios pendientes|Pending changes/i).first()).toBeVisible({
      timeout: 5_000,
    });

    // Autosave confirmation appears within 15 seconds
    await expect(page.getByText(/Guardado|Saved/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test("applicant can manually save draft and see progress summary", async ({ page }) => {
    await loginAndOpenForm(page);

    // Navigate to personal data
    await clickSidebarStepByLabel(page, /Datos personales|Personal info/i);

    // Manually save via the action bar Save Draft button
    await page.getByRole("button", { name: /Guardar borrador|Save draft/i }).click();
    await expect(page.getByText(/Guardado|Saved/i).first()).toBeVisible({ timeout: 10_000 });

    // Navigate to the review/submit section
    await clickSidebarStepByLabel(page, /Revisión|Review/i);

    // Progress summary table/section is shown
    await expect(page.getByText(/Progreso por secciones|Section progress/i)).toBeVisible({
      timeout: 10_000,
    });
  });

  test("action bar shows correct navigation buttons per section", async ({ page }) => {
    await loginAndOpenForm(page);

    // On the first numbered section: Save Draft + Next + Previous (back to intro) are all visible
    await expect(page.getByRole("button", { name: /Guardar borrador|Save draft/i })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole("button", { name: /Siguiente|Next/i }).first()).toBeVisible();

    // Navigate forward to section 2
    await page.getByRole("button", { name: /Siguiente|Next/i }).first().click();
    await expect(page.getByRole("button", { name: /Anterior|Previous/i })).toBeVisible({
      timeout: 8_000,
    });
  });

  test("sidebar shows step count and progress badge", async ({ page }) => {
    await loginAndOpenForm(page);

    const sidebar = page.locator("aside");
    await expect(sidebar).toBeVisible({ timeout: 10_000 });

    // Progress label (e.g. "0 de 8 completado")
    await expect(sidebar.getByText(/completado|complete/i)).toBeVisible();

    // At least 3 step buttons exist
    const buttons = sidebar.locator("button");
    expect(await buttons.count()).toBeGreaterThanOrEqual(3);
  });

  test("mobile progress panel is visible on small viewport (sidebar hidden)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await loginAndOpenForm(page);

    // Desktop sidebar (aside) should not be rendered on mobile
    await expect(page.locator("aside")).not.toBeVisible();

    // Mobile step header is shown inside <main>
    await expect(page.getByText(/Paso 1 de \d+|Step 1 of \d+/i)).toBeVisible({ timeout: 10_000 });

    // Progress percentage is displayed
    const percentText = page.locator("main").getByText(/%/);
    await expect(percentText.first()).toBeVisible();
  });

  test("applicant cannot access admin routes", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Entrar como postulante demo" }).click();
    await expect(page).toHaveURL(/\/applicant/, { timeout: 15_000 });

    // Attempting to navigate to admin should redirect away from /admin/process/...
    await page.goto("/admin");
    // Should NOT end up in the admin process view
    await expect(page).not.toHaveURL(/\/admin\/process/);
  });
});
