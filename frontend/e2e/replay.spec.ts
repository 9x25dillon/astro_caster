import { test, expect } from "./helpers";

/**
 * The replay guardrail.
 *
 * Asking the same question of the same chart at the same tier must return the
 * SAME reading, not a second different one. For a divination product that is a
 * correctness property, not a cache: two answers to one question contradict
 * each other, and the reader has no way to tell which they were meant to have.
 *
 * THE PROVIDER IS STUBBED, deliberately. A real ai-ask-stream is provider-backed
 * and nondeterministic in the test environment, and it would also make "the same
 * text came back" a weak assertion — identical output could mean replay worked or
 * merely that the model repeated itself. The stub numbers every generation, so
 * identical text can only mean the second generation never happened, and the
 * call tally is asserted alongside it.
 *
 * These specs cover the default (local) half — the one every reader gets. The
 * opt-in server half is pinned in backend/tests/test_replay.py, where the
 * consent contract and the ownership scoping live.
 */

const ASK = "input[placeholder*='Ask']";
const READING = ".interp";
const REPLAYED = ".engine-note--replayed";

function sse(text: string): string {
  return (
    `event: meta\ndata: ${JSON.stringify({ provider: "openai", model: "stub-1" })}\n\n` +
    `event: chunk\ndata: ${JSON.stringify(text)}\n\n` +
    `event: done\ndata: ${JSON.stringify({ source: "llm", provider: "openai", model: "stub-1" })}\n\n`
  );
}

/**
 * Stub the ask path with a reading that differs every call. Returns the tally.
 *
 * The globs deliberately omit the version segment: the API is served under
 * `/api/v1/…`, so an `api/ai-ask-stream` pattern silently matches nothing and
 * every ask sails through to the real provider — which presents as a broken
 * test rather than a broken stub. Registered once per test; Playwright routes
 * survive navigation, so a reload keeps them.
 */
async function stubProvider(page: import("@playwright/test").Page) {
  const calls: string[] = [];
  let n = 0;
  const body = () => {
    n += 1;
    return `Generation number ${n}. ` + "The chart speaks in its own time. ".repeat(6);
  };
  await page.route("**/ai-ask-stream*", async (route) => {
    calls.push(route.request().url());
    await route.fulfill({
      status: 200,
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
      body: sse(body()),
    });
  });
  // The store falls back to the non-streaming endpoint if the stream throws;
  // stub it too so a fallback can never quietly reach the real provider.
  await page.route("**/ai-ask", async (route) => {
    calls.push(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        interpretation: body(), source: "llm", provider: "openai", model: "stub-1",
      }),
    });
  });
  return calls;
}

async function submit(page: import("@playwright/test").Page, q: string) {
  await page.locator(ASK).first().fill(q);
  await page.getByRole("button", { name: /^Ask$/ }).first().click();
}

/**
 * Ask and wait for the Nth GENERATION specifically.
 *
 * Waiting on "the reading is non-empty" would pass instantly against the
 * PREVIOUS reading still on screen, and then read stale text — which is exactly
 * how the first cut of this file reported a replay that had not happened.
 */
async function askFresh(page: import("@playwright/test").Page, q: string, n: number) {
  await submit(page, q);
  await expect(page.locator(READING).first())
    .toContainText(`Generation number ${n}.`, { timeout: 20_000 });
  return page.locator(READING).first().innerText();
}

/** Ask and wait for the replay marker — the only signal that distinguishes a
 *  remembered reading from the identical text already on screen. */
async function askReplayed(page: import("@playwright/test").Page, q: string) {
  await submit(page, q);
  await expect(page.locator(REPLAYED)).toBeVisible({ timeout: 20_000 });
  return page.locator(READING).first().innerText();
}

async function land(page: import("@playwright/test").Page) {
  await page.goto("/");
  await expect
    .poll(() => page.locator(".wheel-area svg text").count(), { timeout: 20_000 })
    .toBeGreaterThan(10);
}

test("the same question of the same chart returns the same reading", async ({ page }) => {
  const calls = await stubProvider(page);
  await land(page);

  const first = await askFresh(page, "What does Saturn ask of me?", 1);
  expect(calls.length).toBe(1);

  await page.locator(ASK).first().fill("");
  const second = await askReplayed(page, "What does Saturn ask of me?");

  // The stub would have said "Generation number 2" had it been called.
  expect(second).toBe(first);
  expect(calls.length).toBe(1);
});

test("a replayed reading says that it is one", async ({ page }) => {
  await stubProvider(page);
  await land(page);

  await askFresh(page, "What does my Moon want?", 1);
  await page.locator(ASK).first().fill("");
  await askReplayed(page, "What does my Moon want?");

  const note = page.locator(".engine-note");
  await expect(note).toHaveClass(/engine-note--replayed/);
  await expect(note).toContainText(/asked this before/i);
});

test("casing and spacing do not defeat the guardrail", async ({ page }) => {
  const calls = await stubProvider(page);
  await land(page);

  await askFresh(page, "What is my chart telling me?", 1);
  expect(calls.length).toBe(1);

  await page.locator(ASK).first().fill("");
  await askReplayed(page, "  WHAT IS MY  CHART TELLING ME?  ");
  expect(calls.length).toBe(1);
});

test("a different question is genuinely generated", async ({ page }) => {
  const calls = await stubProvider(page);
  await land(page);

  const a = await askFresh(page, "What does Saturn ask of me?", 1);
  await page.locator(ASK).first().fill("");
  const b = await askFresh(page, "What does Venus ask of me?", 2);

  expect(calls.length).toBe(2);
  expect(b).not.toBe(a);
  await expect(page.locator(REPLAYED)).toHaveCount(0);
});

test("the store survives a reload", async ({ page }) => {
  const calls = await stubProvider(page);
  await land(page);
  const first = await askFresh(page, "What is the shape of this year?", 1);
  expect(calls.length).toBe(1);

  await land(page);

  const again = await askReplayed(page, "What is the shape of this year?");
  // A guardrail that forgets on reload isn't one — the shelf and the journal
  // both persist, and a reading the reader was given should too.
  expect(calls.length).toBe(1);
  expect(again).toBe(first);
});
