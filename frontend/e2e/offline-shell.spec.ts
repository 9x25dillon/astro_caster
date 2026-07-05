import { test, expect } from "./helpers";

// Offline app shell (MOBILE_ROADMAP §7.4): the last successful cast persists
// in localStorage, so losing the backend must NOT mean a dead observatory.
// The service worker precaches the static shell in production builds; these
// specs cover the app-level layer that works in both dev and prod.

// Abort only true API calls. A glob like **/api/** would also match the
// app's own dev-server module path (/src/api/client.ts) and blank the page.
const isApiCall = (url: URL) => url.pathname.startsWith("/api/");

test("offline reload restores the last cast with a cached-view note", async ({ page, context }) => {
  // First visit online — populates the last-chart cache.
  await page.goto("/");
  const wheel = page.locator(".wheel-area svg").first();
  await expect
    .poll(() => wheel.locator("text").count(), { timeout: 15_000 })
    .toBeGreaterThan(10);
  await expect(page.locator(".offline-note")).toHaveCount(0);

  // Sever the API and reload — the wheel must come back from the cache.
  await context.route(isApiCall, (route) => route.abort());
  await page.reload();
  await expect
    .poll(() => wheel.locator("text").count(), { timeout: 15_000 })
    .toBeGreaterThan(10);
  await expect(page.locator(".offline-note")).toBeVisible();
});

test("offline with no cache surfaces the error, not a silent blank", async ({ page, context }) => {
  await context.route(isApiCall, (route) => route.abort());
  await page.goto("/");
  await expect(page.locator(".error").first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".offline-note")).toHaveCount(0);
});
