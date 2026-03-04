import { expect, test } from "@playwright/test";
import { bypassReady } from "./helpers";

test("demo applicant cannot invoke admin APIs", async ({ page }) => {
  test.skip(
    !bypassReady,
    "This E2E check requires NEXT_PUBLIC_ENABLE_DEV_BYPASS=true and demo credentials in env.",
  );

  await page.goto("/login");
  await page.getByRole("button", { name: /Entrar como postulante demo 1/i }).click();
  await expect(page).toHaveURL(/\/applicant/);

  const statuses = await page.evaluate(async () => {
    const [auditRes, queueRes, validateRes] = await Promise.all([
      fetch("/api/audit"),
      fetch("/api/communications/process", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
      fetch("/api/applications/00000000-0000-0000-0000-000000000000/validate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status: "eligible",
          notes: "test",
        }),
      }),
    ]);

    return [auditRes.status, queueRes.status, validateRes.status];
  });

  expect(statuses).toEqual([403, 403, 403]);
});
