import { test, expect, mintedTokens } from "./helpers";

// Mobile unlock path (TESTING.md §2): phone browsers have no devtools console,
// so `?entitlement=<token>` must store the token, scrub itself from the
// address bar, and defer to startup validation for bad pastes.

test("?entitlement=clear scrubs the param and lands on free tier", async ({ page }) => {
  await page.goto("/?entitlement=clear");
  await expect(page).toHaveURL("/");
  await expect(page.locator(".support-pill")).toHaveText(/Support \/ Unlock/);
  expect(
    await page.evaluate(() => localStorage.getItem("aae.entitlement"))
  ).toBeNull();
});

test("invalid token is scrubbed, then cleared by startup validation", async ({ page }) => {
  await page.goto("/?entitlement=not-a-real-token");
  await expect(page).toHaveURL("/");
  // Startup validation rejects it server-side and drops back to free.
  await expect(page.locator(".support-pill")).toHaveText(/Support \/ Unlock/, {
    timeout: 15_000,
  });
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("aae.entitlement")))
    .toBeNull();
});

test("minted token unlocks supporter chrome via the URL", async ({ page }) => {
  const { oracle } = mintedTokens();
  test.skip(!oracle, "backend venv / mint tool unavailable");

  await page.goto(`/?entitlement=${oracle}`);
  await expect(page).toHaveURL("/");
  await expect(page.locator(".support-pill")).toHaveText(/✦ Supporter/);
  expect(
    await page.evaluate(() => localStorage.getItem("aae.entitlement"))
  ).toBe(oracle);
});
