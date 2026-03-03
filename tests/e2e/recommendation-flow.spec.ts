import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { bypassReady, clickSidebarStepByLabel, loginAndOpenForm, resetDemoApplicant } from "./helpers";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
const recommenderSalt = process.env.RECOMMENDER_TOKEN_SALT ?? process.env.SUPABASE_SECRET_KEY ?? "local-dev";

const adminSupabase =
  supabaseUrl && supabaseSecretKey
    ? createClient(supabaseUrl, supabaseSecretKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      })
    : null;

function hashRecommendationValue(input: string) {
  return createHash("sha256").update(`${recommenderSalt}:${input}`).digest("hex");
}

async function waitForRecommendationByEmail(email: string) {
  if (!adminSupabase) {
    throw new Error("Supabase admin client is not configured for recommendation E2E.");
  }

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const { data, error } = await adminSupabase
      .from("recommendation_requests")
      .select("id, token, status, recommender_email")
      .eq("recommender_email", email)
      .is("invalidated_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (data?.token) {
      return data as { id: string; token: string; status: string; recommender_email: string };
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error(`Recommendation row not found for ${email}`);
}

test.describe("Public recommendation flow", () => {
  test("invite, OTP verification, draft save, reload, and submit work end to end", async ({ page }) => {
    test.skip(
      !bypassReady || !adminSupabase,
      "Requires dev bypass credentials plus Supabase env for recommendation E2E.",
    );

    const stamp = Date.now();
    const mentorEmail = `dafirebanks+mentor-flow-${stamp}@gmail.com`;
    const friendEmail = `dafirebanks+friend-flow-${stamp}@gmail.com`;
    const otpCode = "123456";

    await resetDemoApplicant(page);
    await loginAndOpenForm(page);

    const applicantProcessUrl = page.url();

    await page.getByRole("button", { name: "Guardar borrador" }).click();
    await expect(page.getByText(/Borrador guardado/i).first()).toBeVisible({ timeout: 20_000 });

    await clickSidebarStepByLabel(page, /Recomendadores/i);
    await page.getByLabel(/Correo \(Tutor\/Profesor\/Mentor\)/i).fill(mentorEmail);
    await page.getByLabel(/Correo \(Amigo \(no familiar\)\)/i).fill(friendEmail);
    await page.getByRole("button", { name: /Guardar recomendadores/i }).click();

    await expect(page.getByText(/2 invitación\(es\) enviada\(s\)\./i)).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(mentorEmail)).toBeVisible();
    await expect(page.getByText("Invitación enviada").first()).toBeVisible();

    const mentorRecommendation = await waitForRecommendationByEmail(mentorEmail);
    await page.goto(`/recomendacion/${mentorRecommendation.token}`);

    await expect(page.getByRole("heading", { name: "Formulario de recomendación" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Enviar OTP" })).toBeVisible();

    await page.getByRole("button", { name: "Enviar OTP" }).click();
    await expect(page.getByText(/Código OTP enviado a/i)).toBeVisible({ timeout: 20_000 });

    const { error: otpUpdateError } = await adminSupabase!
      .from("recommendation_requests")
      .update({
        otp_code_hash: hashRecommendationValue(`${mentorRecommendation.id}:${otpCode}`),
        otp_sent_at: new Date().toISOString(),
        otp_attempt_count: 0,
      })
      .eq("id", mentorRecommendation.id);

    expect(otpUpdateError).toBeNull();

    await page.getByLabel("Código OTP").fill(otpCode);
    await page.getByRole("button", { name: "Validar OTP" }).click();

    await expect(page.getByRole("heading", { name: "Completa la recomendación" })).toBeVisible({
      timeout: 20_000,
    });

    await page.getByLabel("Nombre completo").fill("Mariela Quispe");
    await page.getByLabel("Rol o vínculo con el postulante").fill("Tutora de literatura");
    await page.getByLabel("¿Hace cuánto lo/la conoces?").fill("2 años");
    await page
      .getByLabel("Fortalezas principales")
      .fill("La estudiante demuestra iniciativa, rigor académico y una capacidad constante para apoyar a su grupo.");
    await page
      .getByLabel("Áreas de mejora")
      .fill("Puede mejorar la priorización de tiempos en semanas de alta carga, aunque responde muy bien al feedback.");
    await page
      .getByLabel("Recomendación final")
      .fill("La recomiendo con confianza porque combina madurez, empatía y un compromiso real con su comunidad.");

    await page.getByRole("button", { name: "Guardar borrador" }).click();
    await expect(page.getByText("Borrador guardado.")).toBeVisible({ timeout: 20_000 });

    await page.reload();
    await expect(page.getByRole("heading", { name: "Completa la recomendación" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByLabel("Nombre completo")).toHaveValue("Mariela Quispe");
    await expect(page.getByLabel("Rol o vínculo con el postulante")).toHaveValue(
      "Tutora de literatura",
    );

    await page.getByRole("button", { name: "Enviar recomendación" }).click();
    await expect(page.getByText("Recomendación enviada correctamente.")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("heading", { name: "Recomendación enviada" })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { name: "Recomendación enviada" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Enviar OTP" })).toHaveCount(0);

    const { data: submittedRow, error: submittedError } = await adminSupabase!
      .from("recommendation_requests")
      .select("status, submitted_at, responses")
      .eq("id", mentorRecommendation.id)
      .maybeSingle();

    expect(submittedError).toBeNull();
    expect(submittedRow?.status).toBe("submitted");
    expect(submittedRow?.submitted_at).toBeTruthy();
    expect((submittedRow?.responses as Record<string, unknown> | null)?.recommenderName).toBe(
      "Mariela Quispe",
    );

    await page.goto(applicantProcessUrl);
    await clickSidebarStepByLabel(page, /Recomendadores/i);
    await expect(page.getByText(/Formulario enviado/i)).toBeVisible({ timeout: 20_000 });
  });
});
