import { expect, test } from "@playwright/test";
import { bypassReady, loginAsAdmin } from "./helpers";

const DEMO_CYCLE_ID = "98b2f8e4-7266-44b0-acb2-566e2fb2d50e";

test.describe("Rubric UI Audit - Current State Screenshots", () => {
  test.beforeEach(async () => {
    test.skip(
      !bypassReady,
      "Requires NEXT_PUBLIC_ENABLE_DEV_BYPASS=true and demo credentials in env.",
    );
  });

  test("Capture current rubric editor UI state", async ({ page }) => {
    // Login and navigate to the rubric settings
    await loginAsAdmin(page);
    await page.goto(`/admin/process/${DEMO_CYCLE_ID}/stage/documents?tab=settings`);

    // Wait for the rubric toolbar to load — mode buttons are "Visual" and "JSON"
    await expect(page.getByRole("button", { name: "JSON", exact: true })).toBeVisible({
      timeout: 20_000,
    });

    // Scroll down to find the rubric section
    const rubricHeader = page.getByText("Rúbrica de Elegibilidad Automática");
    await rubricHeader.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);

    // Screenshot 1: Rubric section initial state (toolbar with Visual/JSON/Validate)
    await page.screenshot({
      path: "tests/e2e/screenshots/rubric-01-initial.png",
      fullPage: false,
    });

    // Screenshot 2: JSON mode
    await page.getByRole("button", { name: "JSON", exact: true }).click();
    const textarea = page.locator("textarea[id^='eligibility-rubric-']").first();
    await expect(textarea).toBeVisible();
    await page.screenshot({
      path: "tests/e2e/screenshots/rubric-02-json-mode.png",
      fullPage: false,
    });

    // Screenshot 3: Visual mode (with auto-populated criteria)
    await page.getByRole("button", { name: "Visual", exact: true }).click();
    await page.waitForTimeout(300);
    await page.screenshot({
      path: "tests/e2e/screenshots/rubric-03-visual-mode.png",
      fullPage: false,
    });

    // Screenshot 4: If criteria cards exist, expand one
    const criterionCards = page.locator(".rubric-criterion-card");
    if ((await criterionCards.count()) > 0) {
      await criterionCards.first().locator(".rubric-criterion-header").click();
      await page.waitForTimeout(300);
      await page.screenshot({
        path: "tests/e2e/screenshots/rubric-04-criterion-expanded.png",
        fullPage: true,
      });
    }
  });

  test("Capture full settings page for context", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`/admin/process/${DEMO_CYCLE_ID}/stage/documents?tab=settings`);

    await expect(page.getByRole("button", { name: "JSON", exact: true })).toBeVisible({
      timeout: 20_000,
    });

    await page.waitForTimeout(1000);

    // Full page screenshot
    await page.screenshot({
      path: "tests/e2e/screenshots/rubric-06-full-settings-page.png",
      fullPage: true,
    });
  });
});
