import { expect, test } from "@playwright/test";

test("demo applicant cannot invoke admin APIs", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Entrar como postulante demo" }).click();
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
