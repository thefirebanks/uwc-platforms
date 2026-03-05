import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
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
  await expect(page.getByRole("button", { name: /Modo guiado \(recomendado\)/i })).toBeVisible({
    timeout: 20_000,
  });
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
    test.skip(!filled, "No hay opciones disponibles para mapeos requeridos.");
  }

  await page.locator("input[id^='wizard-ocr-name-']").first().fill("fullName");
  await page.locator("input[id^='wizard-ocr-birth-']").first().fill("birthYear");
  await page.locator("input[id^='wizard-ocr-type-']").first().fill("documentType");
  await page.locator("input[id^='wizard-ocr-issue-']").first().fill("documentIssue");
}

test.describe("Admin rubric visual checks", () => {
  test.beforeEach(async () => {
    test.skip(
      !bypassReady,
      "Requires NEXT_PUBLIC_ENABLE_DEV_BYPASS=true and demo credentials in env.",
    );
  });

  test("captures wizard step screens and blocking state", async ({ page }) => {
    await openRubricSettings(page);
    await page.getByRole("button", { name: /Modo guiado \(recomendado\)/i }).click();
    await expect(page.getByText(/Paso 1: Mapear evidencia/i)).toBeVisible();
    await page.screenshot({
      path: screenshotPath("01-wizard-step1-evidence.png"),
      fullPage: true,
    });

    await completeWizardStep1(page);
    await page.getByRole("button", { name: /^Continuar$/i }).click();

    await expect(page.getByText(/Paso 2: Definir políticas/i)).toBeVisible();
    await page.screenshot({
      path: screenshotPath("02-wizard-step2-policy.png"),
      fullPage: true,
    });

    await page.locator("input[id^='wizard-birth-years-']").first().fill("2008, 2009, 2010");
    await page.locator("input[id^='wizard-min-average-']").first().fill("14");
    await page.getByRole("button", { name: /^Continuar$/i }).click();
    await expect(page.getByText(/Paso 3: Revisar y activar/i)).toBeVisible();
    await page.screenshot({
      path: screenshotPath("03-wizard-step3-summary.png"),
      fullPage: true,
    });

    await page.getByRole("button", { name: /Volver/i }).click();
    await page.getByRole("button", { name: /Volver/i }).click();
    await page.locator("select[id^='wizard-name-']").first().selectOption("");
    await page.getByRole("button", { name: /^Continuar$/i }).click();
    await expect(page.locator(".admin-feedback.error")).toContainText(/Bloqueos del wizard/i);
    await page.screenshot({
      path: screenshotPath("04-wizard-blocking-validation.png"),
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
      path: screenshotPath("05-candidates-rubric-feedback.png"),
      fullPage: true,
    });
  });
});
