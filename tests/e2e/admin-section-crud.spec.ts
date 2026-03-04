/**
 * E2E tests: Admin section CRUD (reversible)
 *
 * Tests that an admin can add, rename, reorder, and delete form sections
 * via the stage config editor UI. All tests clean up after themselves via
 * afterEach, so they do not pollute the demo database.
 *
 * Prerequisites:
 *   NEXT_PUBLIC_ENABLE_DEV_BYPASS=true
 *   NEXT_PUBLIC_DEMO_ADMIN_EMAIL set
 *   NEXT_PUBLIC_DEMO_PASSWORD set
 */
import { expect, test, type Page } from "@playwright/test";
import {
  bypassReady,
  findSectionContainerByTitle,
  hasSectionWithTitle,
  loginAsAdmin,
} from "./helpers";

const DEMO_CYCLE_ID = "98b2f8e4-7266-44b0-acb2-566e2fb2d50e";
const TEST_SECTION_TITLE = "Sección E2E Test – borrar";

function normalizeSectionHeading(value: string | null | undefined): string {
  return (value ?? "").replace(/^Sección \d+:\s*/i, "").trim();
}

async function navigateToStageEditor(page: Page, stageCode = "documents"): Promise<void> {
  await page.goto(`/admin/process/${DEMO_CYCLE_ID}/stage/${stageCode}`);
  await expect(page.getByRole("button", { name: /Guardar configuración/i })).toBeVisible({
    timeout: 15_000,
  });
}

/** Wait for the save button to be enabled (pending changes exist), then click it and confirm. */
async function saveConfig(page: Page): Promise<void> {
  const saveBtn = page.getByRole("button", { name: /Guardar configuración/i });
  await expect(saveBtn).toBeEnabled({ timeout: 8_000 });
  await saveBtn.click();
  await expect(page.locator(".admin-stage-save-status")).toContainText(/guardad|Saved/i, {
    timeout: 10_000,
  });
}

/** Remove any leftover test section from a previous failed run. */
async function cleanupTestSection(page: Page): Promise<void> {
  await loginAsAdmin(page);
  await navigateToStageEditor(page);
  const container = await findSectionContainerByTitle(page, TEST_SECTION_TITLE);
  if (container !== null) {
    // Accept the confirmation dialog that fires when deleting a section
    page.once("dialog", (dialog) => void dialog.accept());
    await container.getByRole("button", { name: "Eliminar sección" }).click();
    await saveConfig(page);
  }
}

test.describe("Admin section CRUD (reversible)", () => {
  test.beforeEach(async () => {
    test.skip(!bypassReady, "Requires NEXT_PUBLIC_ENABLE_DEV_BYPASS=true and demo admin credentials");
  });

  test.afterEach(async ({ page }) => {
    await cleanupTestSection(page);
  });

  test("admin can add, rename, and delete a custom section", async ({ page }) => {
    await loginAsAdmin(page);
    await navigateToStageEditor(page);

    // Record section count before adding
    const sectionsBefore = await page.locator(".admin-stage-section-placeholder").count();

    // 1. Click "Añadir nueva sección" — creates a section with a default title inline
    await page.getByRole("button", { name: /Añadir nueva sección/i }).click();

    // 2. The new section title input is the last one in the list
    const newSectionTitleInput = page.locator("input[id^='section-title-']").last();
    await expect(newSectionTitleInput).toBeVisible({ timeout: 5_000 });

    // 3. Rename to our test title
    await newSectionTitleInput.click({ clickCount: 3 }); // select all
    await newSectionTitleInput.fill(TEST_SECTION_TITLE);
    await expect(newSectionTitleInput).toHaveValue(TEST_SECTION_TITLE);

    // 4. Save
    await saveConfig(page);

    // 5. Reload — verify persistence
    await page.reload();
    const sectionsAfterAdd = await page.locator(".admin-stage-section-placeholder").count();
    expect(sectionsAfterAdd).toBe(sectionsBefore + 1);

    // Verify our section is in the list
    const hasSection = await hasSectionWithTitle(page, TEST_SECTION_TITLE);
    expect(hasSection).toBe(true);

    // 6. Find and delete the test section
    const container = await findSectionContainerByTitle(page, TEST_SECTION_TITLE);
    expect(container).not.toBeNull();
    // Accept the confirmation dialog that fires when deleting a section
    page.once("dialog", (dialog) => void dialog.accept());
    await container!.getByRole("button", { name: "Eliminar sección" }).click();

    // 7. Save deletion
    await saveConfig(page);

    // 8. Reload — section is gone and count restored
    await page.reload();
    const hasSectionAfterDelete = await hasSectionWithTitle(page, TEST_SECTION_TITLE);
    expect(hasSectionAfterDelete).toBe(false);
    const sectionsAfterDelete = await page.locator(".admin-stage-section-placeholder").count();
    expect(sectionsAfterDelete).toBe(sectionsBefore);
  });

  test("admin can reorder sections and restore original order", async ({ page }) => {
    await loginAsAdmin(page);
    await navigateToStageEditor(page);

    const sections = page.locator(".admin-stage-section-heading-row");
    const count = await sections.count();
    if (count < 2) {
      test.skip(true, "Need at least 2 sections to test reordering");
      return;
    }

    const firstHeading = sections.nth(0).locator(".builder-section-title");
    const secondHeading = sections.nth(1).locator(".builder-section-title");
    const firstTitle = normalizeSectionHeading(await firstHeading.textContent());
    const secondTitle = normalizeSectionHeading(await secondHeading.textContent());
    expect(firstTitle).toBeTruthy();
    expect(secondTitle).toBeTruthy();

    // Move second section up
    const secondContainer = sections.nth(1);
    await secondContainer.getByRole("button", { name: "Subir sección" }).click();

    // Verify order swapped in the editor
    await expect(sections.nth(0).locator(".builder-section-title")).toContainText(secondTitle);
    await expect(sections.nth(1).locator(".builder-section-title")).toContainText(firstTitle);

    // Restore by moving it back down
    const nowFirstContainer = sections.nth(0);
    await nowFirstContainer.getByRole("button", { name: "Bajar sección" }).click();

    // Verify order restored — no save needed as state matches DB snapshot
    await expect(sections.nth(0).locator(".builder-section-title")).toContainText(firstTitle);
    await expect(sections.nth(1).locator(".builder-section-title")).toContainText(secondTitle);
  });

  test("admin can collapse and expand a section", async ({ page }) => {
    await loginAsAdmin(page);
    await navigateToStageEditor(page);

    // Find the first section heading row that has a collapse button
    // (only non-empty sections have canCollapse=true)
    const collapseBtn = page
      .locator(".admin-stage-section-heading-row")
      .getByRole("button", { name: /Colapsar sección|Expandir sección/i })
      .first();
    await expect(collapseBtn).toBeVisible({ timeout: 5_000 });

    // Toggle collapse
    await collapseBtn.click();

    // The section heading row should still be visible
    await expect(page.locator(".admin-stage-section-heading-row").first()).toBeVisible();

    // Toggle expand
    await collapseBtn.click();
  });
});
