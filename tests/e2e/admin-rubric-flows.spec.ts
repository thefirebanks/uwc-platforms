import { expect, test, type Page } from "@playwright/test";
import { bypassReady, loginAsAdmin } from "./helpers";

const DEMO_CYCLE_ID = "98b2f8e4-7266-44b0-acb2-566e2fb2d50e";

function rubricTextarea(page: Page) {
  return page.locator("textarea[id^='eligibility-rubric-']").first();
}

async function openRubricSettings(page: Page) {
  await loginAsAdmin(page);
  await page.goto(`/admin/process/${DEMO_CYCLE_ID}/stage/documents?tab=settings`);

  const saveBtn = page.getByRole("button", { name: /Guardar configuración/i });
  await expect(saveBtn).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: /Modo guiado/i })).toBeVisible({
    timeout: 15_000,
  });
}

async function switchToJsonMode(page: Page) {
  await page.getByRole("button", { name: /JSON avanzado/i }).click();
  await expect(rubricTextarea(page)).toBeVisible({ timeout: 8_000 });
}

async function saveConfig(page: Page) {
  const saveBtn = page.getByRole("button", { name: /Guardar configuración/i });
  await expect(saveBtn).toBeEnabled({ timeout: 8_000 });
  await saveBtn.click();
  await expect(page.locator(".admin-stage-save-status")).toContainText(/guardad|saved/i, {
    timeout: 12_000,
  });
}

async function restoreRubricIfChanged(page: Page, originalValue: string) {
  const textarea = rubricTextarea(page);
  const currentValue = await textarea.inputValue();

  if (currentValue === originalValue) {
    return;
  }

  await textarea.fill(originalValue);
  await textarea.blur();

  const saveBtn = page.getByRole("button", { name: /Guardar configuración/i });
  const isEnabled = await saveBtn.isEnabled();
  if (isEnabled) {
    await saveConfig(page);
  }
}

test.describe("Admin rubric flows", () => {
  test.beforeEach(async () => {
    test.skip(
      !bypassReady,
      "Requires NEXT_PUBLIC_ENABLE_DEV_BYPASS=true and demo credentials in env.",
    );
  });

  test("Flow 1: admin can apply baseline template, validate, and save", async ({ page }) => {
    await openRubricSettings(page);
    await switchToJsonMode(page);
    const textarea = rubricTextarea(page);
    const originalValue = await textarea.inputValue();

    try {
      await page.getByRole("button", { name: /Modo guiado/i }).click();
      await page.getByRole("button", { name: /Usar plantilla básica/i }).click();
      await switchToJsonMode(page);
      await expect(textarea).toContainText('"enabled": true');

      await page.getByRole("button", { name: /Validar rúbrica/i }).click();
      await expect(page.locator(".admin-feedback.success")).toContainText(/Rúbrica válida/i);

      await saveConfig(page);
    } finally {
      await restoreRubricIfChanged(page, originalValue);
    }
  });

  test("Flow 2: admin can apply OCR template and validate", async ({ page }) => {
    await openRubricSettings(page);
    await switchToJsonMode(page);
    const textarea = rubricTextarea(page);
    const originalValue = await textarea.inputValue();

    try {
      await page.getByRole("button", { name: /Modo guiado/i }).click();
      await page.getByRole("button", { name: /Usar plantilla con OCR/i }).click();
      await switchToJsonMode(page);
      await expect(textarea).toContainText("\"kind\": \"ocr_confidence\"");

      await page.getByRole("button", { name: /Validar rúbrica/i }).click();
      await expect(page.locator(".admin-feedback.success")).toContainText(/Rúbrica válida/i);
    } finally {
      await restoreRubricIfChanged(page, originalValue);
    }
  });

  test("Flow 3: invalid JSON blocks save with clear error", async ({ page }) => {
    await openRubricSettings(page);
    await switchToJsonMode(page);
    const textarea = rubricTextarea(page);
    const originalValue = await textarea.inputValue();

    try {
      await textarea.fill("{ not-valid-json");
      await textarea.blur();

      await page.getByRole("button", { name: /Guardar configuración/i }).click();
      await expect(page.locator(".admin-feedback.error").first()).toContainText(
        /rúbrica automática debe ser JSON válido/i,
        {
          timeout: 8_000,
        },
      );
    } finally {
      await restoreRubricIfChanged(page, originalValue);
    }
  });

  test("Flow 4: duplicate criterion ids are rejected before save", async ({ page }) => {
    await openRubricSettings(page);
    await switchToJsonMode(page);
    const textarea = rubricTextarea(page);
    const originalValue = await textarea.inputValue();

    try {
      const duplicateCriteriaRubric = {
        enabled: true,
        criteria: [
          {
            id: "same-id",
            label: "Criterion A",
            kind: "field_present",
            fieldKey: "dateOfBirth",
            onFail: "not_eligible",
            onMissingData: "needs_review",
          },
          {
            id: "same-id",
            label: "Criterion B",
            kind: "field_present",
            fieldKey: "nationality",
            onFail: "not_eligible",
            onMissingData: "needs_review",
          },
        ],
      };

      await textarea.fill(JSON.stringify(duplicateCriteriaRubric, null, 2));
      await textarea.blur();

      await page.getByRole("button", { name: /Validar rúbrica/i }).click();
      await expect(page.locator(".admin-feedback.error").first()).toContainText(
        /Duplicate criterion id/i,
        { timeout: 8_000 },
      );

      await page.getByRole("button", { name: /Guardar configuración/i }).click();
      await expect(page.locator(".admin-feedback.error").first()).toContainText(
        /Duplicate criterion id/i,
        { timeout: 8_000 },
      );
    } finally {
      await restoreRubricIfChanged(page, originalValue);
    }
  });

  test("Flow 5: guided mode can add a criterion without touching JSON", async ({ page }) => {
    await openRubricSettings(page);
    await page.getByRole("button", { name: /Modo guiado/i }).click();

    await page.getByRole("button", { name: /Usar plantilla básica/i }).click();
    await page
      .locator(`select[id^='rubric-new-criterion-kind-']`)
      .first()
      .selectOption("file_uploaded");
    await page.getByRole("button", { name: /Agregar criterio/i }).click();

    await expect(page.getByText(/Criterio 5/i)).toBeVisible({ timeout: 8_000 });
    await page.getByRole("button", { name: /Validar rúbrica/i }).click();
    await expect(page.locator(".admin-feedback.success")).toContainText(/Rúbrica válida/i);
  });
});
