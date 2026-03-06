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

async function clearBrowserSessionState(page: Page) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  await page.reload({ waitUntil: "load" });
}

async function loginWithBypass({
  page,
  buttonName,
  expectedUrl,
}: {
  page: Page;
  buttonName: string | RegExp;
  expectedUrl: RegExp;
}) {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.waitForLoadState("load", { timeout: 10_000 }).catch(() => undefined);
    await clearBrowserSessionState(page);
    await page.getByRole("button", { name: buttonName }).click();

    try {
      await expect(page).toHaveURL(expectedUrl, { timeout: 15_000 });
      return;
    } catch (error) {
      const alertText = await page.getByRole("alert").textContent().catch(() => "");
      const looksTransient = /failed to fetch/i.test(alertText ?? "");
      lastError = error instanceof Error ? error : new Error(String(error));

      if (!looksTransient || attempt === 1) {
        throw lastError;
      }

      await page.waitForTimeout(1_000);
    }
  }

  throw lastError ?? new Error("No se pudo iniciar sesión con bypass.");
}

/**
 * Log in as the demo admin via the dev bypass button and wait for /admin redirect.
 */
export async function loginAsAdmin(page: Page): Promise<void> {
  await loginWithBypass({
    page,
    buttonName: "Entrar como admin demo",
    expectedUrl: /\/admin/,
  });
}

/**
 * Log in as the demo applicant via the dev bypass button,
 * then navigate to the first available process form.
 */
export async function loginAndOpenForm(page: Page): Promise<void> {
  await loginAndOpenFormAsApplicant(page, /Entrar como postulante demo 1/i);
}

export async function loginAndOpenFormAsApplicant(
  page: Page,
  applicantBypassButton: string | RegExp,
): Promise<void> {
  await loginWithBypass({
    page,
    buttonName: applicantBypassButton,
    expectedUrl: /\/applicant/,
  });

  const processLink = page
    .getByRole("link")
    .filter({ hasText: /Abrir postulación|Iniciar postulación|Open application|Start application|Ver postulación/ })
    .first();
  await expect(processLink).toBeVisible({ timeout: 15_000 });
  await processLink.click();
  await expect(page).toHaveURL(/\/applicant\/process\//);

  // If the form opens on the "Antes de empezar" / "Before you start" prep screen
  // (i.e. the applicant has no existing application), advance to the first real section
  // so that tests can find the numbered step header ("Paso 1 de N").
  const nextBtn = page.getByRole("button", { name: /Siguiente|Next/i }).first();
  const onPrepScreen = await nextBtn.isVisible({ timeout: 5_000 }).catch(() => false);
  if (onPrepScreen) {
    // The first click on "Siguiente" from prep_intro creates the application draft
    // and moves to the first real section (e.g. eligibility).
    await nextBtn.click();
    // Wait for the step header to appear, confirming we left prep_intro
    await expect(page.getByText(/Paso 1 de \d+|Step 1 of \d+/i)).toBeVisible({ timeout: 15_000 });
  }
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
  await resetDemoApplicantByEmail(page, "applicant.demo@uwcperu.org");
}

/**
 * Reset a specific demo applicant's application via API endpoint.
 * Requires an active admin session. Signs out when done.
 */
export async function resetDemoApplicantByEmail(page: Page, email: string): Promise<void> {
  await loginAsAdmin(page);
  const status = await page.evaluate(async (targetEmail) => {
    const r = await fetch("/api/dev/reset-demo-applicant", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: targetEmail }),
    });
    return r.status;
  }, email);
  if (status !== 200) {
    throw new Error(`reset-demo-applicant returned HTTP ${status} for ${email}`);
  }
  // The admin logout button is inside a Popover — open the settings menu first.
  // For non-admin (applicant) the button is directly visible.
  const settingsTrigger = page.locator("button.admin-topbar-settings-trigger").first();
  const isAdminNav = await settingsTrigger.isVisible({ timeout: 3_000 }).catch(() => false);
  if (isAdminNav) {
    await settingsTrigger.click();
    // Wait for the popover to open, then click the logout button inside it
    await expect(page.locator(".admin-topbar-settings-panel")).toBeVisible({ timeout: 5_000 });
  }
  await page.getByRole("button", { name: /Cerrar sesión|Sign out/i }).click();
  await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
}
