import { test, expect } from "./helpers";

// Morning panel (NEXT_ARC Track 3, P2): the at-a-glance boot surface — today's
// transit arcana card + the day's tightest transits — shown above the wheel,
// dismissible once per local day, and degrading on-device when the backend is
// severed (same engines as the modals).

const isApiCall = (url: URL) => url.pathname.startsWith("/api/");

test("greets the day with a card and today's transits", async ({ page }) => {
  await page.goto("/");

  const panel = page.locator(".morning-panel");
  await expect(panel).toBeVisible();
  await expect(panel.locator(".morning-title")).toHaveText(/This morning/);

  // The overlay always deals exactly one card for today.
  await expect(panel.locator(".morning-card-name")).not.toBeEmpty({ timeout: 15_000 });
  // The transit column settles into events or an honest quiet-sky line.
  await expect
    .poll(() => panel.locator(".morning-transit").count(), { timeout: 15_000 })
    .toBeGreaterThan(0);
});

test("dismissal is remembered for the local day", async ({ page }) => {
  await page.goto("/");

  const panel = page.locator(".morning-panel");
  await expect(panel).toBeVisible();
  await page.getByRole("button", { name: "Dismiss morning panel" }).click();
  await expect(panel).toHaveCount(0);

  // Reload: still dismissed — the panel greets each day once.
  await page.reload();
  await expect(page.locator(".wheel-area svg").first()).toBeVisible();
  await expect(page.locator(".morning-panel")).toHaveCount(0);
});

test("computes the card and transits on-device with the backend offline", async ({ page, context }) => {
  await context.route(isApiCall, (route) => route.abort());
  await page.goto("/");

  const panel = page.locator(".morning-panel");
  await expect(panel).toBeVisible();

  // Both engines fall back to @astra/core, and the panel says so.
  await expect(panel.locator(".arc-ondevice")).toBeVisible({ timeout: 20_000 });
  await expect(panel.locator(".morning-card-name")).not.toBeEmpty({ timeout: 20_000 });
  await expect
    .poll(() => panel.locator(".morning-transit").count(), { timeout: 20_000 })
    .toBeGreaterThan(0);
});
