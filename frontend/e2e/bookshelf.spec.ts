// B2 (NEXT_ARC): the Bookshelf. Done-when, verbatim: "a report generated
// last month can be reopened and reprinted offline."
import { expect, test, mintedTokens, openChapter } from "./helpers";
import type { Page } from "@playwright/test";

// A month-old shelved session with a deluxe edition attached. Birth data is
// the Greenwich default so the offline re-cast is cheap and deterministic.
const OLD_ENTRY = {
  seed: "e2e-shelf-seed-0001",
  savedAt: "2026-06-08T12:00:00.000Z",
  updatedAt: "2026-06-08T12:05:00.000Z",
  question: "What did last month ask of me?",
  spread: "three_card",
  source: "golden_dawn",
  lineage: "Golden Dawn / Hermetic",
  date: null,
  ai_source: "offline",
  model: null,
  report: "# ✦ ORACLE REPORT ✦\n\n## I. The Signature\n\nA month-old reading, kept.",
  birth: { year: 2000, month: 1, day: 1, hour: 12, minute: 0, second: 0,
           lat: 51.4826, lng: 0.0, tz_offset: 0, house_system: "P",
           zodiac: "tropical", ayanamsha: 1, label: "Shelf Test" },
  personal: {
    report_markdown: "# ✦ ASTRA ARCANA PERSONAL REPORT ✦\n\n{{SIGIL}}\n\n{{BIRTH_INFO}}\n\n# I. Kept\n\nThe deluxe edition, shelved.",
    short_seed: "abcdef012345",
    oracle_date: "2026-06-08",
    ai_source: "offline",
    model: null,
    spread: "three_card",
  },
};

async function seedShelf(page: Page) {
  await page.evaluate(async (entry) => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("astra-bookshelf", 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("sessions")) db.createObjectStore("sessions", { keyPath: "seed" });
        if (!db.objectStoreNames.contains("journal")) {
          const j = db.createObjectStore("journal", { keyPath: "id" });
          j.createIndex("seed", "seed", { unique: false });
        }
      };
      req.onsuccess = () => {
        const t = req.result.transaction("sessions", "readwrite");
        t.objectStore("sessions").put(entry);
        t.oncomplete = () => { req.result.close(); resolve(); };
        t.onerror = () => reject(t.error);
      };
      req.onerror = () => reject(req.error);
    });
  }, OLD_ENTRY);
}

test("a shelved month-old report reopens and reprints offline", async ({ page, context }) => {
  await page.goto("/");
  await seedShelf(page);
  // Offline from here: the shelf, the reopen, and the reprint's chart
  // re-cast + plate re-deal are all on-device.
  await context.route((url) => url.pathname.startsWith("/api/"), (r) => r.abort());

  await openChapter(page, "VIII");
  const row = page.locator(".shelf-item");
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("What did last month ask of me?");
  await expect(row.locator(".chip.gilt")).toContainText("deluxe");

  // Reopen: the stored Oracle text renders.
  await row.locator(".shelf-row").click();
  await expect(page.locator(".shelf-body")).toContainText("A month-old reading, kept");

  // Reprint: the tome window opens with the plates page, computed on-device.
  const popupP = page.waitForEvent("popup");
  await page.getByRole("button", { name: /Reprint tome/ }).click();
  const popup = await popupP;
  await expect(popup.locator("h1", { hasText: "Plates — The Spread" })).toBeVisible({ timeout: 20_000 });
  await expect(popup.locator(".tarot-card").first()).toBeVisible();
  await popup.close();

  // Burn: entry removed.
  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: /Burn/ }).click();
  await expect(page.locator(".shelf-item")).toHaveCount(0);
});

test("a generated Oracle Report shelves itself", async ({ page }) => {
  test.setTimeout(60_000); // mobile emulation under full-suite load is slow
  const { oracle } = mintedTokens();
  test.skip(!oracle, "no oracle token minted");

  // Serve a canned Oracle response — the test is about the auto-save hook,
  // not the AI layer.
  await page.route("**/api/oracle-report", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        spread: "three_card", source: "golden_dawn",
        question: "What do I need to understand right now?",
        seed: "e2e-autosave-seed", lineage: "Golden Dawn / Hermetic",
        report: "# ✦ ORACLE REPORT ✦\n\n## I. Auto-saved\n\nShelved on arrival.",
        ai_source: "offline", model: null, disclaimer: "mirror, not verdict",
      }),
    })
  );

  await page.addInitScript((tok) => localStorage.setItem("aae.entitlement", tok), oracle!);
  await page.goto("/");
  // Let the initial cast settle so the masthead layout is stable (mobile).
  await expect
    .poll(() => page.locator(".wheel-area svg text").count(), { timeout: 15_000 })
    .toBeGreaterThan(10);
  // Programmatic open: with an oracle token the masthead gains the Admin
  // link, which on the Pixel-7 layout leaves the Arcana pill outside the
  // scrollable viewport. The human click path is covered by
  // arcana-offline.spec — this test is about the auto-save hook.
  await page.locator('.dial-node[data-ch="II"]')
    .evaluate((el) => (el as HTMLElement).click());
  const drawTab = page.getByRole("button", { name: "Draw", exact: true });
  await drawTab.scrollIntoViewIfNeeded();
  await drawTab.click();
  const genBtn = page.getByRole("button", { name: /Generate Oracle Report/ });
  await genBtn.scrollIntoViewIfNeeded();
  await genBtn.click();
  await expect(page.locator(".arcana-modal, .arc-modal").first()).toContainText("Auto-saved", { timeout: 15_000 });

  // The shelf write is fire-and-forget — poll until the put commits.
  const readShelf = () =>
    page.evaluate(
      () =>
        new Promise((resolve) => {
          const req = indexedDB.open("astra-bookshelf"); // versionless read
          req.onsuccess = () => {
            const t = req.result.transaction("sessions", "readonly");
            const g = t.objectStore("sessions").get("e2e-autosave-seed");
            g.onsuccess = () => { req.result.close(); resolve(g.result ?? null); };
            g.onerror = () => { req.result.close(); resolve(null); };
          };
          req.onerror = () => resolve(null);
        })
    );
  await expect.poll(readShelf, { timeout: 10_000 }).not.toBeNull();
  const shelved = await readShelf();
  expect((shelved as { question: string }).question).toContain("understand right now");
});
