import { test, expect, openChapter, mintedTokens } from "./helpers";

// Session 25 — the Library's key-import field. The reader APK has no address
// bar, so `?entitlement=` (entitlement-url.spec) is unreachable there: this
// paste field is the only way a key bought on the web gets into the app. The
// contract: verify BEFORE storing — a bad paste changes nothing.

async function openVault(page: import("@playwright/test").Page) {
  await page.goto("/");
  await expect(page.locator(".wheel-area svg").first()).toBeVisible();
  await openChapter(page, "VIII");
  await expect(page.locator(".key-import-field")).toBeVisible();
}

test("an invalid key is refused and nothing is stored", async ({ page }) => {
  await openVault(page);
  await page.locator(".key-import-field").fill("not-a-real-token");
  await page.locator(".key-import-btn").click();
  await expect(page.locator(".key-import-note")).toContainText(/didn't verify/i);
  expect(
    await page.evaluate(() => localStorage.getItem("aae.entitlement"))
  ).toBeNull();
});

test("with the backend unreachable the key is not stored and the note says so", async ({ page, context }) => {
  await openVault(page);
  // Sever the API only now — the page itself loaded normally.
  await context.route((url) => url.pathname.startsWith("/api/"), (route) => route.abort());
  await page.locator(".key-import-field").fill("some-token-pasted-on-a-train");
  await page.locator(".key-import-btn").click();
  await expect(page.locator(".key-import-note")).toContainText(/couldn't reach/i);
  expect(
    await page.evaluate(() => localStorage.getItem("aae.entitlement"))
  ).toBeNull();
});

test("a minted key pasted bare unlocks supporter chrome", async ({ page }) => {
  const { oracle } = mintedTokens();
  test.skip(!oracle, "backend venv / mint tool unavailable");

  await openVault(page);
  await page.locator(".key-import-field").fill(oracle!);
  await page.locator(".key-import-btn").click();
  await expect(page.locator(".key-import-note")).toContainText(/unlocked/i);
  await expect(page.locator(".support-pill")).toHaveText(/✦ Supporter/);
  expect(
    await page.evaluate(() => localStorage.getItem("aae.entitlement"))
  ).toBe(oracle);
});

test("a whole pasted unlock LINK works — the token is extracted from it", async ({ page }) => {
  const { oracle } = mintedTokens();
  test.skip(!oracle, "backend venv / mint tool unavailable");

  await openVault(page);
  await page
    .locator(".key-import-field")
    .fill(`https://app.astra-arcana.com/?entitlement=${oracle}`);
  await page.locator(".key-import-btn").click();
  await expect(page.locator(".key-import-note")).toContainText(/unlocked/i);
  expect(
    await page.evaluate(() => localStorage.getItem("aae.entitlement"))
  ).toBe(oracle);
});

test("a malformed unlock link is refused without stranding the field", async ({ page }) => {
  // A link truncated mid-percent-escape — what a share sheet or a mail client
  // hands you when the URL got cut. decodeURIComponent THROWS on it, and that
  // throw used to escape importEntitlement entirely: the note never arrived,
  // the button never came back off "Verifying…", and the field was dead until
  // a reload. On the APK this paste field is the only route a key has, so a
  // dead field is a dead purchase.
  await openVault(page);
  await page
    .locator(".key-import-field")
    .fill("https://app.astra-arcana.com/?entitlement=abc%");
  await page.locator(".key-import-btn").click();
  await expect(page.locator(".key-import-note")).toContainText(/didn't verify/i);
  // The recovery is the point of the test, not the message: the control has to
  // come back so the reader can correct the paste in place.
  await expect(page.locator(".key-import-btn")).toBeEnabled();
  await expect(page.locator(".key-import-btn")).toContainText(/Unlock this device/i);
  expect(
    await page.evaluate(() => localStorage.getItem("aae.entitlement"))
  ).toBeNull();
});

test("a payment reference is routed to the card rail, not refused as a bad key", async ({ page }) => {
  // The field takes what the reader HAS. Someone who cleared their site data
  // has no key to bring — the key was the thing they lost — so they paste the
  // reference off their receipt instead. It must not come back "that key
  // didn't verify": a real payment answered as a bad credential is how the
  // $5.50 of 2026-08-28 went undelivered.
  //
  // The test server's Stripe configuration is not this test's business, so the
  // assertion is the invariant that holds either way: a DIFFERENT sentence
  // from the bad-key one, the control back in the reader's hands, and nothing
  // stored.
  await openVault(page);
  await page.locator(".key-import-field").fill("sub_1U4lWeLyOHuDktpUiiUpM3Ri");
  await page.locator(".key-import-btn").click();
  await expect(page.locator(".key-import-note")).toBeVisible();
  await expect(page.locator(".key-import-note")).not.toContainText(/didn't verify/i);
  await expect(page.locator(".key-import-btn")).toBeEnabled();
  expect(
    await page.evaluate(() => localStorage.getItem("aae.entitlement"))
  ).toBeNull();
});

test("the crypto field names the card rail instead of denying a card payment", async ({ page }) => {
  // The other half of the same fix, at the field where the mistake actually
  // happened. This input is the ON-CHAIN rail: it answers anything it does not
  // recognise with "on-chain verification unavailable and trust mode is
  // disabled", which reads as "your payment failed". A customer holding a real,
  // verified $5.50 receipt read exactly that on 2026-08-28 and stopped looking.
  //
  // Session 38 renamed the field, which stops the invitation. This asserts the
  // stronger thing: a card reference pasted here anyway is recognised and told
  // where to go, and never reaches the verifier that cannot judge it.
  await page.goto("/");
  await expect(page.locator(".wheel-area svg").first()).toBeVisible();
  await page.locator(".support-pill").click();
  await page.locator(".lib-support-btn").click();

  const field = page.locator(".crypto-tx-field");
  await expect(field).toBeVisible();
  await field.fill("pi_3u9g90LyOHuDktpU0abcdef");
  await page.locator(".crypto-verify-btn").click();

  const status = page.locator(".modal p", { hasText: /card payment reference/i });
  await expect(status).toBeVisible();
  await expect(status).toContainText(/Bring your key/i);
  // And nothing was sent down the wrong rail: no unlock, no stored key.
  expect(
    await page.evaluate(() => localStorage.getItem("aae.entitlement"))
  ).toBeNull();
});

test("whitespace from a wrapped paste is stripped before verification", async ({ page }) => {
  const { supporter } = mintedTokens();
  test.skip(!supporter, "backend venv / mint tool unavailable");

  // Split the token as a phone's mail client wraps it.
  const wrapped = `${supporter!.slice(0, 20)}\n  ${supporter!.slice(20)}`;
  await openVault(page);
  await page.locator(".key-import-field").fill(wrapped);
  await page.locator(".key-import-btn").click();
  await expect(page.locator(".key-import-note")).toContainText(/unlocked/i);
  expect(
    await page.evaluate(() => localStorage.getItem("aae.entitlement"))
  ).toBe(supporter);
});

// Session 29 — the export half. The import field above has existed since
// session 25, but nothing ever SHOWED a key, so a subscriber who bought in a
// desktop browser had no way to get their own key out and onto their phone:
// the field they needed to fill had no source short of devtools. These pin the
// round trip, which is the thing that actually makes a second device work.

test("with no key there is nothing to export", async ({ page }) => {
  await openVault(page);
  // A reveal button on a device that holds no subscription can only
  // disappoint, so the whole block is absent rather than disabled.
  await expect(page.locator(".key-export")).toHaveCount(0);
});

test("an imported key can be revealed byte-identical and is hidden by default", async ({ page }) => {
  const { oracle } = mintedTokens();
  test.skip(!oracle, "backend venv / mint tool unavailable");

  await openVault(page);
  await page.locator(".key-import-field").fill(oracle!);
  await page.locator(".key-import-btn").click();
  await expect(page.locator(".key-import-note")).toContainText(/unlocked/i);

  // The export block appears now that there is something to export.
  await expect(page.locator(".key-export")).toBeVisible();
  await expect(page.locator(".key-copy-btn")).toBeVisible();

  // Default-hidden: the token is a BEARER credential with no device binding,
  // so it must not sit on screen through an incidental screenshot or a shared
  // screen. It costs one tap to see it.
  await expect(page.locator(".key-export-field")).toHaveCount(0);
  await expect(page.locator(".key-reveal-btn")).toHaveAttribute("aria-expanded", "false");

  await page.locator(".key-reveal-btn").click();
  await expect(page.locator(".key-reveal-btn")).toHaveAttribute("aria-expanded", "true");

  // THE assertion: what is revealed must be exactly what a second device needs
  // to paste. A truncated or prettified display would look right here and fail
  // on the other device, which is the worst possible place to find out.
  await expect(page.locator(".key-export-field")).toHaveValue(oracle!);

  await page.locator(".key-reveal-btn").click();
  await expect(page.locator(".key-export-field")).toHaveCount(0);
});

test("the revealed key round-trips back through the import field", async ({ page }) => {
  const { oracle } = mintedTokens();
  test.skip(!oracle, "backend venv / mint tool unavailable");

  await openVault(page);
  await page.locator(".key-import-field").fill(oracle!);
  await page.locator(".key-import-btn").click();
  await expect(page.locator(".key-import-note")).toContainText(/unlocked/i);
  await page.locator(".key-reveal-btn").click();

  const revealed = await page.locator(".key-export-field").inputValue();

  // Simulate the second device: clear everything, then paste what the first
  // device showed. This is the whole user journey — buy on the web, read the
  // key, type it into the phone — compressed into one page.
  await page.evaluate(() => localStorage.removeItem("aae.entitlement"));
  await page.reload();
  await openChapter(page, "VIII");
  await expect(page.locator(".key-export")).toHaveCount(0);   // key really gone

  await page.locator(".key-import-field").fill(revealed);
  await page.locator(".key-import-btn").click();
  await expect(page.locator(".key-import-note")).toContainText(/unlocked/i);
  await expect(page.locator(".support-pill")).toHaveText(/✦ Supporter/);
});
