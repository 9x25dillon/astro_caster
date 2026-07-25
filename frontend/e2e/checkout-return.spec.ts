import { test, expect, openChapter } from "./helpers";

// Track E-3 — the Stripe tier rail, end to end minus Stripe itself.
//
// Stripe's hosted page cannot (and must not) be driven from CI, so we stub the
// two API calls around it and point the "hosted URL" back at our own origin.
// Everything else is the real thing: the real Buy button, a real browser
// navigation, the real return handler, the real store.
//
// Route predicates match on pathname, never an exact glob — the API answers on
// both /api/* and /api/v1/* (session 17's version prefix).

const ENT = {
  token: "e2e.checkout.token",
  tier: "oracle",
  verified: true,
  exp: Math.floor(Date.now() / 1000) + 86_400,
};

/** The backend would reject our fabricated token, so validateEntitlement would
 *  clear it and mask the return handler's work. Stand in for it — honouring
 *  whether a token was actually presented, so the pill still reads "free"
 *  before the purchase and "supporter" only after it. */
async function stubEntitlementCheck(context: import("@playwright/test").BrowserContext) {
  await context.route(
    (url) => url.pathname.endsWith("/entitlement"),
    (route) => {
      const token = route.request().headers()["x-aae-token"] ?? "";
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ supporter: !!token, tier: token ? "oracle" : "free", valid: !!token }),
      });
    },
  );
}

async function stubPricing(
  context: import("@playwright/test").BrowserContext,
  overrides: Record<string, unknown> = {},
) {
  await context.route(
    (url) => url.pathname.endsWith("/pricing"),
    (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        card_available: true,
        crypto_available: true,
        mode: "subscription",
        currency: "usd",
        tiers: [{ tier: "supporter", usd: 4 }, { tier: "oracle", usd: 18 }],
        report_usd: 12.5,
        ...overrides,
      }),
    }),
  );
}

test("buying a tier by card: checkout → return → unlocked, session id scrubbed", async ({ page, context }) => {
  await stubPricing(context);
  await stubEntitlementCheck(context);

  // Stripe stand-in: the hosted URL is our own origin, so clicking Buy really
  // navigates and really comes back through the return handler.
  await context.route(
    (url) => url.pathname.endsWith("/checkout") && !url.pathname.includes("personal-report"),
    (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ url: "/?checkout=cs_test_e2e", session_id: "cs_test_e2e" }),
    }),
  );
  await context.route(
    (url) => url.pathname.includes("/checkout/cs_test_e2e"),
    (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ granted: true, tier: "oracle", entitlement: ENT }),
    }),
  );

  await page.goto("/");
  await expect(page.locator(".support-pill")).toHaveText(/Support \/ Unlock/);

  // The pricing surface lives in the Library and renders LIVE prices.
  await openChapter(page, "VIII");
  const oracleTier = page.locator(".pricing-tier--oracle");
  await expect(oracleTier).toContainText("$18");
  await expect(oracleTier).toContainText("/month");        // subscription wording
  await expect(page.locator(".pricing-fine")).toContainText(/[Cc]ancel any time/);

  await oracleTier.locator(".pricing-buy").click();

  // Back from "Stripe", unlocked.
  await expect(page.locator(".checkout-note")).toContainText(/Unlocked/, { timeout: 15_000 });
  await expect(page.locator(".support-pill")).toHaveText(/✦ Supporter/);
  expect(await page.evaluate(() => localStorage.getItem("aae.entitlement"))).toBe(ENT.token);

  // The session id must not linger in the address bar (reload-safety + referrer).
  expect(page.url()).not.toContain("checkout=");

  // And a reload doesn't re-trigger anything.
  await page.reload();
  await expect(page.locator(".checkout-note")).toHaveCount(0);
  await expect(page.locator(".support-pill")).toHaveText(/✦ Supporter/);
});

test("a payment still settling is polled, not declared failed", async ({ page, context }) => {
  await stubEntitlementCheck(context);
  let reads = 0;
  await context.route(
    (url) => url.pathname.includes("/checkout/cs_pending"),
    (route) => {
      reads += 1;
      // First read: the browser beat the webhook. Second: settled.
      const body = reads === 1
        ? { granted: false, status: "unpaid" }
        : { granted: true, tier: "supporter", entitlement: ENT };
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    },
  );

  await page.goto("/?checkout=cs_pending");
  await expect(page.locator(".checkout-note")).toContainText(/Unlocked/, { timeout: 20_000 });
  expect(reads).toBeGreaterThan(1);
});

test("cancelling charges nothing and changes nothing", async ({ page }) => {
  await page.goto("/?checkout=cancel");
  await expect(page.locator(".checkout-note")).toContainText(/nothing was charged/i);
  await expect(page.locator(".support-pill")).toHaveText(/Support \/ Unlock/);
  expect(await page.evaluate(() => localStorage.getItem("aae.entitlement"))).toBeNull();
  expect(page.url()).not.toContain("checkout=");

  // The notice is acknowledgeable, not sticky.
  await page.locator(".checkout-note-ok").click();
  await expect(page.locator(".checkout-note")).toHaveCount(0);
});

test("with the card rail off, the surface offers crypto alone — no dead Buy button", async ({ page, context }) => {
  await stubPricing(context, { card_available: false });
  await page.goto("/");
  await openChapter(page, "VIII");
  await expect(page.locator(".lib-support-btn")).toHaveText(/Support \/ Unlock/);
  await expect(page.locator(".pricing-tier")).toHaveCount(0);
  await expect(page.locator(".pricing-buy")).toHaveCount(0);
});
