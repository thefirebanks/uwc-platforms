import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import {
  bypassReady,
  clickSidebarStepByLabel,
  loginAsAdmin,
  loginAndOpenFormAsApplicant,
  resetDemoApplicantByEmail,
} from "./helpers";

const DEMO_CYCLE_ID = "98b2f8e4-7266-44b0-acb2-566e2fb2d50e";
const DUMMY_FILE = path.resolve(process.cwd(), "tests/fixtures/dummy-proof.pdf");
const SCREENSHOT_DIR = path.join(process.cwd(), "output", "rubric-screenshots");
const DEMO_APPLICANT_1 = process.env.NEXT_PUBLIC_DEMO_APPLICANT_EMAIL ?? "applicant.demo@uwcperu.org";
const DEMO_APPLICANT_2 =
  process.env.NEXT_PUBLIC_DEMO_APPLICANT_2_EMAIL ?? "applicant.demo2@uwcperu.org";
const DEMO_APPLICANT_3 =
  process.env.NEXT_PUBLIC_DEMO_APPLICANT_3_EMAIL ?? "applicant.demo3@uwcperu.org";

function screenshotPath(fileName: string) {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  return path.join(SCREENSHOT_DIR, fileName);
}

const TEST_RUBRIC_JSON = JSON.stringify(
  {
    enabled: true,
    criteria: [
      {
        id: "dob_allowed_for_test",
        label: "DOB test gate",
        kind: "field_in",
        fieldKey: "dateOfBirth",
        allowedValues: ["2008-01-01"],
        caseSensitive: false,
        onFail: "not_eligible",
        onMissingData: "not_eligible",
      },
      {
        id: "firstname_review_gate_for_test",
        label: "Needs review gate by first name",
        kind: "field_in",
        fieldKey: "firstname",
        allowedValues: ["eligible"],
        caseSensitive: false,
        onFail: "needs_review",
        onMissingData: "needs_review",
      },
    ],
  },
  null,
  2,
);

async function ensureEditMode(page: Page) {
  const editButton = page.getByRole("button", { name: /Editar respuesta|Edit response/i });
  if (await editButton.isVisible({ timeout: 1500 }).catch(() => false)) {
    await editButton.click();
  }
}

async function fillPersonalFields({
  page,
  firstName,
  nationality,
  dateOfBirth,
}: {
  page: Page;
  firstName: string;
  nationality: string;
  dateOfBirth: string;
}) {
  const firstNameInput = page.getByLabel(/Nombre\(s\)|First name/i).first();
  const nationalityInput = page.getByLabel(/Nacionalidad|Nationality/i).first();
  const dobInput = page.getByLabel(/Fecha de nacimiento|Date of birth|Birth date/i).first();

  await expect(firstNameInput).toBeVisible({ timeout: 10000 });
  await firstNameInput.fill(firstName);
  await expect(nationalityInput).toBeVisible({ timeout: 5000 });
  await nationalityInput.fill(nationality);
  await expect(dobInput).toBeVisible({ timeout: 5000 });
  await dobInput.fill(dateOfBirth);
}

async function saveDraft(page: Page) {
  await page.getByRole("button", { name: /Guardar borrador|Save draft/i }).click();
  await expect(page.getByText(/Guardado|Saved/i).first()).toBeVisible({ timeout: 15000 });
}

async function goToSection(page: Page, pattern: RegExp) {
  await clickSidebarStepByLabel(page, pattern);
  await page.waitForTimeout(300);
}

async function openDocumentsAndUpload(page: Page) {
  let openedDocuments = false;
  const candidatePatterns = [
    /Documentos|Documents|Archivos/i,
    /Subida|Uploads|Evidencia/i,
  ];

  for (const pattern of candidatePatterns) {
    const sidebar = page.locator("aside");
    const button = sidebar.locator("button").filter({ hasText: pattern }).first();
    if (await button.isVisible().catch(() => false)) {
      await button.click();
      openedDocuments = true;
      break;
    }
  }

  if (!openedDocuments) {
    for (let i = 0; i < 8; i += 1) {
      const fileInputs = page.locator("input[type='file']:not([disabled])");
      if ((await fileInputs.count()) > 0) {
        break;
      }
      const nextButton = page.getByRole("button", { name: /Siguiente|Next/i }).first();
      if (!(await nextButton.isVisible().catch(() => false))) {
        break;
      }
      await nextButton.click();
      await page.waitForTimeout(350);
    }
  }

  const fileInputs = page.locator("input[type='file']:not([disabled])");
  const count = await fileInputs.count();
  if (count === 0) {
    return;
  }

  await fileInputs.first().setInputFiles(DUMMY_FILE);
  await page.waitForTimeout(700);
}

async function submitApplicationForApplicant({
  page,
  bypassButtonLabel,
  firstName,
  nationality,
  dateOfBirth,
  screenshotName,
}: {
  page: Page;
  bypassButtonLabel: RegExp;
  firstName: string;
  nationality: string;
  dateOfBirth: string;
  screenshotName: string;
}) {
  await loginAndOpenFormAsApplicant(page, bypassButtonLabel);
  await ensureEditMode(page);
  await goToSection(page, /Datos personales|Personal info|Información personal/i);
  await fillPersonalFields({
    page,
    firstName,
    nationality,
    dateOfBirth,
  });
  await saveDraft(page);
  await openDocumentsAndUpload(page);
  await saveDraft(page);
  await goToSection(page, /Revisión|Review/i);
  await page.getByRole("button", { name: /Enviar postulación|Submit application/i }).click();
  await expect(page.getByText(/Postulación enviada|Application submitted/i)).toBeVisible({
    timeout: 15000,
  });
  await page.screenshot({
    path: screenshotPath(screenshotName),
    fullPage: true,
  });
}

async function configureTestRubric(page: Page) {
  await loginAsAdmin(page);
  await page.goto(`/admin/process/${DEMO_CYCLE_ID}/stage/documents?tab=settings`);
  // Wait for the rubric toolbar to load — mode buttons are "Visual" and "JSON"
  await expect(page.getByRole("button", { name: "JSON", exact: true })).toBeVisible({ timeout: 20000 });
  await page.getByRole("button", { name: "JSON", exact: true }).click();
  const textarea = page.locator("textarea[id^='eligibility-rubric-']").first();
  await expect(textarea).toBeVisible({ timeout: 10000 });
  await textarea.fill(TEST_RUBRIC_JSON);
  await textarea.blur();
  await page.getByRole("button", { name: /Guardar configuración/i }).click();
  await expect(page.locator(".admin-stage-save-status")).toContainText(/guardad|saved/i, {
    timeout: 15000,
  });
}

async function runRubricAndReadOutcomes(page: Page) {
  await loginAsAdmin(page);
  await page.goto("/admin/candidates");
  const cycleFilter = page.locator("select.filter-select").first();
  await expect(cycleFilter).toBeVisible({ timeout: 10000 });
  await cycleFilter.selectOption(DEMO_CYCLE_ID);

  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/applications/rubric-evaluate") &&
      response.request().method() === "POST",
    { timeout: 20000 },
  );
  await page.getByRole("button", { name: /Ejecutar rúbrica automática/i }).click();
  await responsePromise;
  await expect(page.locator(".admin-feedback")).toBeVisible({ timeout: 15000 });
  await page.screenshot({
    path: screenshotPath("09-rubric-three-outcomes-admin-results.png"),
    fullPage: true,
  });

  return await expect
    .poll(
      async () => {
        const result = await page.evaluate(async (cycleId) => {
          const params = new URLSearchParams({
            cycleId,
            page: "1",
            pageSize: "200",
            sortBy: "updated_at",
            sortOrder: "desc",
          });
          const response = await fetch(`/api/applications/search?${params.toString()}`);
          const body = await response.json();
          if (!response.ok) {
            return { error: body?.message ?? "search_failed" };
          }

          const rows = (body?.rows ?? []) as Array<{
            candidateEmail: string;
            reviewOutcome: "eligible" | "not_eligible" | "needs_review" | null;
          }>;
          const byEmail: Record<string, string | null> = {};
          for (const row of rows) {
            byEmail[row.candidateEmail.toLowerCase()] = row.reviewOutcome;
          }
          return byEmail;
        }, DEMO_CYCLE_ID);
        return result;
      },
      { timeout: 20000, intervals: [1000, 1500, 2000] },
    )
    .toEqual(
      expect.objectContaining({
        [DEMO_APPLICANT_1.toLowerCase()]: "eligible",
        [DEMO_APPLICANT_2.toLowerCase()]: "not_eligible",
        [DEMO_APPLICANT_3.toLowerCase()]: "needs_review",
      }),
    );
}

test.describe("Rubric three outcomes E2E", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(
      !bypassReady || !process.env.NEXT_PUBLIC_DEMO_APPLICANT_3_EMAIL,
      "Requires dev bypass credentials plus NEXT_PUBLIC_DEMO_APPLICANT_3_EMAIL.",
    );
    await resetDemoApplicantByEmail(page, DEMO_APPLICANT_1);
    await resetDemoApplicantByEmail(page, DEMO_APPLICANT_2);
    await resetDemoApplicantByEmail(page, DEMO_APPLICANT_3);
  });

  test("submits 3 applicants and verifies eligible/not_eligible/needs_review", async ({ page }) => {
    await configureTestRubric(page);

    await submitApplicationForApplicant({
      page,
      bypassButtonLabel: /Entrar como postulante demo 1/i,
      firstName: "eligible",
      nationality: "Peru",
      dateOfBirth: "2008-01-01",
      screenshotName: "06-applicant-demo1-submitted.png",
    });

    await submitApplicationForApplicant({
      page,
      bypassButtonLabel: /Entrar como postulante demo 2/i,
      firstName: "ineligible",
      nationality: "Peru",
      dateOfBirth: "2012-01-01",
      screenshotName: "07-applicant-demo2-submitted.png",
    });

    await submitApplicationForApplicant({
      page,
      bypassButtonLabel: /Entrar como postulante demo 3/i,
      firstName: "review",
      nationality: "Peru",
      dateOfBirth: "2008-01-01",
      screenshotName: "08-applicant-demo3-submitted.png",
    });

    await runRubricAndReadOutcomes(page);
  });
});
