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
import { bypassReady, findSectionContainerByTitle, loginAsAdmin } from "./helpers";

const DEMO_CYCLE_ID = "98b2f8e4-7266-44b0-acb2-566e2fb2d50e";
const TEST_FIELD_LABEL = "Campo E2E Test – borrar";
const TEST_FIELD_KEY = "e2eTestFieldDelete";

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
    await fieldCard.locator("button.btn-icon.danger").click();
    await page.getByRole("button", { name: /Guardar configuración/i }).click();
    await expect(page.locator(".admin-stage-save-status")).toContainText(/Guardado|Saved/, {
      timeout: 10_000,
    });
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

    // Find the "Otros campos" section by scanning title inputs
    const otherSection = await findSectionContainerByTitle(page, /Otros campos/i);
    if (otherSection === null) {
      test.skip(true, '"Otros campos" section not found in this stage');
      return;
    }

    // Ensure section is expanded
    const collapseBtn = otherSection.getByRole("button", {
      name: /Colapsar sección|Expandir sección/i,
    });
    const ariaPressed = await collapseBtn.getAttribute("aria-pressed").catch(() => "true");
    if (ariaPressed === "false") {
      await collapseBtn.click();
    }

    // Count existing fields in this section
    const fieldsBefore = await otherSection.locator(".field-card").count();

    // 1. Click "Añadir nuevo campo" in the "Otros campos" section
    await otherSection.locator(".admin-stage-section-add-field").click();

    // 2. New field card appears in editing state
    const newFieldCard = otherSection.locator(".field-card.editing").last();
    await expect(newFieldCard).toBeVisible({ timeout: 5_000 });

    // 3. Fill field label
    const titleInput = newFieldCard.locator("input[id^='title-']");
    await titleInput.click({ clickCount: 3 });
    await titleInput.fill(TEST_FIELD_LABEL);

    // 4. Fill field key
    const keyInput = newFieldCard.locator("input[id^='key-']");
    await keyInput.click({ clickCount: 3 });
    await keyInput.fill(TEST_FIELD_KEY);

    // 5. Save
    await page.getByRole("button", { name: /Guardar configuración/i }).click();
    await expect(page.locator(".admin-stage-save-status")).toContainText(/Guardado|Saved/, {
      timeout: 10_000,
    });

    // 6. Reload and verify the field appears with correct label and key
    await page.reload();
    const savedFieldLabel = page.locator(".field-name").filter({ hasText: TEST_FIELD_LABEL });
    await expect(savedFieldLabel).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(".field-type").filter({ hasText: TEST_FIELD_KEY })).toBeVisible();

    // Verify field count increased
    const fieldsAfterAdd = await otherSection.locator(".field-card").count();
    expect(fieldsAfterAdd).toBe(fieldsBefore + 1);

    // 7. Delete the field
    const fieldCard = savedFieldLabel.locator(
      "xpath=ancestor::div[contains(@class,'field-card')]",
    );
    await fieldCard.locator("button.btn-icon.danger").click();

    // 8. Save deletion
    await page.getByRole("button", { name: /Guardar configuración/i }).click();
    await expect(page.locator(".admin-stage-save-status")).toContainText(/Guardado|Saved/, {
      timeout: 10_000,
    });

    // 9. Reload — field is gone and count restored
    await page.reload();
    await expect(
      page.locator(".field-name").filter({ hasText: TEST_FIELD_LABEL }),
    ).not.toBeVisible();
    const fieldsAfterDelete = await otherSection.locator(".field-card").count();
    expect(fieldsAfterDelete).toBe(fieldsBefore);
  });

  test("stage config editor loads with all expected tabs", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`/admin/process/${DEMO_CYCLE_ID}/stage/documents`);
    await expect(page.getByRole("button", { name: /Guardar configuración/i })).toBeVisible({
      timeout: 15_000,
    });

    // All four tabs should be visible
    await expect(page.getByText(/Editor de Formulario/i)).toBeVisible();
    await expect(page.getByText(/Ajustes y Reglas/i)).toBeVisible();
    await expect(page.getByText(/Automatizaciones de correo/i)).toBeVisible();
    await expect(page.getByText(/Estadísticas/i)).toBeVisible();

    // Preview button should be accessible
    await expect(page.locator(".admin-stage-preview-btn")).toBeVisible();
  });
});
