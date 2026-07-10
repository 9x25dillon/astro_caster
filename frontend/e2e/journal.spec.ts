// P1 (NEXT_ARC): the Journal — reflections captured beside their readings,
// persisted locally, exported as markdown.
import { expect, test, openChapter } from "./helpers";
import type { Page } from "@playwright/test";

const ENTRY = {
  seed: "e2e-journal-seed",
  savedAt: "2026-07-01T09:00:00.000Z",
  updatedAt: "2026-07-01T09:00:00.000Z",
  question: "Where does the current want to carry me?",
  spread: "three_card", source: "golden_dawn", lineage: "Golden Dawn / Hermetic",
  date: null, ai_source: "offline", model: null,
  report: "# ✦ ORACLE REPORT ✦\n\n## I. Kept\n\nA reading to reflect on.",
  birth: null,
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
  }, ENTRY);
}

test("a shelf reflection is kept, survives reload, and exports as markdown", async ({ page }) => {
  await page.goto("/");
  await seedShelf(page);

  await openChapter(page, "VIII");
  await page.locator(".shelf-row").click();
  await page.getByRole("button", { name: /Add a reflection/ }).click();
  await page.locator(".jr-text").fill("The current runs toward the work I keep postponing.");
  await page.getByRole("button", { name: "Keep" }).click();
  await expect(page.locator(".shelf-journal-text")).toContainText("keep postponing");

  // Survives a full reload.
  await page.reload();
  await openChapter(page, "VIII");
  await page.locator(".shelf-row").click();
  await expect(page.locator(".shelf-journal-text")).toContainText("keep postponing");

  // Exports as one markdown file, grouped under the session's question.
  const downloadP = page.waitForEvent("download");
  await page.locator(".shelf-journal-export").click();
  const dl = await downloadP;
  expect(dl.suggestedFilename()).toMatch(/^astra-journal-\d{4}-\d{2}-\d{2}\.md$/);
  const fs = await import("node:fs/promises");
  const md = await fs.readFile((await dl.path())!, "utf8");
  expect(md).toContain("Where does the current want to carry me?");
  expect(md).toContain("keep postponing");
});

test("a card's journal prompt opens a pad and the answer lands in the journal", async ({ page }) => {
  // Canned reading with a journal_prompt (offline local readings carry none).
  await page.route("**/api/tarot-reading", (route) =>
    route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({
        spread: "three_card", source: "golden_dawn",
        question: "What do I need to understand right now?",
        seed: "e2e-prompted-seed",
        signature: {
          links: [], themes: [], shadows: [], major_weights: {}, suit_bias: {},
          dominant_element: "Water", dominant_modality: "Fixed", disclaimer: "",
        },
        cards: [{
          position: "Situation",
          card: { id: "the_moon", name: "The Moon", arcana: "major", number: 18,
                  suit: null, keywords: ["dream"], element: "Water", astrology: [],
                  upright: "", reversed_meaning: "" },
          reversed: false, natal_link: null,
          meaning: "The Moon in the Situation speaks of half-lit paths.",
          activity: null,
          journal_prompt: "What am I refusing to look at directly?",
          weight_sources: [],
        }],
        interpretation: "A single card, half-lit.",
        ai_source: "offline", lessons: [], activities: [], disclaimer: "",
      }),
    })
  );

  await page.goto("/");
  await expect
    .poll(() => page.locator(".wheel-area svg text").count(), { timeout: 15_000 })
    .toBeGreaterThan(10);
  await page.locator('.dial-node[data-ch="II"]')
    .evaluate((el) => (el as HTMLElement).click());
  await page.getByRole("button", { name: "Draw", exact: true }).click();
  await page.locator(".arc-draw-btn").filter({ hasText: /^Draw$/ }).click();

  await expect(page.locator(".arc-drawn-journal")).toContainText("refusing to look at");
  await page.getByRole("button", { name: "✎ Write" }).click();
  await page.locator(".jr-text").fill("The unfinished letter in the drawer.");
  await page.getByRole("button", { name: "Keep" }).click();
  await expect(page.getByRole("button", { name: /kept/ })).toBeVisible();

  const entry = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open("astra-bookshelf"); // versionless read
        req.onsuccess = () => {
          const t = req.result.transaction("journal", "readonly");
          const g = t.objectStore("journal").get("e2e-prompted-seed|Situation");
          g.onsuccess = () => { req.result.close(); resolve(g.result ?? null); };
        };
      })
  );
  expect(entry).not.toBeNull();
  expect((entry as { text: string }).text).toContain("unfinished letter");
});
