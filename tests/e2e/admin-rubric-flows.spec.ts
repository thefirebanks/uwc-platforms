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
  // Use rw-field--full containers for checkbox groups
  const identityField = page
    .locator(".rw-field--full")
    .filter({ hasText: /Documentos de identidad/i })
    .first();
  const gradesField = page
    .locator(".rw-field--full")
    .filter({ hasText: /Documentos de notas/i })
    .first();

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

  // Expand OCR section if collapsed
  const ocrToggle = page.locator(".rw-ocr-toggle");
  const isExpanded = await ocrToggle.getAttribute("aria-expanded");
  if (isExpanded !== "true") {
    await ocrToggle.click();
    await expect(page.locator(".rw-ocr-panel")).toBeVisible();
  }

  // OCR fields are now <select> elements — pick the first available option for each
  const ocrSelects = [
    page.locator("select[id^='wizard-ocr-ocrNamePath-']").first(),
    page.locator("select[id^='wizard-ocr-ocrBirthYearPath-']").first(),
    page.locator("select[id^='wizard-ocr-ocrDocumentTypePath-']").first(),
    page.locator("select[id^='wizard-ocr-ocrDocumentIssuePath-']").first(),
  ];

  for (const sel of ocrSelects) {
    const selCount = await sel.count();
    if (selCount > 0) {
      const filled = await pickFirstNonEmptyOption(sel);
      if (!filled) {
        // No OCR options available — fill with a placeholder path
        // This means OCR parsing isn't configured, so tests that depend on it
        // will have validation errors on OCR fields
      }
    }
  }
}

async function completeWizardStep2(page: Page, options?: { birthYears?: string; minAverage?: string }) {
  await page.locator("input[id^='wizard-birth-years-']").first().fill(options?.birthYears ?? "2008, 2009, 2010");
  await page.locator("input[id^='wizard-min-average-']").first().fill(options?.minAverage ?? "14");
}

async function activateWizardRubric(page: Page) {
  await completeWizardStep1(page);
  await page.getByRole("button", { name: /^Continuar$/i }).click();
  await completeWizardStep2(page);
  await page.getByRole("button", { name: /^Continuar$/i }).click();
  // New wizard shows "Revisar y activar" without "Paso 3:" prefix
  await expect(page.getByText(/Revisar y activar/i)).toBeVisible();
  await page.getByRole("button", { name: /Activar rúbrica de esta etapa/i }).click();
  await expect(page.getByText(/Rúbrica del wizard activada/i)).toBeVisible();
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

    await activateWizardRubric(page);

    await page.getByRole("button", { name: /Modo avanzado/i }).click();
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

    // New wizard shows actual error messages inside admin-feedback error, not "Bloqueos del wizard"
    await expect(page.locator(".admin-feedback.error")).toContainText(/nombre del postulante/i);
    await expect(page.getByRole("button", { name: /Guardar configuración/i })).toBeDisabled();
  });

  test("Flow 3: advanced edits mark divergence and can reset back to wizard", async ({ page }) => {
    await openRubricSettings(page);
    await page.getByRole("button", { name: /Modo guiado \(recomendado\)/i }).click();
    await activateWizardRubric(page);

    await page.getByRole("button", { name: /Modo avanzado/i }).click();
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
    await expect(page.getByText(/Se restableció la configuración avanzada/i)).toBeVisible();
  });

  test("Flow 4: wizard step 2 blocks invalid thresholds", async ({ page }) => {
    await openRubricSettings(page);
    await page.getByRole("button", { name: /Modo guiado \(recomendado\)/i }).click();
    await completeWizardStep1(page);
    await page.getByRole("button", { name: /^Continuar$/i }).click();

    await completeWizardStep2(page, { birthYears: "", minAverage: "25" });
    await page.getByRole("button", { name: /^Continuar$/i }).click();

    // Step 2 card should still be visible (didn't advance to step 3)
    await expect(page.locator("[data-wizard-step='2']")).toBeVisible();
    // Error banner shows actual validation messages
    await expect(page.locator(".admin-feedback.error")).toContainText(/nacimiento permitido|promedio mínimo/i);
  });

  test("Flow 5: reset suggestions repopulates wizard mappings", async ({ page }) => {
    await openRubricSettings(page);
    await page.getByRole("button", { name: /Modo guiado \(recomendado\)/i }).click();
    await completeWizardStep1(page);

    // Clear a required field
    const nameSelect = page.locator("select[id^='wizard-name-']").first();
    await nameSelect.selectOption("");
    await expect(nameSelect).toHaveValue("");

    // The "Recargar sugerencias desde campos" button is in the wizard footer on step 1
    await page.getByRole("button", { name: /Recargar sugerencias desde campos/i }).click();
    await expect(nameSelect).not.toHaveValue("");
  });

  test("Flow 6: advanced JSON invalid shows errors and save is blocked", async ({ page }) => {
    await openRubricSettings(page);
    await page.getByRole("button", { name: /Modo avanzado/i }).click();
    await page.getByRole("button", { name: /JSON avanzado/i }).click();

    const textarea = rubricTextarea(page);
    await textarea.fill("{\"enabled\": true");
    await textarea.blur();

    await expect(page.locator(".admin-feedback.error")).toContainText(/Errores de rúbrica/i);
    await saveConfig(page);
    await expect(page.locator(".admin-feedback.error")).toContainText(/rúbrica automática no es válida|JSON válido/i);
  });

  test("Flow 7: advanced JSON errors prevent switching back to guided mode", async ({ page }) => {
    await openRubricSettings(page);
    await page.getByRole("button", { name: /Modo avanzado/i }).click();
    await page.getByRole("button", { name: /JSON avanzado/i }).click();

    const textarea = rubricTextarea(page);
    await textarea.fill("{\"enabled\": true");
    await textarea.blur();
    await expect(page.locator(".admin-feedback.error")).toContainText(/Errores de rúbrica/i);

    await page.getByRole("button", { name: "Modo guiado", exact: true }).click();
    await expect(page.getByText(/No puedes volver al modo guiado/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /JSON avanzado/i })).toHaveClass(/btn-primary/);
  });

  test("Flow 8: wizard save survives reload and remains active", async ({ page }) => {
    await openRubricSettings(page);
    await page.getByRole("button", { name: /Modo guiado \(recomendado\)/i }).click();
    await activateWizardRubric(page);
    await saveConfig(page);
    await expect(page.locator(".admin-stage-save-status")).toContainText(/guardad|saved/i, {
      timeout: 12_000,
    });

    await page.reload();
    await expect(page.getByRole("button", { name: /Modo guiado \(recomendado\)/i })).toHaveClass(/btn-primary/);
    // New wizard shows "Mapear evidencia" without "Paso 1:" prefix
    await expect(page.getByText(/Mapear evidencia/i)).toBeVisible();
  });

  test("Flow 9: candidates dashboard requires cycle selection before running rubric", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/candidates");
    const runButton = page.getByRole("button", { name: /Ejecutar rúbrica automática/i });

    const cycleFilter = page.locator("select.filter-select").first();
    await cycleFilter.selectOption("all");

    await expect(runButton).toBeDisabled();
    await expect(runButton).toHaveAttribute("title", /Selecciona un proceso/i);
  });
});
