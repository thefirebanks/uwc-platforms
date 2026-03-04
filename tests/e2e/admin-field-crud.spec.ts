/**
 * E2E tests: Admin field CRUD (reversible)
 *
 * Tests that an admin can add, edit, and delete custom form fields
 * via the stage config editor UI. All tests clean up after themselves via
 * afterEach, so they do not pollute the demo database.
 *
 * Prerequisites:
 *   NEXT_PUBLIC_ENABLE_DEV_BYPASS=true
 *   NEXT_PUBLIC_DEMO_ADMIN_EMAIL set
 *   NEXT_PUBLIC_DEMO_PASSWORD set
 */
import { expect, test, type Page } from "@playwright/test";
import { bypassReady, loginAsAdmin } from "./helpers";

const DEMO_CYCLE_ID = "98b2f8e4-7266-44b0-acb2-566e2fb2d50e";
const TEST_FIELD_LABEL = "Campo E2E Test – borrar";
const TEST_FIELD_KEY = "e2eTestFieldDelete";

/** Wait for the save button to be enabled (pending changes exist), then click it and confirm. */
async function saveConfig(page: Page): Promise<void> {
  const saveBtn = page.getByRole("button", { name: /Guardar configuración/i });
  await expect(saveBtn).toBeEnabled({ timeout: 8_000 });
  await saveBtn.click();
  await expect(page.locator(".admin-stage-save-status")).toContainText(/guardad|Saved/i, {
    timeout: 10_000,
  });
}

async function cleanupTestField(page: Page): Promise<void> {
  await loginAsAdmin(page);
  await page.goto(`/admin/process/${DEMO_CYCLE_ID}/stage/documents`);
  await expect(page.getByRole("button", { name: /Guardar configuración/i })).toBeVisible({
    timeout: 15_000,
  });
  const fieldLabel = page.locator(".field-name").filter({ hasText: TEST_FIELD_LABEL });
  if (await fieldLabel.isVisible({ timeout: 2_000 }).catch(() => false)) {
    const fieldCard = fieldLabel.locator(
      "xpath=ancestor::div[contains(@class,'field-card')]",
    );
    // Accept the confirmation dialog that fires when deleting a field
    page.once("dialog", (dialog) => void dialog.accept());
    await fieldCard.locator("button.btn-icon.danger").click();
    await saveConfig(page);
  }
}

test.describe("Admin field CRUD (reversible)", () => {
  test.beforeEach(async () => {
    test.skip(!bypassReady, "Requires NEXT_PUBLIC_ENABLE_DEV_BYPASS=true and demo admin credentials");
  });

  test.afterEach(async ({ page }) => {
    await cleanupTestField(page);
  });

  test("admin can add, verify, and delete a custom field", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`/admin/process/${DEMO_CYCLE_ID}/stage/documents`);
    await expect(page.getByRole("button", { name: /Guardar configuración/i })).toBeVisible({
      timeout: 15_000,
    });

    // 1. Click the current editor's add-field affordance
    await page.getByRole("button", { name: /^Añadir nuevo campo$/i }).last().click();

    // 2. New field card appears in editing state
    const newFieldCard = page.locator(".field-card.editing").last();
    await expect(newFieldCard).toBeVisible({ timeout: 5_000 });

    // 3. Fill field label
    const titleInput = newFieldCard.locator("input[id^='title-']");
    await titleInput.click({ clickCount: 3 });
    await titleInput.fill(TEST_FIELD_LABEL);

    // 4. Fill field key
    const keyInput = newFieldCard.locator("input[id^='key-']");
    await keyInput.click({ clickCount: 3 });
    await keyInput.fill(TEST_FIELD_KEY);

    await newFieldCard.getByRole("button", { name: /Aplicar cambios/i }).click();
    await expect(newFieldCard).not.toBeVisible({ timeout: 5_000 });

    // 5. Save
    await saveConfig(page);

    // 6. Reload and verify the field appears with correct label and key
    await page.reload();
    const savedFieldLabel = page.locator(".field-name").filter({ hasText: TEST_FIELD_LABEL });
    await expect(savedFieldLabel).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(".field-type").filter({ hasText: TEST_FIELD_KEY })).toBeVisible();

    // 7. Delete the field
    const fieldCard = savedFieldLabel.locator(
      "xpath=ancestor::div[contains(@class,'field-card')]",
    );
    // Accept the confirmation dialog that fires when deleting a field
    page.once("dialog", (dialog) => void dialog.accept());
    await fieldCard.locator("button.btn-icon.danger").click();

    // 8. Save deletion
    await saveConfig(page);

    // 9. Reload — field is gone and count restored
    await page.reload();
    await expect(
      page.locator(".field-name").filter({ hasText: TEST_FIELD_LABEL }),
    ).not.toBeVisible();
  });

  test("stage config editor loads with all expected tabs", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`/admin/process/${DEMO_CYCLE_ID}/stage/documents`);
    await expect(page.getByRole("button", { name: /Guardar configuración/i })).toBeVisible({
      timeout: 15_000,
    });

    // The integrated stage workspace exposes the old editor plus the newer comms/Prompt Studio tools.
    await expect(page.getByRole("button", { name: /^Editor de Formulario$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Ajustes y Reglas$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Automatizaciones$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Comunicaciones$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Prompt Studio$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Estadísticas$/i })).toBeVisible();

    // Preview button should be accessible
    await expect(page.locator(".admin-stage-preview-btn")).toBeVisible();
  });
});
