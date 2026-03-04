import { expect, test } from "@playwright/test";
import { bypassReady, loginAsAdmin } from "./helpers";

test.describe("Admin candidate viewer", () => {
  test.beforeEach(async () => {
    test.skip(
      !bypassReady,
      "Requires NEXT_PUBLIC_ENABLE_DEV_BYPASS=true and demo credentials in env.",
    );
  });

  test("loads submitted applicant profile drawer", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/candidates");

    const candidateRows = page.locator("tr.admin-candidate-row");
    const rowCount = await expect
      .poll(async () => candidateRows.count(), { timeout: 15_000 })
      .toBeGreaterThan(0)
      .then(() => candidateRows.count())
      .catch(() => 0);
    if (rowCount === 0) {
      test.skip(true, "No candidate rows available in current preview dataset");
      return;
    }
    await candidateRows.first().click();

    await expect(page.getByText(/Cargando postulación|Datos del formulario/i).first()).toBeVisible({
      timeout: 15_000,
    });

    await expect(page.getByText(/Failed to load application/i)).not.toBeVisible();
    await expect(page.getByText(/Datos del formulario/i)).toBeVisible({ timeout: 15_000 });
  });

  test("ignores stale applicationId in URL and still opens selected candidate", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/candidates?applicationId=e12f2f2a-11b7-457d-b11f-44681c453f66");

    const candidateRows = page.locator("tr.admin-candidate-row");
    const rowCount = await expect
      .poll(async () => candidateRows.count(), { timeout: 15_000 })
      .toBeGreaterThan(0)
      .then(() => candidateRows.count())
      .catch(() => 0);
    if (rowCount === 0) {
      test.skip(true, "No candidate rows available in current preview dataset");
      return;
    }

    await expect(page.getByText(/Failed to load application/i)).not.toBeVisible();

    await candidateRows.first().click();
    await expect(page.getByText(/Datos del formulario/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Failed to load application/i)).not.toBeVisible();
  });
});
