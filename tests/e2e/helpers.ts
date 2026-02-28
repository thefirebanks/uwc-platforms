import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Shared E2E test helpers for UWC Peru Selection Platform.
 *
 * All helpers require NEXT_PUBLIC_ENABLE_DEV_BYPASS=true and valid demo credentials.
 */

export const bypassReady =
  process.env.NEXT_PUBLIC_ENABLE_DEV_BYPASS === "true" &&
  Boolean(process.env.NEXT_PUBLIC_DEMO_ADMIN_EMAIL) &&
  Boolean(process.env.NEXT_PUBLIC_DEMO_APPLICANT_EMAIL) &&
  Boolean(process.env.NEXT_PUBLIC_DEMO_PASSWORD);

/**
 * Log in as the demo admin via the dev bypass button and wait for /admin redirect.
 */
export async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByRole("button", { name: "Entrar como admin demo" }).click();
  await expect(page).toHaveURL(/\/admin/, { timeout: 15_000 });
}

/**
 * Log in as the demo applicant via the dev bypass button,
 * then navigate to the first available process form.
 */
export async function loginAndOpenForm(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByRole("button", { name: "Entrar como postulante demo" }).click();
  await expect(page).toHaveURL(/\/applicant/, { timeout: 15_000 });

  const processLink = page
    .getByRole("link")
    .filter({ hasText: /Abrir postulación|Iniciar postulación|Open application|Start application/ })
    .first();
  await expect(processLink).toBeVisible({ timeout: 15_000 });
  await processLink.click();
  await expect(page).toHaveURL(/\/applicant\/process\//);
}

/**
 * Click a sidebar nav button by matching its visible text label.
 * The sidebar uses native <button> elements inside <aside>.
 */
export async function clickSidebarStepByLabel(page: Page, textPattern: RegExp): Promise<void> {
  const sidebar = page.locator("aside");
  const btn = sidebar.locator("button").filter({ hasText: textPattern });
  await btn.scrollIntoViewIfNeeded();
  await btn.click();
}

/**
 * Find a stage section container element by scanning title inputs for a matching value.
 * Playwright does not have `getByDisplayValue` — this helper replicates it for the
 * stage config editor's section title inputs (`input[id^="section-title-"]`).
 *
 * Returns the `.admin-stage-section-placeholder` at the same index, or null if not found.
 */
export async function findSectionContainerByTitle(
  page: Page,
  title: string | RegExp,
): Promise<Locator | null> {
  const inputs = page.locator("input[id^='section-title-']");
  const containers = page.locator(".admin-stage-section-placeholder");
  const count = await inputs.count();
  for (let i = 0; i < count; i++) {
    const val = await inputs.nth(i).inputValue();
    const matches = title instanceof RegExp ? title.test(val) : val === title;
    if (matches) {
      return containers.nth(i);
    }
  }
  return null;
}

/**
 * Returns true if any section title input has the given exact value.
 */
export async function hasSectionWithTitle(page: Page, title: string): Promise<boolean> {
  const inputs = page.locator("input[id^='section-title-']");
  const count = await inputs.count();
  for (let i = 0; i < count; i++) {
    if ((await inputs.nth(i).inputValue()) === title) return true;
  }
  return false;
}

/**
 * Reset the demo applicant's application via the API endpoint.
 * Requires an active admin session. Signs out when done.
 */
export async function resetDemoApplicant(page: Page): Promise<void> {
  await loginAsAdmin(page);
  const status = await page.evaluate(async () => {
    const r = await fetch("/api/dev/reset-demo-applicant", { method: "POST" });
    return r.status;
  });
  if (status !== 200) {
    throw new Error(`reset-demo-applicant returned HTTP ${status}`);
  }
  await page.getByRole("button", { name: /Cerrar sesión|Sign out/i }).click();
  await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
}
