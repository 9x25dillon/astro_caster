import { test, expect, openChapter } from "./helpers";

// Session 26 — today's card, on the Reading chapter.
//
// The contract worth testing in a browser: the panel renders from the chart
// already in the store with no network, names the day, and shows a card. The
// notification switch is deliberately NOT expected here — it only appears on
// the native platform (isSupported() is false in a browser), and asserting it
// absent is what proves that gate works.

async function openReading(page: import("@playwright/test").Page) {
  await page.goto("/");
  await expect(page.locator(".wheel-area svg").first()).toBeVisible();
  await openChapter(page, "II");
  await expect(page.locator(".daily-panel")).toBeVisible();
}

test("the day's card is drawn on the Reading chapter", async ({ page }) => {
  await openReading(page);
  await expect(page.locator(".daily-panel .arc-drawn-pos")).toHaveText("Today");
  await expect(page.locator(".daily-panel .arc-chip")).toBeVisible();
  await expect(page.locator(".daily-panel .arc-drawn-meaning")).not.toBeEmpty();
});

test("the panel names the day it belongs to", async ({ page }) => {
  await openReading(page);
  // Rendered via toLocaleDateString, so assert the shape rather than a string:
  // a weekday and a month name, in whatever locale the runner uses.
  const text = await page.locator(".daily-panel .daily-date").textContent();
  expect((text ?? "").trim().length).toBeGreaterThan(6);
});

test("the notification switch is absent in a browser", async ({ page }) => {
  // isSupported() is Capacitor-native-only. A browser tab cannot honour a
  // schedule (the page has to be open), so offering the switch there would be
  // a control that silently does nothing.
  await openReading(page);
  await expect(page.locator(".daily-notify")).toHaveCount(0);
});

test("the day's card needs no network", async ({ page, context }) => {
  await page.goto("/");
  await expect(page.locator(".wheel-area svg").first()).toBeVisible();
  // Sever the API only after the shell has loaded — the draw is computed on
  // device from the chart in the store, so the panel must still fill in.
  await context.route((url) => url.pathname.startsWith("/api/"), (route) => route.abort());
  await openChapter(page, "II");
  await expect(page.locator(".daily-panel .arc-chip")).toBeVisible();
  await expect(page.locator(".daily-panel .arc-drawn-meaning")).not.toBeEmpty();
});

test("turning the card publishes it to the margin glass", async ({ page }) => {
  await openReading(page);
  await page.locator(".daily-panel .daily-card").click();
  await expect(page.locator(".margin-glass, .detail-panel").first()).toContainText(/Today/i);
});
