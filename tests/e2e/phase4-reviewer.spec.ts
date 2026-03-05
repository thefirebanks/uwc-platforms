/**
 * Phase 4 — Reviewer Architecture: browser-based verification.
 *
 * Covers:
 *  - Admin can access /admin/reviewers and sees the management UI
 *  - Admin reviewer API endpoints return expected responses
 *  - Applicant is redirected away from /admin/reviewers and /reviewer
 */

import { expect, test } from "@playwright/test";
import { bypassReady, loginAsAdmin } from "./helpers";

test.describe("Phase 4 – Reviewer Architecture", () => {
  // ── Admin: reviewer management page ──────────────────────────────────────

  test("admin can navigate to /admin/reviewers and sees management UI", async ({ page }) => {
    test.skip(!bypassReady, "Requires dev bypass + demo credentials.");

    await loginAsAdmin(page);
    await page.goto("/admin/reviewers");
    await expect(page).toHaveURL(/\/admin\/reviewers/);

    // Page heading
    await expect(page.getByRole("heading", { name: /Gestión de Revisores/i })).toBeVisible();

    // "Add reviewer" section and email input
    await expect(page.getByRole("heading", { name: /Agregar revisor/i })).toBeVisible();
    await expect(page.getByPlaceholder(/correo@ejemplo\.com/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Agregar revisor/i })).toBeVisible();

    // Active reviewers list header
    await expect(page.getByRole("heading", { name: /Revisores activos/i })).toBeVisible();
  });

  test("admin reviewer management shows empty state when no reviewers exist", async ({ page }) => {
    test.skip(!bypassReady, "Requires dev bypass + demo credentials.");

    await loginAsAdmin(page);
    await page.goto("/admin/reviewers");

    // Wait for the loading state to resolve
    await expect(page.getByText(/Cargando revisores/i)).toBeHidden({ timeout: 10_000 });

    await expect
      .poll(async () => {
        const text = await page.locator("body").innerText();
        return /No hay revisores registrados|Nombre\\s+Correo\\s+Acciones/i.test(text);
      }, { timeout: 10_000 })
      .toBe(true);
  });

  test("admin GET /api/admin/reviewers returns 200 with reviewers array", async ({ page }) => {
    test.skip(!bypassReady, "Requires dev bypass + demo credentials.");

    await loginAsAdmin(page);

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/admin/reviewers");
      const json = await res.json();
      return { status: res.status, hasReviewers: Array.isArray(json.reviewers) };
    });

    expect(result.status).toBe(200);
    expect(result.hasReviewers).toBe(true);
  });

  test("admin POST /api/admin/reviewers with unknown email returns 404", async ({ page }) => {
    test.skip(!bypassReady, "Requires dev bypass + demo credentials.");

    await loginAsAdmin(page);

    const status = await page.evaluate(async () => {
      const res = await fetch("/api/admin/reviewers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "nonexistent-reviewer-xyz@example.com" }),
      });
      return res.status;
    });

    expect(status).toBe(404);
  });

  test("admin promote form shows error for unknown email", async ({ page }) => {
    test.skip(!bypassReady, "Requires dev bypass + demo credentials.");

    await loginAsAdmin(page);
    await page.goto("/admin/reviewers");

    const emailInput = page.getByPlaceholder(/correo@ejemplo\.com/i);
    await emailInput.fill("nobody@notreal.example");
    await page.getByRole("button", { name: /Agregar revisor/i }).click();

    // Should show an error message (user doesn't exist)
    await expect(
      page.getByText(/No existe un usuario registrado|Error al agregar/i),
    ).toBeVisible({ timeout: 10_000 });
  });

  // ── Applicant: role-based redirect guard ──────────────────────────────────

  test("applicant is redirected from /admin/reviewers to /applicant", async ({ page }) => {
    test.skip(!bypassReady, "Requires dev bypass + demo credentials.");

    await page.goto("/login");
    await page.getByRole("button", { name: /Entrar como postulante demo 1/i }).click();
    await expect(page).toHaveURL(/\/applicant/, { timeout: 15_000 });

    await page.goto("/admin/reviewers");
    // Middleware should redirect back to /applicant
    await expect(page).toHaveURL(/\/applicant/, { timeout: 10_000 });
  });

  test("applicant is redirected from /reviewer to /applicant", async ({ page }) => {
    test.skip(!bypassReady, "Requires dev bypass + demo credentials.");

    await page.goto("/login");
    await page.getByRole("button", { name: /Entrar como postulante demo 1/i }).click();
    await expect(page).toHaveURL(/\/applicant/, { timeout: 15_000 });

    await page.goto("/reviewer");
    // Middleware should redirect back to /applicant
    await expect(page).toHaveURL(/\/applicant/, { timeout: 10_000 });
  });

  test("applicant cannot call reviewer API (returns 403)", async ({ page }) => {
    test.skip(!bypassReady, "Requires dev bypass + demo credentials.");

    await page.goto("/login");
    await page.getByRole("button", { name: /Entrar como postulante demo 1/i }).click();
    await expect(page).toHaveURL(/\/applicant/, { timeout: 15_000 });

    const statuses = await page.evaluate(async () => {
      const [reviewersRes, assignmentsRes] = await Promise.all([
        fetch("/api/admin/reviewers"),
        fetch("/api/reviewer/assignments"),
      ]);
      return [reviewersRes.status, assignmentsRes.status];
    });

    // applicant should be forbidden from both admin and reviewer APIs
    expect(statuses[0]).toBe(403);
    expect(statuses[1]).toBe(403);
  });
});
