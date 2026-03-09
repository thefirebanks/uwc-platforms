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

async function openRubricSettings(page: Page) {
  await loginAsAdmin(page);
  await page.goto(`/admin/process/${DEMO_CYCLE_ID}/stage/documents?tab=settings`);
  // Wait for the rubric toolbar to load — mode buttons are "Visual" and "JSON"
  await expect(page.getByRole("button", { name: "JSON", exact: true })).toBeVisible({
    timeout: 20_000,
  });
}

const SAMPLE_RUBRIC_JSON = JSON.stringify(
  {
    enabled: true,
    criteria: [
      {
        id: "dob_check",
        label: "DOB allowed",
        kind: "field_in",
        fieldKey: "dateOfBirth",
        allowedValues: ["2008-01-01", "2009-01-01"],
        caseSensitive: false,
        onFail: "not_eligible",
        onMissingData: "not_eligible",
      },
      {
        id: "name_present",
        label: "Name is filled",
        kind: "field_present",
        fieldKey: "firstname",
        onFail: "needs_review",
        onMissingData: "needs_review",
      },
    ],
  },
  null,
  2,
);

test.describe("Admin rubric visual checks", () => {
  test.beforeEach(async () => {
    test.skip(
      !bypassReady,
      "Requires NEXT_PUBLIC_ENABLE_DEV_BYPASS=true and demo credentials in env.",
    );
  });

  test("captures visual criterion builder screens", async ({ page }) => {
    await openRubricSettings(page);

    // Screenshot 1: Rubric section initial state (with auto-populated criteria)
    const rubricHeader = page.getByText("Rúbrica de Elegibilidad Automática");
    await rubricHeader.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await page.screenshot({
      path: screenshotPath("01-rubric-initial-state.png"),
      fullPage: false,
    });

    // Screenshot 2: Set rubric via JSON and switch to Visual mode
    await page.getByRole("button", { name: "JSON", exact: true }).click();
    await page.locator("textarea[id^='eligibility-rubric-']").first().fill(SAMPLE_RUBRIC_JSON);
    await page.locator("textarea[id^='eligibility-rubric-']").first().blur();
    await page.screenshot({
      path: screenshotPath("02-json-mode.png"),
      fullPage: false,
    });

    // Screenshot 3: Visual mode with criteria
    await page.getByRole("button", { name: "Visual", exact: true }).click();
    await expect(page.locator(".rubric-criterion-card").first()).toBeVisible();
    await page.screenshot({
      path: screenshotPath("03-visual-mode-criteria.png"),
      fullPage: false,
    });

    // Screenshot 4: Expand a criterion card
    await page.locator(".rubric-criterion-header").first().click();
    await expect(page.locator(".rubric-criterion-body").first()).toBeVisible();
    await page.screenshot({
      path: screenshotPath("04-criterion-expanded.png"),
      fullPage: true,
    });
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

    await page.screenshot({
      path: screenshotPath("06-candidates-rubric-feedback.png"),
      fullPage: true,
    });
  });
});
