import { test, expect } from "./helpers";

// Shared-chart import (MOBILE_ROADMAP §4.1, H1): a `?chart=<token>` link carries
// a base64url-encoded BirthInput so a chart can be handed to someone as a
// self-contained URL — no server, no account, birth data only in the link.
// The PWA also registers a `share_target`, so a shared link/text lands here too.

// Mirror src/lib/shareChart.ts encodeBirthShare (base64url of the JSON).
function encodeBirthShare(birth: object): string {
  return Buffer.from(JSON.stringify(birth), "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

const SHARED = {
  year: 1991, month: 3, day: 7, hour: 9, minute: 15, second: 0,
  lat: 40.7128, lng: -74.006, tz_offset: -5,
  house_system: "P", zodiac: "tropical", ayanamsha: 1,
  label: "Shared · NYC 1991",
};

test("?chart=<token> imports the chart and scrubs the URL", async ({ page }) => {
  await page.goto(`/?chart=${encodeBirthShare(SHARED)}`);
  // The one-time param is removed so a reload doesn't re-import stale data.
  await expect(page).toHaveURL("/");
  // The imported label surfaces under Birth Data, proving the birth was applied.
  await expect(page.getByText("Shared · NYC 1991")).toBeVisible();
});

test("a chart link embedded in shared text is imported", async ({ page }) => {
  // share_target hands us `text`, not a clean param — we dig the token out of it.
  const token = encodeBirthShare(SHARED);
  const text = encodeURIComponent(`My chart https://example.com/?chart=${token}`);
  await page.goto(`/?text=${text}`);
  await expect(page).toHaveURL("/");
  await expect(page.getByText("Shared · NYC 1991")).toBeVisible();
});

test("a token-shaped but undecodable chart param is consumed and ignored", async ({ page }) => {
  // Looks like a token (long, base64url-clean) but doesn't decode to a birth —
  // the param is still scrubbed and the app falls back to the sample chart.
  const bogus = encodeBirthShare({ notABirth: true, pad: "x".repeat(24) });
  await page.goto(`/?chart=${bogus}`);
  await expect(page).toHaveURL("/");
  await expect
    .poll(() => page.locator(".wheel-area svg text").count(), { timeout: 20_000 })
    .toBeGreaterThan(10);
});
