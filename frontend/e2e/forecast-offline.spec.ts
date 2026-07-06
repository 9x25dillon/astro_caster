import { test, expect } from "./helpers";

// Offline forecast (MOBILE_ROADMAP §3/H1): with the backend severed, the panel
// scans transits on-device via @astra/core and still lists events.
const isApiCall = (url: URL) => url.pathname.startsWith("/api/");

test("lists transit events on-device with the backend offline", async ({ page, context }) => {
  await context.route(isApiCall, (route) => route.abort());
  await page.goto("/");

  const wheel = page.locator(".wheel-area svg").first();
  await expect
    .poll(() => wheel.locator("text").count(), { timeout: 15_000 })
    .toBeGreaterThan(10);

  await page.getByRole("button", { name: "☌ Forecast" }).click();
  await expect(page.locator(".forecast-title")).toBeVisible();
  await expect(page.locator(".fc-offline-tag")).toBeVisible();

  // The on-device scan produces events for the reference chart.
  await expect
    .poll(() => page.locator(".fc-event").count(), { timeout: 15_000 })
    .toBeGreaterThan(0);
});
