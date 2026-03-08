import { expect, test, type Locator, type Page } from "@playwright/test";
import { bypassReady, loginAsAdmin } from "./helpers";

const DEMO_CYCLE_ID = "98b2f8e4-7266-44b0-acb2-566e2fb2d50e";

function rubricTextarea(page: Page) {
  return page.locator("textarea[id^='eligibility-rubric-']").first();
}

async function openRubricSettings(page: Page) {
  await loginAsAdmin(page);
  await page.goto(`/admin/process/${DEMO_CYCLE_ID}/stage/documents?tab=settings`);
  // Wait for the rubric toolbar to load — mode buttons are "Visual" and "JSON"
  await expect(page.getByRole("button", { name: "JSON", exact: true })).toBeVisible({
    timeout: 20_000,
  });
}

async function saveConfig(page: Page) {
  const saveBtn = page.getByRole("button", { name: /Guardar configuración/i });
  await expect(saveBtn).toBeEnabled({ timeout: 8_000 });
  await saveBtn.click();
}

async function pickFirstNonEmptyOption(selectLocator: Locator) {
  const options = await selectLocator.locator("option").evaluateAll((nodes) =>
    nodes
      .map((node) => (node as HTMLOptionElement).value)
      .filter((value) => value.trim().length > 0),
  );
  if (options.length === 0) {
    return false;
  }
  await selectLocator.selectOption(options[0]!);
  return true;
}

const VALID_RUBRIC_JSON = JSON.stringify(
  {
    enabled: true,
    criteria: [
      {
        id: "test_field_present",
        label: "Test field present",
        kind: "field_present",
        fieldKey: "firstname",
        onFail: "not_eligible",
        onMissingData: "needs_review",
      },
    ],
  },
  null,
  2,
);

test.describe("Admin rubric editor flows", () => {
  test.beforeEach(async () => {
    test.skip(
      !bypassReady,
      "Requires NEXT_PUBLIC_ENABLE_DEV_BYPASS=true and demo credentials in env.",
    );
  });

  test("Flow 1: template generator populates rubric and allows save", async ({ page }) => {
    await openRubricSettings(page);

    // Expand the template generator
    const templateSummary = page.locator(".rubric-template-summary");
    await expect(templateSummary).toBeVisible();
    await templateSummary.click();
    await expect(page.locator(".rubric-template-body")).toBeVisible();

    // Fill required template selects
    const templateSelects = [
      page.locator("select[id^='tpl-name-']").first(),
      page.locator("select[id^='tpl-average-']").first(),
      page.locator("select[id^='tpl-authorization-']").first(),
      page.locator("select[id^='tpl-photo-']").first(),
    ];
    for (const sel of templateSelects) {
      if ((await sel.count()) > 0) {
        await pickFirstNonEmptyOption(sel);
      }
    }

    // Fill policy inputs
    const birthYearsInput = page.locator("input[id^='tpl-birth-years-']").first();
    if ((await birthYearsInput.count()) > 0) {
      await birthYearsInput.fill("2008, 2009, 2010");
    }

    const minAvgInput = page.locator("input[id^='tpl-average-min-']").first();
    if ((await minAvgInput.count()) > 0) {
      await minAvgInput.fill("14");
    }

    // Generate rubric from template
    await page.getByRole("button", { name: /Generar rúbrica desde plantilla/i }).click();

    // Verify criteria appeared in the visual builder
    await expect(page.locator(".rubric-criterion-card").first()).toBeVisible({ timeout: 5_000 });

    // Switch to JSON mode to verify the generated JSON
    await page.getByRole("button", { name: "JSON", exact: true }).click();
    const textarea = rubricTextarea(page);
    await expect(textarea).toBeVisible();
    const jsonText = await textarea.inputValue();
    const parsed = JSON.parse(jsonText) as { enabled?: boolean; criteria?: unknown[] };
    expect(parsed.enabled).toBe(true);
    expect(Array.isArray(parsed.criteria)).toBe(true);
    expect(parsed.criteria!.length).toBeGreaterThan(0);

    // Save and verify
    await saveConfig(page);
    await expect(page.locator(".admin-stage-save-status")).toContainText(/guardad|saved/i, {
      timeout: 12_000,
    });
  });

  test("Flow 2: Visual mode shows criteria and supports collapse/expand", async ({ page }) => {
    await openRubricSettings(page);

    // First set a valid rubric via JSON mode
    await page.getByRole("button", { name: "JSON", exact: true }).click();
    await rubricTextarea(page).fill(VALID_RUBRIC_JSON);
    await rubricTextarea(page).blur();

    // Switch to Visual mode
    await page.getByRole("button", { name: "Visual", exact: true }).click();

    // Verify the criterion card is visible
    const card = page.locator(".rubric-criterion-card").first();
    await expect(card).toBeVisible();
    await expect(card.locator(".rubric-criterion-title")).toContainText("Test field present");

    // Click header to expand the criterion body
    await card.locator(".rubric-criterion-header").click();
    await expect(card.locator(".rubric-criterion-body")).toBeVisible();

    // Verify form fields are present
    await expect(card.locator("select").filter({ hasText: /field_present/ })).toBeVisible();

    // Click header again to collapse
    await card.locator(".rubric-criterion-header").click();
    await expect(card.locator(".rubric-criterion-body")).not.toBeVisible();
  });

  test("Flow 3: add criterion via Visual mode", async ({ page }) => {
    await openRubricSettings(page);

    // Start with an empty enabled rubric
    await page.getByRole("button", { name: "JSON", exact: true }).click();
    await rubricTextarea(page).fill(JSON.stringify({ enabled: true, criteria: [] }, null, 2));
    await rubricTextarea(page).blur();

    // Switch to Visual mode
    await page.getByRole("button", { name: "Visual", exact: true }).click();

    // Should show the empty state
    await expect(page.locator(".rubric-empty-state")).toBeVisible();

    // Select a kind from the dropdown and add a criterion
    const kindSelect = page.locator("select[id^='rubric-new-criterion-kind-']").first();
    await expect(kindSelect).toBeVisible();
    await kindSelect.selectOption("field_present");
    await page.getByRole("button", { name: /Agregar criterio/i }).click();

    // Verify a new card appeared
    await expect(page.locator(".rubric-criterion-card")).toHaveCount(1);
    await expect(page.locator(".rubric-summary")).toContainText("1 criterio");
  });

  test("Flow 4: delete criterion via Visual mode", async ({ page }) => {
    await openRubricSettings(page);

    // Set a rubric with one criterion
    await page.getByRole("button", { name: "JSON", exact: true }).click();
    await rubricTextarea(page).fill(VALID_RUBRIC_JSON);
    await rubricTextarea(page).blur();

    // Switch to Visual mode
    await page.getByRole("button", { name: "Visual", exact: true }).click();
    await expect(page.locator(".rubric-criterion-card")).toHaveCount(1);

    // Delete the criterion
    await page.locator(".rubric-btn-delete").first().click();
    await expect(page.locator(".rubric-criterion-card")).toHaveCount(0);
    await expect(page.locator(".rubric-empty-state")).toBeVisible();
  });

  test("Flow 5: JSON mode shows invalid JSON error and blocks save", async ({ page }) => {
    await openRubricSettings(page);
    await page.getByRole("button", { name: "JSON", exact: true }).click();

    const textarea = rubricTextarea(page);
    await textarea.fill('{"enabled": true');
    await textarea.blur();

    await expect(page.locator(".admin-feedback.error")).toBeVisible({ timeout: 5_000 });

    await saveConfig(page);
    // Error feedback should remain or appear about invalid rubric
    await expect(page.locator(".admin-feedback.error")).toBeVisible({ timeout: 5_000 });
  });

  test("Flow 6: Validate button checks rubric and shows feedback", async ({ page }) => {
    await openRubricSettings(page);

    // Set a valid rubric first
    await page.getByRole("button", { name: "JSON", exact: true }).click();
    await rubricTextarea(page).fill(VALID_RUBRIC_JSON);
    await rubricTextarea(page).blur();

    // Switch back to Visual mode and click Validate
    await page.getByRole("button", { name: "Visual", exact: true }).click();
    await page.getByRole("button", { name: "Validar", exact: true }).click();

    // Should show success feedback (no errors)
    await expect(page.locator(".admin-feedback.success")).toBeVisible({ timeout: 5_000 });
  });

  test("Flow 7: mode toggle preserves rubric content between Visual and JSON", async ({
    page,
  }) => {
    await openRubricSettings(page);

    // Set rubric in JSON mode
    await page.getByRole("button", { name: "JSON", exact: true }).click();
    await rubricTextarea(page).fill(VALID_RUBRIC_JSON);
    await rubricTextarea(page).blur();

    // Switch to Visual — should show the criterion
    await page.getByRole("button", { name: "Visual", exact: true }).click();
    await expect(page.locator(".rubric-criterion-card")).toHaveCount(1);

    // Switch back to JSON — content should still be there
    await page.getByRole("button", { name: "JSON", exact: true }).click();
    const jsonText = await rubricTextarea(page).inputValue();
    const parsed = JSON.parse(jsonText) as { criteria?: unknown[] };
    expect(parsed.criteria).toHaveLength(1);
  });

  test("Flow 8: rubric save survives page reload", async ({ page }) => {
    await openRubricSettings(page);

    // Set and save a rubric
    await page.getByRole("button", { name: "JSON", exact: true }).click();
    await rubricTextarea(page).fill(VALID_RUBRIC_JSON);
    await rubricTextarea(page).blur();
    await saveConfig(page);
    await expect(page.locator(".admin-stage-save-status")).toContainText(/guardad|saved/i, {
      timeout: 12_000,
    });

    // Reload
    await page.reload();
    await expect(page.getByRole("button", { name: "JSON", exact: true })).toBeVisible({
      timeout: 20_000,
    });

    // Verify rubric content survived
    await page.getByRole("button", { name: "JSON", exact: true }).click();
    const jsonText = await rubricTextarea(page).inputValue();
    const parsed = JSON.parse(jsonText) as { criteria?: Array<{ id?: string }> };
    expect(parsed.criteria).toHaveLength(1);
    expect(parsed.criteria![0]!.id).toBe("test_field_present");
  });

  test("Flow 9: candidates dashboard requires cycle selection before running rubric", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/candidates");
    const runButton = page.getByRole("button", { name: /Ejecutar rúbrica automática/i });

    const cycleFilter = page.locator("select.filter-select").first();
    await cycleFilter.selectOption("all");

    await expect(runButton).toBeDisabled();
    await expect(runButton).toHaveAttribute("title", /Selecciona un proceso/i);
  });
});
