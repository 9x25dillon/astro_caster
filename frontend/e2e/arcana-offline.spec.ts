import { test, expect } from "./helpers";

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

  await page.getByRole("button", { name: "✶ Arcana" }).click();
  await expect(page.locator(".arcana-modal")).toBeVisible();

  // Natal tab (default) builds its signature on-device — links render.
  await expect
    .poll(() => page.locator(".arc-link-card").count(), { timeout: 15_000 })
    .toBeGreaterThan(0);

  await page.getByRole("button", { name: "Draw", exact: true }).first().click();
  // Two buttons share .arc-draw-btn (spread draw + Oracle Report); take the draw one.
  await page.locator(".arc-draw-btn").filter({ hasText: /^Draw$/ }).click();

  // three_card is the default spread → three dealt cards, each with a meaning.
  const drawn = page.locator(".arc-drawn");
  await expect.poll(() => drawn.count(), { timeout: 15_000 }).toBe(3);
  await expect(drawn.first().locator(".arc-drawn-meaning")).not.toBeEmpty();
});
