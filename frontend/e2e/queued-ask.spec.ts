import { test, expect } from "./helpers";

// Offline ask queue (MOBILE_ROADMAP §4.1, H1): a reflection typed with no
// connection must not dead-end in an error. The store captures it (persisted to
// localStorage) and fires it when the network returns — the last piece of the
// offline-first shell.
//
// We simulate "offline" by aborting only the AI endpoints (a fetch abort throws
// "Failed to fetch", which the store reads as an offline error), then "reconnect"
// by serving a canned reading — deterministic, independent of the backend's AI
// provider speed.

// Matches both /api/ai-ask and /api/ai-ask-stream.
const isAiAsk = (url: URL) => url.pathname.startsWith("/api/ai-ask");

test("an ask made offline is queued, then flushes on reconnect", async ({ page, context }) => {
  await page.goto("/");
  // Wait for a chart to render (from the API or the on-device fallback) so the
  // ask has something to interpret against.
  await expect
    .poll(() => page.locator(".wheel-area svg text").count(), { timeout: 20_000 })
    .toBeGreaterThan(10);

  // "Offline": AI calls fail. The store should queue the ask, not error.
  await context.route(isAiAsk, (route) => route.abort());
  await page.getByPlaceholder(/Ask about your chart/).fill("What is my path?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.locator(".queued-note")).toHaveText(/1 reflection queued/);

  // "Reconnect": serve a canned reading and fire the window 'online' event
  // (a real browser dispatches it on reconnect) so flushAskQueue drains.
  await context.unroute(isAiAsk);
  await context.route("**/api/ai-ask", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ interpretation: "A queued reflection, now delivered.", provider: "offline", model: "test" }),
    })
  );
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.locator(".queued-note")).toHaveCount(0, { timeout: 20_000 });
});
