import { test, expect, openChapter } from "./helpers";

// M3 — the policies. They are real pages at real URLs rather than in-app views,
// because Stripe links them at the point of sale and a customer has to be able
// to read them before paying.

const PAGES = ["privacy", "terms", "refunds", "pricing"] as const;

/**
 * A phrase matcher that survives the HTML source's line wrapping.
 * `toContainText` matches a regex against raw textContent, which keeps every
 * newline and indent exactly as written in the file — so a phrase that happens
 * to wrap ("…written to a\n        log file") silently fails to match. Joining
 * on \s+ asserts the words, not the typesetting.
 */
const phrase = (s: string) => new RegExp(s.trim().split(/\s+/).join("\\s+"), "i");

for (const page_ of PAGES) {
  test(`/legal/${page_}.html is a real, readable page`, async ({ page }) => {
    const res = await page.goto(`/legal/${page_}.html`);
    expect(res?.status()).toBe(200);
    await expect(page.locator("h1")).toBeVisible();
    // Every policy carries the licence obligation and links to its siblings.
    await expect(page.locator("footer.colophon")).toContainText(phrase("Affero"));
    await expect(page.locator("nav.legal-nav a")).toHaveCount(5);
  });
}

test("the refund window is stated as 14 days, consistently", async ({ page }) => {
  // The number has to agree wherever it appears — a refund policy that
  // disagrees with the terms is worse than none.
  await page.goto("/legal/refunds.html");
  await expect(page.locator(".lede")).toContainText(phrase("fourteen days"));

  await page.goto("/legal/terms.html");
  await expect(page.locator("body")).toContainText(phrase("fourteen days"));

  await page.goto("/legal/pricing.html");
  await expect(page.locator("body")).toContainText(phrase("fourteen-day refunds"));
});

test("the privacy page states retention, not a false transmission claim", async ({ page }) => {
  // The chart is computed server-side by default, so "never leaves your
  // browser" would be untrue. The promise that IS true is that nothing is kept.
  await page.goto("/legal/privacy.html");
  const body = page.locator("body");
  await expect(body).toContainText(phrase("never written to a log"));
  await expect(body).toContainText(phrase("do travel there"));
  await expect(body).not.toContainText(phrase("never leaves this browser"));
  await expect(body).not.toContainText(phrase("never leaves your browser"));
});

test("the pricing surface links the policies and the source", async ({ page }) => {
  await page.goto("/");
  await openChapter(page, "VIII");
  const legal = page.locator(".pricing-legal");
  await expect(legal).toBeVisible();
  // AGPL §13: serving this over a network obliges us to offer the source.
  await expect(legal.locator("a", { hasText: /Source/ })).toHaveAttribute("href", /github|git/i);
  for (const p of PAGES) {
    await expect(legal.locator(`a[href="/legal/${p}.html"]`)).toHaveCount(1);
  }
});

test("the policy pages load nothing from another origin", async ({ page }) => {
  // The app makes zero external requests; the policies must not quietly break
  // that (a webfont CDN in a privacy policy would be its own punchline).
  const foreign: string[] = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (!["localhost", "127.0.0.1"].includes(u.hostname)) foreign.push(r.url());
  });
  for (const p of PAGES) await page.goto(`/legal/${p}.html`);
  expect(foreign).toEqual([]);
});
