// Screenshot capture for the README and the store/landing surfaces.
//
// This is a CAPTURE TOOL, not a test — it asserts almost nothing and would only
// slow CI down, so the whole file is skipped unless CAPTURE_SCREENSHOTS is set:
//
//     CAPTURE_SCREENSHOTS=1 npx playwright test e2e/capture-screenshots.spec.ts \
//       --project=desktop-chromium
//
// It lives in e2e/ deliberately rather than as a standalone script, because
// global-setup already boots the tiered backend AND mints tier tokens. Driving
// the real app is the point: a screenshot assembled by hand drifts from the
// product the moment the product changes, and the whole reason this repo has a
// discrepancy log is claims that stopped matching the thing they described.
//
// The captures land in docs/screenshots/ with DESCRIPTIVE names. The previous
// set was `ui-01-16-33-27.png`-style timestamps from before Track R, which
// nobody could match to a surface without opening all seventeen.
import path from "node:path";
import { mkdirSync } from "node:fs";
import { mintedTokens } from "./helpers";
import { expect, test } from "@playwright/test";

const CAPTURE = !!process.env.CAPTURE_SCREENSHOTS;
const OUT = path.resolve("../docs/screenshots");

test.skip(!CAPTURE, "capture tool — set CAPTURE_SCREENSHOTS=1 to run");

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
});

/** Land past the first-run ceremony, with an optional entitlement. */
async function enter(page: import("@playwright/test").Page, token?: string) {
  await page.addInitScript(
    ([t]) => {
      localStorage.setItem("aae.ceremony_shown", "1");
      localStorage.setItem("aae.privacy_ack", "1");
      if (t) localStorage.setItem("aae.entitlement", t as string);
    },
    [token ?? ""],
  );
  await page.goto("/");
  await expect(page.locator(".wheel-area svg").first()).toBeVisible({ timeout: 30_000 });
  // Let the wheel finish drawing — a half-rendered chart is a bad advert.
  await expect
    .poll(() => page.locator(".wheel-area svg text").count(), { timeout: 20_000 })
    .toBeGreaterThan(10);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
}

async function shot(page: import("@playwright/test").Page, name: string) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false });
}

async function chapter(page: import("@playwright/test").Page, ch: string, name: string) {
  await page.locator(`.dial-node[data-ch="${ch}"]`).click();
  await page.waitForTimeout(700); // chapter bloom is a 240ms clip-path wipe
  await shot(page, name);
}

test("capture: the free tier, as a first-time visitor meets it", async ({ page }) => {
  // Deliberately NOT past the threshold — this is the first thing anyone sees,
  // and E-1's whole argument is that the live sky does the arguing.
  await page.goto("/");
  await expect(page.locator(".threshold")).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
  await shot(page, "01-threshold-first-visit");

  await page.locator(".threshold-primary").click();
  await expect(page.locator(".ceremony-modal")).toBeVisible();
  await page.waitForTimeout(300);
  await shot(page, "02-ceremony-birth-entry");
});

test("capture: the chart and the chapters, free tier", async ({ page }) => {
  await enter(page);
  await shot(page, "03-chart-wheel");
  await chapter(page, "II", "04-reading-arcana");
  await chapter(page, "III", "05-timing-forecast");
  await chapter(page, "IV", "06-relations");
  await chapter(page, "V", "07-depths");
  await chapter(page, "VIII", "08-library-shelf-journal-vault");
});

test("capture: the birthplace picker — offline gazetteer + vendored map", async ({ page }) => {
  // Worth its own frame: this is the surface GAZ rebuilt, and "your birthplace
  // never leaves the device" is the strongest privacy claim the product makes.
  await page.goto("/");
  await expect(page.locator(".threshold")).toBeVisible({ timeout: 30_000 });
  await page.locator(".threshold-primary").click();
  await expect(page.locator(".ceremony-modal")).toBeVisible();
  const modal = page.locator(".ceremony-modal");
  await modal.getByRole("button", { name: /Begin/ }).click();
  await modal.getByRole("button", { name: /Continue/ }).click();
  await modal.getByRole("button", { name: /pick on map/ }).click();
  await modal.getByPlaceholder(/city or place name/i).fill("Ulm");
  await modal.getByRole("button", { name: "Find" }).click();
  await page.waitForTimeout(600);
  await shot(page, "09-birthplace-offline-gazetteer");
});

test("capture: the premium surfaces, on an oracle entitlement", async ({ page }) => {
  const { oracle } = mintedTokens();
  test.skip(!oracle, "no oracle token — global-setup could not mint one");
  await enter(page, oracle);
  await shot(page, "10-oracle-tier-chart");
  await chapter(page, "II", "11-oracle-reading-surface");
  await chapter(page, "VI", "12-study-course-and-path");
  await chapter(page, "VII", "13-studio-deck-art");
});

test("capture: the pricing surface", async ({ page }) => {
  await enter(page);
  await page.locator(`.dial-node[data-ch="VIII"]`).click();
  await page.waitForTimeout(500);
  const buy = page.getByRole("button", { name: /support|unlock/i }).first();
  if (await buy.count()) {
    await buy.click();
    await page.waitForTimeout(700);
  }
  await shot(page, "14-pricing-and-support");
});

test("capture: mobile viewport", async ({ browser }) => {
  // The store listing and half the visitors are phone-shaped.
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await enter(page);
  await shot(page, "15-mobile-chart");
  await page.locator(`.dial-node[data-ch="II"]`).click();
  await page.waitForTimeout(700);
  await shot(page, "16-mobile-reading");
  await ctx.close();
});
