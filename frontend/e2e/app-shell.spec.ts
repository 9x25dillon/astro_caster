import { test, expect } from "./helpers";

test("observatory boots and casts the default chart", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".masthead h1")).toHaveText("☤ Astra");

  // The default chart auto-casts on mount; a populated wheel means the full
  // frontend → FastAPI → ephemeris path worked.
  const wheel = page.locator(".wheel-area svg").first();
  await expect(wheel).toBeVisible();
  await expect
    .poll(() => wheel.locator("text").count(), { timeout: 15_000 })
    .toBeGreaterThan(10);

  // A fresh visitor is free tier.
  await expect(page.locator(".support-pill")).toHaveText(/Support \/ Unlock/);
});

test("masthead module pills are present and open their surfaces", async ({ page }) => {
  await page.goto("/");
  for (const label of ["✶ Arcana", "⚭ Relate", "◷ Timing", "✴ Advanced"]) {
    await expect(page.getByRole("button", { name: label })).toBeVisible();
  }
  await page.getByRole("button", { name: "✶ Arcana" }).click();
  await expect(page.locator(".modal-overlay")).toBeVisible();
  await page.locator(".modal-close").first().click();
  await expect(page.locator(".modal-overlay")).toHaveCount(0);
});

test("forecast panel opens from the controls", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "☌ Forecast" }).click();
  await expect(page.locator(".modal-overlay").first()).toBeVisible();
});
