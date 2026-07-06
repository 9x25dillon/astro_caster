import { test, expect } from "./helpers";

// Offline app shell (MOBILE_ROADMAP §7.4): the last successful cast persists
// in localStorage, so losing the backend must NOT mean a dead observatory.
// The service worker precaches the static shell in production builds; these
// specs cover the app-level layer that works in both dev and prod.

// Abort only true API calls. A glob like **/api/** would also match the
// app's own dev-server module path (/src/api/client.ts) and blank the page.
const isApiCall = (url: URL) => url.pathname.startsWith("/api/");

// Load until the BACKEND actually serves the chart — a cold backend (slow
// first boot) would otherwise let the on-device fallback answer, defeating the
// point of the cache test.
async function castOnline(page: import("@playwright/test").Page) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const respP = page
      .waitForResponse((r) => r.url().includes("/api/generate-chart"), { timeout: 8_000 })
      .catch(() => null);
    await page.goto("/");
    const resp = await respP;
    if (resp && resp.ok()) {
      await expect
        .poll(() => page.locator(".wheel-area svg text").count(), { timeout: 15_000 })
        .toBeGreaterThan(10);
      return;
    }
    await page.waitForTimeout(1_000);
  }
  throw new Error("backend never served /api/generate-chart");
}

test("offline reload restores the last cast with a cached-view note", async ({ page, context }) => {
  // First visit online (backend-served) — populates the last-chart cache.
  await castOnline(page);
  await expect(page.locator(".offline-note")).toHaveCount(0);

  // Sever the API and reload — the wheel must come back from the cache.
  await context.route(isApiCall, (route) => route.abort());
  await page.reload();
  const wheel = page.locator(".wheel-area svg").first();
  await expect
    .poll(() => wheel.locator("text").count(), { timeout: 15_000 })
    .toBeGreaterThan(10);
  await expect(page.locator(".offline-note")).toHaveText(/showing your last cast/);
});

test("offline with no cache casts on-device via @astra/core", async ({ page, context }) => {
  // No cached chart + backend severed from the start → the store's last-resort
  // fallback computes the chart in the browser (MOBILE_ROADMAP §3 / H1).
  await context.route(isApiCall, (route) => route.abort());
  await page.goto("/");
  const wheel = page.locator(".wheel-area svg").first();
  await expect
    .poll(() => wheel.locator("text").count(), { timeout: 15_000 })
    .toBeGreaterThan(10);
  // The on-device badge distinguishes a local cast from a cached view.
  await expect(page.locator(".offline-note")).toHaveText(/cast on your device/);
});
