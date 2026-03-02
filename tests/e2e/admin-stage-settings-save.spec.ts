import { expect, test } from "@playwright/test";
import { bypassReady, loginAsAdmin } from "./helpers";

const DEMO_CYCLE_ID = "98b2f8e4-7266-44b0-acb2-566e2fb2d50e";

test.describe("Admin stage settings save status", () => {
  test.beforeEach(async () => {
    test.skip(!bypassReady, "Requires NEXT_PUBLIC_ENABLE_DEV_BYPASS=true and demo credentials");
  });

  test("clears Ajustes y Reglas dirty state after save", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`/admin/process/${DEMO_CYCLE_ID}/stage/documents`);

    const saveBtn = page.getByRole("button", { name: /Guardar configuración/i });
    await expect(saveBtn).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: /Ajustes y Reglas/i }).click();

    const closeDateInput = page.locator("input[id^='stage-close-date-']").first();
    const originalCloseDate = await closeDateInput.inputValue();
    const nextCloseDate = originalCloseDate === "2026-12-30" ? "2026-12-31" : "2026-12-30";

    try {
      await closeDateInput.fill(nextCloseDate);
      await closeDateInput.blur();

      await expect(page.locator(".admin-stage-save-status")).toContainText(
        /Hay cambios sin guardar en Ajustes y Reglas/i,
      );
      await expect(saveBtn).toBeEnabled();

      await saveBtn.click();

      await expect(page.locator(".admin-stage-save-status")).toContainText(
        /Configuración guardada/i,
        { timeout: 10_000 },
      );
      await expect(page.locator(".admin-stage-save-status")).not.toContainText(
        /Hay cambios sin guardar en Ajustes y Reglas/i,
      );
      await expect(saveBtn).toBeDisabled();
    } finally {
      const currentCloseDate = await closeDateInput.inputValue();
      if (currentCloseDate !== originalCloseDate) {
        await closeDateInput.fill(originalCloseDate);
        await closeDateInput.blur();
        await expect(saveBtn).toBeEnabled({ timeout: 10_000 });
        await saveBtn.click();
        await expect(page.locator(".admin-stage-save-status")).toContainText(
          /Configuración guardada/i,
          { timeout: 10_000 },
        );
      }
    }
  });
});
