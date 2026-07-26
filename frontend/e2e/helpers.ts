import { test as base, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

/** Tokens minted by global-setup; empty object when minting was unavailable. */
export function mintedTokens(): { supporter?: string; oracle?: string } {
  try {
    return JSON.parse(readFileSync(path.resolve("e2e/.tokens.json"), "utf8"));
  } catch {
    return {};
  }
}

// Every spec starts past the first-run ceremony and privacy banner so tests
// land directly on the observatory.
export const test = base.extend({
  context: async ({ context }, use) => {
    await context.addInitScript(() => {
      localStorage.setItem("aae.ceremony_shown", "1");
      localStorage.setItem("aae.privacy_ack", "1");
    });
    await use(context);
  },
});

export { expect } from "@playwright/test";

/**
 * Track E-1: land the browser PAST the threshold, i.e. as somebody who already
 * has a chart of their own rather than a first-time visitor meeting the live
 * sky. Arrival prefers this browser's last cast, so rewriting that cast's birth
 * to a personal one and reloading is the honest way in — and the second load
 * also caches a real chart for it, which specs that then sever the API rely on.
 */
export async function pastThreshold(page: import("@playwright/test").Page) {
  await page.goto("/");
  await expect
    .poll(() => page.locator(".wheel-area svg text").count(), { timeout: 20_000 })
    .toBeGreaterThan(10);
  await page.evaluate(() => {
    const raw = localStorage.getItem("aae.last_chart");
    if (!raw) throw new Error("no cached cast to rewrite — did arrival fail?");
    const parsed = JSON.parse(raw);
    parsed.birth = { ...parsed.birth, year: 1987, month: 11, day: 11, hour: 15, label: "Mine" };
    localStorage.setItem("aae.last_chart", JSON.stringify(parsed));
  });
  await page.reload();
  await expect
    .poll(() => page.locator(".wheel-area svg text").count(), { timeout: 20_000 })
    .toBeGreaterThan(10);
}

/** Track R: navigate via the chapter dial (fixed compass positions). */
export async function openChapter(
  page: import("@playwright/test").Page,
  ch: "I" | "II" | "III" | "IV" | "V" | "VI" | "VII" | "VIII",
) {
  await page.locator(`.dial-node[data-ch="${ch}"]`).click();
}
