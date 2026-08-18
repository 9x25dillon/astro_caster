import { test, expect } from "./helpers";

/**
 * Offline as a CHOSEN mode.
 *
 * A deterministic reading used to arrive indistinguishable from a model one —
 * same panel, same voice, no marker — so a subscriber pushed off the model by
 * the daily spend cap was never told. These specs cover the half a browser can
 * see: the reader can pick the engine, the choice survives a reload, and the
 * panel says which engine answered.
 *
 * The reason ladder itself (chosen / capped / degraded / unconfigured) is pinned
 * server-side in backend/tests/test_offline_mode.py.
 */

const TOGGLE = '[aria-label="Offline engine"]';

test("the reader can choose the deterministic engine", async ({ page }) => {
  await page.goto("/");
  await expect
    .poll(() => page.locator(".wheel-area svg text").count(), { timeout: 20_000 })
    .toBeGreaterThan(10);

  const toggle = page.locator(TOGGLE);
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-checked", "false");

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
});

test("the choice survives a reload", async ({ page }) => {
  await page.goto("/");
  await expect
    .poll(() => page.locator(".wheel-area svg text").count(), { timeout: 20_000 })
    .toBeGreaterThan(10);

  await page.locator(TOGGLE).click();
  await expect(page.locator(TOGGLE)).toHaveAttribute("aria-checked", "true");

  await page.reload();
  await expect
    .poll(() => page.locator(".wheel-area svg text").count(), { timeout: 20_000 })
    .toBeGreaterThan(10);
  // A preference the reader has to re-make every visit is one they stop making.
  await expect(page.locator(TOGGLE)).toHaveAttribute("aria-checked", "true");
});

test("a chosen offline reading says so, and is a whole reading", async ({ page }) => {
  await page.goto("/");
  await expect
    .poll(() => page.locator(".wheel-area svg text").count(), { timeout: 20_000 })
    .toBeGreaterThan(10);

  await page.locator(TOGGLE).click();
  await page.locator("input[placeholder*='Ask']").first().fill("What is my Sun telling me?");
  await page.getByRole("button", { name: /^Ask$/ }).first().click();

  const note = page.locator(".engine-note");
  await expect(note).toBeVisible({ timeout: 60_000 });
  await expect(note).toHaveClass(/engine-note--chosen/);
  await expect(note).toContainText(/by your choosing/i);

  // Chosen offline is a feature, not a stub: it must produce real prose.
  const reading = await page.locator(".interp, .interp-body").first().innerText();
  expect(reading.trim().length).toBeGreaterThan(200);
});
