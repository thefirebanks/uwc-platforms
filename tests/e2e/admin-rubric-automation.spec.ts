import { expect, test } from "@playwright/test";
import { bypassReady, loginAsAdmin } from "./helpers";

test.describe("Admin rubric automation", () => {
  test.beforeEach(async () => {
    test.skip(
      !bypassReady,
      "Requires NEXT_PUBLIC_ENABLE_DEV_BYPASS=true and demo credentials in env.",
    );
  });

  test("shows rubric controls and triggers rubric evaluation API", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/candidates");

    await expect(
      page.getByRole("button", { name: "Ejecutar rúbrica automática" }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("columnheader", { name: "Dictamen automático" })).toBeVisible();

    const cycleFilter = page.locator("select.filter-select").first();
    const optionValues = await cycleFilter.locator("option").evaluateAll((options) =>
      options
        .map((option) => ({
          value: (option as HTMLOptionElement).value,
          label: option.textContent?.trim() ?? "",
        }))
        .filter((option) => option.value !== "all" && option.value.length > 0),
    );

    if (optionValues.length === 0) {
      test.skip(true, "No cycle options available for rubric execution.");
      return;
    }

    await cycleFilter.selectOption(optionValues[0]!.value);

    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/applications/rubric-evaluate") &&
        response.request().method() === "POST",
      { timeout: 20_000 },
    );

    await page.getByRole("button", { name: "Ejecutar rúbrica automática" }).click();

    const response = await responsePromise;
    expect([200, 422]).toContain(response.status());

    await expect(page.locator(".admin-feedback")).toBeVisible({ timeout: 15_000 });
  });

  test("shows a clear message when running rubric in an unconfigured stage", async ({ page }) => {
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

    if (optionValues.length === 0) {
      test.skip(true, "No cycle options available for rubric execution.");
      return;
    }

    await cycleFilter.selectOption(optionValues[0]!.value);
    await page.locator("select.filter-select").nth(1).selectOption("exam_placeholder");

    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/applications/rubric-evaluate") &&
        response.request().method() === "POST",
      { timeout: 20_000 },
    );

    await page.getByRole("button", { name: "Ejecutar rúbrica automática" }).click();

    const response = await responsePromise;
    expect(response.status()).toBe(422);

    await expect(
      page.getByText(/rúbrica automática está desactivada|no tiene criterios configurados/i),
    ).toBeVisible({ timeout: 15_000 });
  });
});
