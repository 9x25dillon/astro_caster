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
  await expect(page.locator(".key-import-btn")).toContainText(/Import key/i);
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
