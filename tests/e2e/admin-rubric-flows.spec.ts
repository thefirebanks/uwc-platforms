import { expect, test, type Locator, type Page } from "@playwright/test";
import { bypassReady, loginAsAdmin } from "./helpers";

const DEMO_CYCLE_ID = "98b2f8e4-7266-44b0-acb2-566e2fb2d50e";

function rubricTextarea(page: Page) {
  return page.locator("textarea[id^='eligibility-rubric-']").first();
}

async function openRubricSettings(page: Page) {
  await loginAsAdmin(page);
  await page.goto(`/admin/process/${DEMO_CYCLE_ID}/stage/documents?tab=settings`);
  await expect(page.getByRole("button", { name: /Modo guiado \(recomendado\)/i })).toBeVisible({
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

async function ensureAtLeastOneChecked(groupField: Locator) {
  const checkboxes = groupField.locator("input[type='checkbox']");
  const count = await checkboxes.count();
  if (count === 0) {
    return false;
  }

  let hasChecked = false;
  for (let i = 0; i < count; i += 1) {
    if (await checkboxes.nth(i).isChecked()) {
      hasChecked = true;
      break;
    }
  }

  if (!hasChecked) {
    await checkboxes.first().check();
  }
  return true;
}

async function completeWizardStep1(page: Page) {
  const identityField = page.locator(".form-field").filter({ hasText: /Documento de identidad \(requerido\)/i }).first();
  const gradesField = page.locator(".form-field").filter({ hasText: /Documentos de notas \(requerido\)/i }).first();

  const hasIdentityCheckboxes = await ensureAtLeastOneChecked(identityField);
  const hasGradesCheckboxes = await ensureAtLeastOneChecked(gradesField);
  test.skip(!hasIdentityCheckboxes || !hasGradesCheckboxes, "Se requieren campos de archivo para wizard.");

  const requiredSelects = [
    page.locator("select[id^='wizard-name-']").first(),
    page.locator("select[id^='wizard-average-']").first(),
    page.locator("select[id^='wizard-authorization-']").first(),
    page.locator("select[id^='wizard-photo-']").first(),
  ];

  for (const selectLocator of requiredSelects) {
    const filled = await pickFirstNonEmptyOption(selectLocator);
    test.skip(!filled, "No hay opciones disponibles para un mapeo requerido del wizard.");
  }

  await page.locator("input[id^='wizard-ocr-name-']").first().fill("fullName");
  await page.locator("input[id^='wizard-ocr-birth-']").first().fill("birthYear");
  await page.locator("input[id^='wizard-ocr-type-']").first().fill("documentType");
  await page.locator("input[id^='wizard-ocr-issue-']").first().fill("documentIssue");
}

test.describe("Admin rubric wizard flows", () => {
  test.beforeEach(async () => {
    test.skip(
      !bypassReady,
      "Requires NEXT_PUBLIC_ENABLE_DEV_BYPASS=true and demo credentials in env.",
    );
  });

  test("Flow 1: wizard happy path compiles rubric and allows save", async ({ page }) => {
    await openRubricSettings(page);
    await page.getByRole("button", { name: /Modo guiado \(recomendado\)/i }).click();

    await completeWizardStep1(page);
    await page.getByRole("button", { name: /^Continuar$/i }).click();

    await page.locator("input[id^='wizard-birth-years-']").first().fill("2008, 2009, 2010");
    await page.locator("input[id^='wizard-min-average-']").first().fill("14");
    await page.getByRole("button", { name: /^Continuar$/i }).click();

    await expect(page.getByText(/Paso 3: Revisar y activar/i)).toBeVisible();
    await page.getByRole("button", { name: /Activar rúbrica de esta etapa/i }).click();
    await expect(page.locator(".admin-feedback.success")).toContainText(/Rúbrica del wizard activada/i);

    await page.getByRole("button", { name: /Advanced/i }).click();
    await page.getByRole("button", { name: /JSON avanzado/i }).click();
    await expect(rubricTextarea(page)).toContainText('"id": "top_third_or_grade_average"');
    await expect(rubricTextarea(page)).toContainText('"completenessMode": "strict_form_valid"');

    await saveConfig(page);
    await expect(page.locator(".admin-stage-save-status")).toContainText(/guardad|saved/i, {
      timeout: 12_000,
    });
  });

  test("Flow 2: wizard blocks progress and save when required mapping is missing", async ({ page }) => {
    await openRubricSettings(page);
    await page.getByRole("button", { name: /Modo guiado \(recomendado\)/i }).click();

    await completeWizardStep1(page);
    await page.locator("select[id^='wizard-name-']").first().selectOption("");
    await page.getByRole("button", { name: /^Continuar$/i }).click();

    await expect(page.locator(".admin-feedback.error")).toContainText(/Bloqueos del wizard/i);
    await expect(page.getByRole("button", { name: /Guardar configuración/i })).toBeDisabled();
  });

  test("Flow 3: advanced edits mark divergence and can reset back to wizard", async ({ page }) => {
    await openRubricSettings(page);
    await page.getByRole("button", { name: /Modo guiado \(recomendado\)/i }).click();
    await completeWizardStep1(page);
    await page.getByRole("button", { name: /^Continuar$/i }).click();
    await page.locator("input[id^='wizard-birth-years-']").first().fill("2008, 2009, 2010");
    await page.locator("input[id^='wizard-min-average-']").first().fill("14");
    await page.getByRole("button", { name: /^Continuar$/i }).click();
    await page.getByRole("button", { name: /Activar rúbrica de esta etapa/i }).click();

    await page.getByRole("button", { name: /Advanced/i }).click();
    await page.getByRole("button", { name: /JSON avanzado/i }).click();

    const textarea = rubricTextarea(page);
    const originalValue = await textarea.inputValue();
    const parsed = JSON.parse(originalValue) as {
      criteria?: Array<{ label?: string }>;
    };
    if (Array.isArray(parsed.criteria) && parsed.criteria.length > 0) {
      parsed.criteria[0]!.label = `Custom label ${Date.now()}`;
    }
    await textarea.fill(JSON.stringify(parsed, null, 2));
    await textarea.blur();

    await expect(page.locator(".admin-feedback.warning")).toContainText(/Advanced diverge del wizard/i);
    await page.getByRole("button", { name: /Restablecer al wizard/i }).click();
    await expect(page.getByRole("button", { name: /Modo guiado \(recomendado\)/i })).toHaveClass(
      /btn-primary/,
    );
    await expect(page.locator(".admin-feedback.success")).toContainText(/restableció/i);
  });
});
