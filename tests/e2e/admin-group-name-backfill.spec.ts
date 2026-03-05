import { expect, test } from "@playwright/test";
import { bypassReady, loginAsAdmin } from "./helpers";

const DEMO_CYCLE_ID = "98b2f8e4-7266-44b0-acb2-566e2fb2d50e";

test.describe("Admin group-name backfill visibility", () => {
  test.beforeEach(async () => {
    test.skip(
      !bypassReady,
      "Requires NEXT_PUBLIC_ENABLE_DEV_BYPASS=true and demo admin credentials",
    );
  });

  test("admin can see backfilled group names (including emoji groups) in stage editor", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto(`/admin/process/${DEMO_CYCLE_ID}/stage/documents`);

    await expect(
      page.getByRole("button", { name: /Guardar configuración/i }),
    ).toBeVisible({ timeout: 15_000 });

    await expect(
      page.locator(".field-type").filter({ hasText: /grupo:\s*👤 Identidad/i }).first(),
    ).toBeVisible({ timeout: 15_000 });

    const groupedFieldCard = page
      .locator(".field-card")
      .filter({ hasText: /grupo:\s*👤 Identidad/i })
      .first();
    await groupedFieldCard.locator("button.btn-icon").first().click();

    await expect(
      groupedFieldCard.locator("input[id^='group-name-']").first(),
    ).toHaveValue(/👤 Identidad/);
  });
});

