import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { bypassReady, loginAsAdmin } from "./helpers";

const DEMO_CYCLE_ID = "98b2f8e4-7266-44b0-acb2-566e2fb2d50e";
const SCREENSHOT_DIR = path.join(process.cwd(), "output", "rubric-screenshots");

function screenshotPath(fileName: string) {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  return path.join(SCREENSHOT_DIR, fileName);
}

function rubricTextarea(page: Page) {
  return page.locator("textarea[id^='eligibility-rubric-']").first();
}

test.describe("Admin rubric visual checks", () => {
  test.beforeEach(async () => {
    test.skip(
      !bypassReady,
      "Requires NEXT_PUBLIC_ENABLE_DEV_BYPASS=true and demo credentials in env.",
    );
  });

  test("captures stage settings rubric controls", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`/admin/process/${DEMO_CYCLE_ID}/stage/documents?tab=settings`);

    await expect(page.getByRole("button", { name: /Modo guiado/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { name: /JSON avanzado/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Usar plantilla básica/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: /Usar plantilla con OCR/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Validar rúbrica/i })).toBeVisible();

    await page.screenshot({
      path: screenshotPath("01-stage-settings-rubric-controls.png"),
      fullPage: true,
    });
  });

  test("captures validation error rendering", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`/admin/process/${DEMO_CYCLE_ID}/stage/documents?tab=settings`);
    await page.getByRole("button", { name: /JSON avanzado/i }).click();

    const textarea = rubricTextarea(page);
    const originalValue = await textarea.inputValue();

    try {
      await textarea.fill("{ invalid-json");
      await page.getByRole("button", { name: /Validar rúbrica/i }).click();

      await expect(page.locator(".admin-feedback.error").first()).toContainText(
        /JSON válido/i,
        { timeout: 8_000 },
      );

      await page.screenshot({
        path: screenshotPath("02-rubric-validation-error.png"),
        fullPage: true,
      });
    } finally {
      await textarea.fill(originalValue);
    }
  });

  test("captures rubric execution feedback in candidates dashboard", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/candidates");

    const cycleFilter = page.locator("select.filter-select").first();
    const optionValues = await cycleFilter.locator("option").evaluateAll((options) =>
      options
        .map((option) => ({
          value: (option as HTMLOptionElement).value,
        }))
        .filter((option) => option.value !== "all" && option.value.length > 0),
    );

    test.skip(optionValues.length === 0, "No cycle options available for visual rubric execution.");

    await cycleFilter.selectOption(optionValues[0]!.value);

    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/applications/rubric-evaluate") &&
        response.request().method() === "POST",
      { timeout: 20_000 },
    );

    await page.getByRole("button", { name: /Ejecutar rúbrica automática/i }).click();
    await responsePromise;

    await expect(page.locator(".admin-feedback")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("columnheader", { name: "Dictamen automático" })).toBeVisible();

    await page.screenshot({
      path: screenshotPath("03-candidates-rubric-feedback.png"),
      fullPage: true,
    });
  });
});
