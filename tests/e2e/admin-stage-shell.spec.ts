import { expect, test } from "@playwright/test";
import { bypassReady, loginAsAdmin } from "./helpers";

const DEMO_CYCLE_ID = "98b2f8e4-7266-44b0-acb2-566e2fb2d50e";

test.describe("Admin stage shell integration", () => {
  test.beforeEach(async () => {
    test.skip(!bypassReady, "Requires NEXT_PUBLIC_ENABLE_DEV_BYPASS=true and demo admin credentials");
  });

  test("keeps the old stage shell as the primary home for integrated tools", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: /Entrar como postulante demo 1/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Entrar como postulante demo 2/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Entrar como postulante demo 3/i })).toBeVisible();

    await loginAsAdmin(page);
    await page.goto(`/admin/process/${DEMO_CYCLE_ID}/stage/documents`);

    await expect(page.getByRole("button", { name: /Guardar configuración/i })).toBeVisible({
      timeout: 15_000,
    });

    for (const tab of [
      "Editor de Formulario",
      "Ajustes y Reglas",
      "Automatizaciones",
      "Comunicaciones",
      "Prompt Studio",
      "Estadísticas",
    ]) {
      await expect(page.getByRole("button", { name: new RegExp(`^${tab}$`, "i") })).toBeVisible();
    }

    await expect(page.getByText(/Paso inicial: Instrucciones/i)).not.toBeVisible();

    await page.getByRole("button", { name: /^Ajustes y Reglas$/i }).click();
    await expect(page.getByLabel(/Instrucciones de la etapa \(Markdown\)/i)).toBeVisible();
    await expect(page.getByLabel(/Prompt OCR de la etapa/i)).toHaveCount(0);

    await page.getByRole("button", { name: /^Prompt Studio$/i }).click();
    await expect(page.getByRole("heading", { name: /^Prompt Studio$/i })).toBeVisible();

    await page.getByRole("button", { name: /^Automatizaciones$/i }).click();
    await expect(page.getByText(/Automatizaciones de correo/i)).toBeVisible();
    await page.getByRole("button", { name: /Abrir centro de comunicaciones/i }).click();

    await expect(page.getByRole("heading", { name: /Centro de comunicaciones/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Campañas manuales/i })).toBeVisible();
    await expect(page.getByLabel(/Nombre interno de campaña/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Enviar prueba/i })).toBeVisible();
  });

  test("legacy process workspace redirects land inside the integrated stage shell", async ({
    page,
  }) => {
    await loginAsAdmin(page);

    await page.goto(`/admin/process/${DEMO_CYCLE_ID}?section=communications`);
    await expect(page).toHaveURL(
      new RegExp(`/admin/process/${DEMO_CYCLE_ID}/stage/documents\\?tab=communications`),
    );
    await expect(page.getByRole("heading", { name: /Centro de comunicaciones/i })).toBeVisible();

    await page.goto(`/admin/process/${DEMO_CYCLE_ID}?section=ocr_testbed`);
    await expect(page).toHaveURL(
      new RegExp(`/admin/process/${DEMO_CYCLE_ID}/stage/documents\\?tab=prompt_studio`),
    );
    await expect(page.getByRole("heading", { name: /^Prompt Studio$/i })).toBeVisible();
  });
});
