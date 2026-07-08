import { test, expect } from "./helpers";

// Offline relational/predictive/advanced (MOBILE_ROADMAP §3.4): with the backend
// unreachable, the Relationship / Timing / Advanced modals fall back to
// @astra/core's on-device engines (full body set) and flag it.

const isApiCall = (url: URL) => url.pathname.startsWith("/api/");

test("relationship, predictive and advanced degrade to on-device compute", async ({ page, context }) => {
  await page.goto("/");
  await expect
    .poll(() => page.locator(".wheel-area svg text").count(), { timeout: 20_000 })
    .toBeGreaterThan(10);

  // Sever the backend for every API call.
  await context.route(isApiCall, (route) => route.abort());

  // Relationship → synastry on-device.
  await page.getByRole("button", { name: /Relate/ }).click();
  await page.getByRole("button", { name: "Compare charts" }).click();
  await expect(page.locator(".arc-ondevice")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/inter-aspects/)).toBeVisible();
  await page.keyboard.press("Escape");

  // Predictive → progressions on-device.
  await page.getByRole("button", { name: /Timing/ }).click();
  await page.getByRole("button", { name: "Progress", exact: true }).click();
  await expect(page.locator(".arc-ondevice")).toBeVisible({ timeout: 15_000 });
  // Eclipses on-device (astronomy-engine's own eclipse search).
  await page.getByRole("button", { name: "Eclipses", exact: true }).click();
  await page.getByRole("button", { name: /Next 8 eclipses/ }).click();
  await expect(page.locator(".arc-ondevice")).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press("Escape");

  // Advanced → harmonics on-device.
  await page.getByRole("button", { name: /Advanced/ }).click();
  await page.getByRole("button", { name: "Compute", exact: true }).click();
  await expect(page.locator(".arc-ondevice")).toBeVisible({ timeout: 15_000 });
});
