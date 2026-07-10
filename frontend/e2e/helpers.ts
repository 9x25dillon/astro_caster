import { test as base } from "@playwright/test";
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

/** Track R: navigate via the chapter dial (fixed compass positions). */
export async function openChapter(
  page: import("@playwright/test").Page,
  ch: "I" | "II" | "III" | "IV" | "V" | "VI" | "VII" | "VIII",
) {
  await page.locator(`.dial-node[data-ch="${ch}"]`).click();
}
