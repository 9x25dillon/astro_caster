import { test, expect, openChapter } from "./helpers";

// A paid Oracle session survives a page RELOAD.
//
// The bug, measured on the production box 2026-08-28: a $5.50 deluxe edition
// was purchased at 03:07:59 — receipt on the ledger, verified, bound to one
// session seed — and `personal_report` generations EVER stood at 0. Stripe's
// return is a full navigation, so the page reloaded with no Oracle session in
// memory and the button that spends the claim had nothing to attach to.
//
// The session was never lost: it shelves itself to the Library the moment it
// is generated. This drives the real mechanism by seeding that Library and
// reloading — no Oracle generation, so the test costs nothing and needs no
// entitlement.
const isApiCall = (url: URL) => url.pathname.startsWith("/api/");

/** Write one session into the app's own Bookshelf DB, as a generation would. */
async function shelveSession(
  page: import("@playwright/test").Page,
  entry: Record<string, unknown>,
) {
  await page.evaluate(async (e) => {
    const db: IDBDatabase = await new Promise((res, rej) => {
      // Version omitted: open whatever the app already created, so this test
      // never races the schema forward and never has to track DB_VERSION.
      const r = indexedDB.open("astra-bookshelf");
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    await new Promise((res, rej) => {
      const tx = db.transaction("sessions", "readwrite");
      tx.objectStore("sessions").put(e);
      tx.oncomplete = () => res(null);
      tx.onerror = () => rej(tx.error);
    });
    db.close();
  }, entry);
}

test("an Oracle session is restored after a full page reload", async ({ page }) => {
  // The API is NOT severed here: the store persists `aae.last_chart` only
  // after a successful server cast, and that record is what attributes a
  // shelved session to this chart. Blocking it would leave nothing to attach
  // the session to and the test would skip itself into uselessness.
  await page.goto("/");
  await expect
    .poll(() => page.locator(".wheel-area svg").first().locator("text").count(), { timeout: 15_000 })
    .toBeGreaterThan(10);

  // The birth the app actually booted with — read, never guessed, because a
  // session is restored only when its birth MATCHES.
  const birth = await page.evaluate(async () => {
    for (let i = 0; i < 60; i++) {
      try {
        const raw = localStorage.getItem("aae.last_chart");
        if (raw) return JSON.parse(raw).birth;
      } catch { return null; }
      await new Promise((r) => setTimeout(r, 250));
    }
    return null;
  });
  expect(birth, "the app must persist its cast chart for this to be testable").toBeTruthy();

  const REPORT = "The Oracle speaks: this reading was restored from the Library.";
  await shelveSession(page, {
    seed: "e2e-restored-session",
    savedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    question: "does my reading survive a reload",
    spread: "elemental_balance",
    source: "rws",
    lineage: "Rider–Waite–Smith",
    date: null,
    ai_source: "llm",
    model: "claude-fable-5",
    report: REPORT,
    birth,
  });

  // The reload is the whole point: this is what returning from Stripe does.
  await page.reload();
  await expect
    .poll(() => page.locator(".wheel-area svg").first().locator("text").count(), { timeout: 15_000 })
    .toBeGreaterThan(10);
  await openChapter(page, "II");
  // The Oracle lives on the Draw tab. Asserting without opening it would pass
  // for the wrong reason in the negative case below, so both tests go here.
  await page.getByRole("button", { name: "Draw", exact: true }).first().click();

  const oracle = page.locator(".arc-oracle-report");
  await expect(oracle).toContainText("restored from the Library", { timeout: 15_000 });
  // And it says so, rather than a paid reading reappearing unexplained.
  await expect(oracle).toContainText(/Restored from your Library/i);
});

test("a session belonging to another chart is never restored", async ({ page, context }) => {
  // The rule that makes restoring safe at all: handing someone the wrong
  // reading — and with it the wrong deluxe claim — is worse than none.
  await context.route(isApiCall, (route) => route.abort());
  await page.goto("/");
  await expect
    .poll(() => page.locator(".wheel-area svg").first().locator("text").count(), { timeout: 15_000 })
    .toBeGreaterThan(10);

  await shelveSession(page, {
    seed: "e2e-foreign-session",
    savedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    question: "someone else's question",
    spread: "three_card",
    source: "golden_dawn",
    lineage: "Golden Dawn",
    date: null,
    ai_source: "llm",
    model: "claude-fable-5",
    report: "A reading belonging to a different sky entirely.",
    birth: {
      year: 1901, month: 2, day: 3, hour: 4, minute: 5, second: 0,
      lat: 51.5, lng: -0.12, tz_offset: 0,
      house_system: "P", zodiac: "tropical", ayanamsha: 1, label: "not mine",
    },
  });

  await page.reload();
  await expect
    .poll(() => page.locator(".wheel-area svg").first().locator("text").count(), { timeout: 15_000 })
    .toBeGreaterThan(10);
  await openChapter(page, "II");

  await expect(page.locator(".arcana-modal")).toBeVisible();
  await page.getByRole("button", { name: "Draw", exact: true }).first().click();
  // Proof the assertion can actually fail: the Oracle surface IS on screen —
  // its "Generate Oracle Report" offer renders — and no restored report sits
  // in it.
  await expect(page.locator(".arc-oracle")).toBeVisible();
  await expect(page.locator(".arc-oracle-report")).toHaveCount(0);
});
