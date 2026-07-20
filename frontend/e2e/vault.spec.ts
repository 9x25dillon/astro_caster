// B1 (NEXT_ARC): the Vault — export all aae.* local state as one file,
// restore it after a wipe. Done-when, verbatim: "clear browser data, import
// file, everything is back."
// R-3: the vault lives in the Library (chapter VIII) now.
import { expect, test, openChapter } from "./helpers";

test("vault export → wipe → restore brings the observatory's state back", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".wheel-area svg").first()).toBeVisible();

  // Seed distinctive state across several aae.* keys.
  await page.evaluate(() => {
    localStorage.setItem("aae.profiles", JSON.stringify([{
      id: "t1", name: "Vault Test Chart", createdAt: "2026-07-08",
      birth: { year: 1879, month: 3, day: 14, hour: 11, minute: 30, second: 0,
               lat: 48.4, lng: 10.0, tz_offset: 0.67, house_system: "P",
               zodiac: "tropical", ayanamsha: 1, label: "Vault Test Chart" },
    }]));
    localStorage.setItem("aae.forecast_bookmarks", JSON.stringify(["vault-mark"]));
  });
  await page.reload();

  // Export: capture the download and keep its contents.
  await openChapter(page, "VIII");
  const downloadP = page.waitForEvent("download");
  await page.locator(".vault-export").click();
  const download = await downloadP;
  expect(download.suggestedFilename()).toMatch(/^astra-vault-\d{4}-\d{2}-\d{2}\.json$/);
  const path = await download.path();

  // Wipe: the state is gone.
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  expect(await page.evaluate(() => localStorage.getItem("aae.profiles"))).toBeNull();

  // Restore: confirm the dialog, feed the file, page reloads itself.
  await openChapter(page, "VIII");
  page.on("dialog", (d) => d.accept());
  await page.locator(".vault-import").click();
  await page.locator('.lib-vault input[type="file"]').setInputFiles(path!);
  await page.waitForURL("**/*"); // reload
  await expect
    .poll(async () => page.evaluate(() => localStorage.getItem("aae.profiles")))
    .toContain("Vault Test Chart");
  expect(await page.evaluate(() => localStorage.getItem("aae.forecast_bookmarks")))
    .toContain("vault-mark");

  // The restored profile is visible in the UI.
  await expect(page.locator(".profile-item").first()).toContainText("Vault Test Chart");
});
