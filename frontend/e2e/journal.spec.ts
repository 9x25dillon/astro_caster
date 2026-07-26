// P1 (NEXT_ARC): the Journal — reflections captured beside their readings,
// persisted locally, exported as markdown.
import { expect, test, openChapter, seedShelf } from "./helpers";

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

test("a shelf reflection is kept, survives reload, and exports as markdown", async ({ page }) => {
  await page.goto("/");
  await seedShelf(page, ENTRY);

  await openChapter(page, "VIII");
  await page.locator(".shelf-row").click();
  // R-2: opening a session also mounts the margin's freeform pad — scope to
  // the shelf's own journal block.
  await page.locator(".shelf-journal .jr-open").click();
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
  await page.route((url) => url.pathname.endsWith("/tarot-reading"), (route) =>
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
