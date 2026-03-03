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

    const firstCandidateRow = page.locator("tr.admin-candidate-row").first();
    const hasCandidate = await firstCandidateRow.isVisible({ timeout: 15_000 }).catch(() => false);
    if (!hasCandidate) {
      test.skip(true, "No candidate rows available in current preview dataset");
      return;
    }
    await firstCandidateRow.click();

    await expect(page.getByText(/Cargando postulación|Datos del formulario/i).first()).toBeVisible({
      timeout: 15_000,
    });

    await expect(page.getByText(/Failed to load application/i)).not.toBeVisible();
    await expect(page.getByText(/Datos del formulario/i)).toBeVisible({ timeout: 15_000 });
  });
});
