import { expect, test } from "@playwright/test";
import { bypassReady, clickSidebarStepByLabel, loginAndOpenForm } from "./helpers";

test.describe("Applicant form – sidebar redesign", () => {
  test.beforeEach(async () => {
    test.skip(
      !bypassReady,
      "Requires NEXT_PUBLIC_ENABLE_DEV_BYPASS=true and demo credentials in env.",
    );
  });

  test("desktop sidebar renders with progress and navigation", async ({ page }) => {
    await loginAndOpenForm(page);

    const sidebar = page.locator("aside");
    await expect(sidebar).toBeVisible({ timeout: 10_000 });

    // Sidebar shows progress label (e.g. "N de M completado" or "N of M complete")
    await expect(sidebar.getByText(/completado|complete/i)).toBeVisible();

    // Sidebar has step nav buttons
    const buttons = sidebar.locator("button");
    await expect(buttons.first()).toBeVisible();
    expect(await buttons.count()).toBeGreaterThanOrEqual(3);
  });

  test("sidebar navigation switches form sections", async ({ page }) => {
    await loginAndOpenForm(page);

    const sidebar = page.locator("aside");
    await expect(sidebar).toBeVisible({ timeout: 10_000 });

    // First section shows step 1 eyebrow
    await expect(page.getByText(/Paso 1 de|Step 1 of/i)).toBeVisible({ timeout: 5_000 });

    // Click "Datos personales" / "Personal info" step (second section)
    await clickSidebarStepByLabel(page, /Datos personales|Personal info/i);

    // Step 2 eyebrow should appear
    await expect(page.getByText(/Paso 2 de|Step 2 of/i)).toBeVisible({ timeout: 10_000 });

    // Click the review/submit step
    await clickSidebarStepByLabel(page, /Revisión|Review/i);

    // Review section shows progress summary
    await expect(page.getByText(/Progreso por secciones|Section progress/i)).toBeVisible({ timeout: 10_000 });
  });

  test("mobile progress panel is visible on small viewports", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await loginAndOpenForm(page);

    // Sidebar (aside) should NOT be visible on mobile
    const sidebar = page.locator("aside");
    await expect(sidebar).not.toBeVisible();

    // Mobile progress panel renders inside <main> — check for the step 1 eyebrow
    await expect(page.getByText(/Paso 1 de|Step 1 of/i)).toBeVisible({ timeout: 10_000 });

    // The circular progress percentage should be visible (rendered in the mobile panel)
    const percentText = page.locator("main").getByText(/%/);
    await expect(percentText.first()).toBeVisible();
  });

  test("action bar renders with navigation buttons", async ({ page }) => {
    await loginAndOpenForm(page);

    // The action bar should have a Save Draft button
    await expect(page.getByRole("button", { name: /Guardar borrador|Save draft/i })).toBeVisible({ timeout: 10_000 });

    // Should have a Next button (text includes "Siguiente" or "Next")
    await expect(page.getByRole("button", { name: /Siguiente|Next/i })).toBeVisible();

    // On the first section there should be no Previous button
    await expect(page.getByRole("button", { name: /Anterior|Previous/i })).not.toBeVisible();

    // Navigate to second section via sidebar
    await clickSidebarStepByLabel(page, /Datos personales|Personal info/i);

    // After moving to section 2, Previous button should appear
    await expect(page.getByRole("button", { name: /Anterior|Previous/i })).toBeVisible({ timeout: 10_000 });
  });

  test("section eyebrow headers show step count", async ({ page }) => {
    await loginAndOpenForm(page);

    // First section should show "Paso 1 de N" or "Step 1 of N"
    await expect(page.getByText(/Paso 1 de \d+|Step 1 of \d+/i)).toBeVisible({ timeout: 10_000 });

    // Navigate to second section
    await clickSidebarStepByLabel(page, /Datos personales|Personal info/i);

    // Second section shows "Paso 2 de N"
    await expect(page.getByText(/Paso 2 de \d+|Step 2 of \d+/i)).toBeVisible({ timeout: 10_000 });
  });

  test("filling a field shows pending changes status", async ({ page }) => {
    await loginAndOpenForm(page);

    // If form is locked (submitted), enable edit mode first
    const editBtn = page.getByRole("button", { name: /Editar respuesta|Edit response/i });
    if (await editBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await editBtn.click();
    }

    // Try to fill the birth year input on the eligibility section
    const birthYearInput = page.getByLabel(/Año de nacimiento|Birth year/i);
    const canFillBirthYear = await birthYearInput.isEnabled({ timeout: 3_000 }).catch(() => false);

    if (canFillBirthYear) {
      await birthYearInput.fill("2009");
    } else {
      // Navigate to identity section which may have editable text fields
      await clickSidebarStepByLabel(page, /Datos personales|Personal info/i);
      // Enable editing on this section too if needed
      const editBtn2 = page.getByRole("button", { name: /Editar respuesta|Edit response/i });
      if (await editBtn2.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await editBtn2.click();
      }
      const enabledInput = page.locator("input:not([disabled])").first();
      if (await enabledInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await enabledInput.fill("Test Value");
      } else {
        // If stage is closed, skip this test — no fields can be edited
        test.skip(true, "All fields disabled — stage may be closed");
        return;
      }
    }

    // After editing, "Cambios pendientes" / "Pending changes" should appear
    await expect(
      page.getByText(/Cambios pendientes|Pending changes/i).first(),
    ).toBeVisible({ timeout: 5_000 });
  });
});
