import { test, expect } from "./helpers";

// Track E-3 — the deluxe edition on the card rail.
//
// The deluxe claim is the interesting half of the redirect flow: it must prove
// WHICH Oracle session was paid for, but the raw seed ends with the customer's
// question and never goes to Stripe. So the browser stashes the seed before
// leaving and claims against it on return. These tests cover that hand-off,
// including the case where the stash isn't there.

const SEED = "e2e-deluxe-seed";
const CLAIM = {
  granted: true,
  product: "personal_report",
  note: "claimed",
  report_token: { token: "e2e.report.token", seed: SEED, verified: true, exp: 9_999_999_999 },
};

const readTokens = (page: import("@playwright/test").Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("aae.report_tokens") ?? "{}"));

async function stubClaim(
  context: import("@playwright/test").BrowserContext,
  body: unknown = CLAIM,
  status = 200,
) {
  await context.route(
    (url) => url.pathname.endsWith("/personal-report/checkout/claim"),
    (route) => route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    }),
  );
}

test("returning from a deluxe checkout claims the token for the stashed session", async ({ page, context }) => {
  await stubClaim(context);
  await page.addInitScript((seed) => {
    localStorage.setItem(
      "aae.pending_report_seed",
      JSON.stringify({ sessionId: "cs_deluxe_e2e", seed }),
    );
  }, SEED);

  await page.goto("/?report_checkout=cs_deluxe_e2e");

  await expect(page.locator(".checkout-note")).toContainText(/Deluxe edition unlocked/i);
  expect(page.url()).not.toContain("report_checkout=");
  expect(await readTokens(page)).toEqual({ [SEED]: CLAIM.report_token.token });
  // The stash is spent, not left lying around for a later purchase to inherit.
  expect(await page.evaluate(() => localStorage.getItem("aae.pending_report_seed"))).toBeNull();
});

test("a return with no stashed seed says so instead of guessing", async ({ page, context }) => {
  // e.g. the purchase finished in a different browser. Claiming against the
  // wrong session would bind someone's payment to a reading they didn't buy.
  await stubClaim(context);
  await page.goto("/?report_checkout=cs_orphan");
  await expect(page.locator(".checkout-note")).toContainText(/doesn't hold the Oracle session/i);
  expect(await readTokens(page)).toEqual({});
});

test("a purchase for a different Oracle session is refused in plain words", async ({ page, context }) => {
  await stubClaim(context, { detail: "this purchase was for a different Oracle session" }, 409);
  await page.addInitScript((seed) => {
    localStorage.setItem(
      "aae.pending_report_seed",
      JSON.stringify({ sessionId: "cs_mismatch", seed }),
    );
  }, SEED);

  await page.goto("/?report_checkout=cs_mismatch");
  await expect(page.locator(".checkout-note")).toContainText(/different Oracle session/i);
  expect(await readTokens(page)).toEqual({});
});

test("the deluxe Buy button stashes the seed, redirects, and returns unlocked", async ({ page, context }) => {
  // The whole loop from inside the Reading chapter, with our own origin
  // standing in for Stripe's hosted page.
  await context.route(
    (url) => url.pathname.endsWith("/pricing"),
    (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        card_available: true, crypto_available: true, mode: "payment",
        currency: "usd", tiers: [{ tier: "oracle", usd: 15 }], report_usd: 9,
      }),
    }),
  );
  await context.route(
    (url) => url.pathname.endsWith("/oracle-report"),
    (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        spread: "three_card", source: "rider_waite",
        question: "What do I need to understand right now?",
        seed: SEED, lineage: "Golden Dawn / Hermetic",
        report: "# ✦ ORACLE REPORT ✦\n\n## I. The Reading\n\nStubbed for the purchase path.",
        ai_source: "offline", model: null, disclaimer: "mirror, not verdict",
      }),
    }),
  );
  await context.route(
    (url) => url.pathname.endsWith("/personal-report/checkout"),
    (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        url: "/?report_checkout=cs_deluxe_flow",
        session_id: "cs_deluxe_flow",
      }),
    }),
  );
  await stubClaim(context);

  await page.goto("/");
  await expect
    .poll(() => page.locator(".wheel-area svg text").count(), { timeout: 20_000 })
    .toBeGreaterThan(10);

  await page.locator('.dial-node[data-ch="II"]').evaluate((el) => (el as HTMLElement).click());
  const drawTab = page.getByRole("button", { name: "Draw", exact: true });
  await drawTab.scrollIntoViewIfNeeded();
  await drawTab.click();
  const genBtn = page.getByRole("button", { name: /Generate Oracle Report/ });
  await genBtn.scrollIntoViewIfNeeded();
  await genBtn.click();

  // The card option renders at the live price beside the crypto row.
  const buy = page.locator(".deluxe-buy-card");
  await expect(buy).toContainText("$9", { timeout: 15_000 });
  await buy.scrollIntoViewIfNeeded();
  await buy.click();

  // Redirected out and back; the claim landed against the stashed seed.
  await expect(page.locator(".checkout-note")).toContainText(/Deluxe edition unlocked/i, { timeout: 15_000 });
  expect(await readTokens(page)).toEqual({ [SEED]: CLAIM.report_token.token });
});
