import { test, expect } from "./helpers";

/**
 * TZ-3 — the guard on a hand-entered UTC offset.
 *
 * The case, 2026-08-17: a Barstow, California birth (longitude -117.18, mean
 * solar -7.81) was cast at tz -5.7, and then at +7. Both produced a complete,
 * plausible wheel describing a different sky. `resolveOffset` knows 1987's DST
 * rules and would have said -8, but it only runs when a city is picked on the
 * map — the bare offset box checked nothing, with the contradicting longitude
 * in the field directly below it.
 *
 * The unit cases live in packages/astra-core/test/offset-guard.test.ts. These
 * drive the surface: the warning has to actually reach the reader, and it must
 * never block a cast, because the manual field is the escape hatch for offsets
 * a zone database cannot decide.
 */

const WARNING = ".tz-warning";

async function setOffset(page: import("@playwright/test").Page, value: string) {
  // The TZ field is the third number input in the hour/min/tz row.
  const tz = page.locator("label", { hasText: "TZ ±h" }).locator("input");
  await tz.fill(value);
  await tz.blur();
}

async function setLongitude(page: import("@playwright/test").Page, value: string) {
  const lng = page.locator("label", { hasText: "Longitude" }).locator("input");
  await lng.fill(value);
  await lng.blur();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect
    .poll(() => page.locator(".wheel-area svg text").count(), { timeout: 20_000 })
    .toBeGreaterThan(10);
  await setLongitude(page, "-117.1833");
});

test("an offset no timezone uses is called out", async ({ page }) => {
  await setOffset(page, "-5.7");
  const w = page.locator(WARNING);
  await expect(w).toBeVisible();
  await expect(w).toHaveClass(/tz-warning--invalid/);
  await expect(w).toContainText(/quarter-hour/);
});

test("an offset far from the birthplace's sun is called out", async ({ page }) => {
  await setOffset(page, "7");
  const w = page.locator(WARNING);
  await expect(w).toBeVisible();
  await expect(w).toHaveClass(/tz-warning--suspect/);
  await expect(w).toContainText(/hours from the sun/);
});

test("the correct offset says nothing at all", async ({ page }) => {
  await setOffset(page, "-8");
  await expect(page.locator(WARNING)).toHaveCount(0);
});

test("a real-but-wrong-season offset is not flagged", async ({ page }) => {
  // PDT is genuinely used at this longitude — it is only the wrong one for a
  // November birth, which a longitude guard cannot know and must not pretend
  // to. Flagging it would cry wolf on a correct value half the year.
  await setOffset(page, "-7");
  await expect(page.locator(WARNING)).toHaveCount(0);
});

test("the warning never blocks the cast", async ({ page }) => {
  await setOffset(page, "7");
  await expect(page.locator(WARNING)).toBeVisible();
  // The manual field is the escape hatch for local mean time, war time, and
  // certificates written in the wrong convention. Advisory means advisory.
  await page.getByRole("button", { name: /Cast Chart/i }).click();
  await expect
    .poll(() => page.locator(".wheel-area svg text").count(), { timeout: 20_000 })
    .toBeGreaterThan(10);
});
