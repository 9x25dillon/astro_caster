import { test, expect, openChapter } from "./helpers";

// Offline tarot (MOBILE_ROADMAP §3/H1): with the backend severed, the chart
// casts on-device and a spread deals from @astra/core — the same cards the
// server's offline reading would give, no network.
const isApiCall = (url: URL) => url.pathname.startsWith("/api/");

test("draws a tarot spread on-device with the backend offline", async ({ page, context }) => {
  await context.route(isApiCall, (route) => route.abort());
  await page.goto("/");

  // The default chart casts locally first (wire-astra-core fallback).
  const wheel = page.locator(".wheel-area svg").first();
  await expect
    .poll(() => wheel.locator("text").count(), { timeout: 15_000 })
    .toBeGreaterThan(10);

  await openChapter(page, "II");
  await expect(page.locator(".arcana-modal")).toBeVisible();

  // Natal tab (default) builds its signature on-device — links render.
  await expect
    .poll(() => page.locator(".arc-link-card").count(), { timeout: 15_000 })
    .toBeGreaterThan(0);

  await page.getByRole("button", { name: "Draw", exact: true }).first().click();
  // Two buttons share .arc-draw-btn (spread draw + Oracle Report); take the draw one.
  await page.locator(".arc-draw-btn").filter({ hasText: /^Draw$/ }).click();

  // three_card is the default spread → three dealt cards, face-down (the
  // session-25 widget), each turning on tap to show its meaning — all of it
  // computed on-device.
  const drawn = page.locator(".arc-drawn");
  await expect.poll(() => drawn.count(), { timeout: 15_000 }).toBe(3);
  await expect(page.locator(".tarot-card.is-facedown")).toHaveCount(3);
  await page.locator(".tarot-face--back").first().click();
  await expect(
    page.locator(".tarot-card.is-revealed .arc-drawn-meaning")
  ).not.toBeEmpty();
});

// The traditional spreads deal from the same on-device engine, and the Celtic
// Cross gets a real tableau rather than a row. Offline on purpose: the geometry
// and the ten-card deal must both work with no backend at all, which is the
// case the APK actually ships into.
test("deals a Celtic Cross on-device and lays it out as a cross, not a row", async ({ page, context }) => {
  await context.route(isApiCall, (route) => route.abort());
  await page.goto("/");

  const wheel = page.locator(".wheel-area svg").first();
  await expect
    .poll(() => wheel.locator("text").count(), { timeout: 15_000 })
    .toBeGreaterThan(10);

  await openChapter(page, "II");
  await page.getByRole("button", { name: "Draw", exact: true }).first().click();

  await page.locator(".arc-draw-controls select").first().selectOption("celtic_cross");
  await page.locator(".arc-draw-btn").filter({ hasText: /^Draw$/ }).click();

  const drawn = page.locator(".arc-drawn");
  await expect.poll(() => drawn.count(), { timeout: 15_000 }).toBe(10);

  // The tableau, not the auto-fit row.
  const tableau = page.locator(".arc-cards-row--geo");
  await expect(tableau).toHaveCount(1);
  await expect(page.locator(".arc-geo-note")).toContainText("staff");

  // The crossing card is the second position and is marked as laid across.
  await expect(page.locator(".tarot-card--across")).toHaveCount(1);

  // Every position lands in its OWN named grid area. A missing or duplicated
  // area name is the failure this catches: CSS drops the card into the implicit
  // grid with no error, so the only visible symptom is a crooked spread.
  const areas = await page.locator(".arc-cards-row--geo .tarot-card").evaluateAll(
    (nodes) => nodes.map((n) => getComputedStyle(n as HTMLElement).gridArea),
  );
  expect(areas).toHaveLength(10);
  expect(new Set(areas).size).toBe(10);
  expect(areas.some((a) => a.startsWith("auto"))).toBe(false);
});
