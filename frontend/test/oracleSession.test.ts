// oracleSession — restoring a paid Oracle session after a page reload.
//
// The bug this exists for, measured on the production box 2026-08-28: a $5.50
// deluxe edition was purchased at 03:07:59 and the receipt sits on the ledger,
// verified and bound to one session seed — while `personal_report` generations
// EVER stood at 0. Stripe's return is a full navigation, the page reloaded
// with no Oracle session in memory, and the button that spends the claim had
// nothing to attach to.
//
// Three rules are load-bearing here, and each of them is a way to hand
// somebody the WRONG reading, which is worse than handing them none:
//
//  · scoped to the birth — never restore across charts;
//  · the local DATE is carried through verbatim, because it is folded into
//    the seed for daily spreads and the server re-derives that seed;
//  · bounded in time — "persist my session" is not "resurrect a reading from
//    three weeks ago on every launch".
import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  RESTORE_WINDOW_MS,
  pickLatestSession,
  sessionFromShelf,
} from "../src/lib/oracleSession";
import type { ShelfEntry } from "../src/lib/bookshelf";

const BIRTH = {
  year: 1987, month: 11, day: 11, hour: 13, minute: 9, second: 0,
  lat: 34.0591, lng: -117.9124, tz_offset: -8,
  house_system: "P", zodiac: "tropical", ayanamsha: 1, label: "mine",
};
const OTHER_BIRTH = { ...BIRTH, year: 1990, label: "someone else" };

const NOW = Date.parse("2026-08-28T04:00:00Z");
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

function entry(over: Partial<ShelfEntry> = {}): ShelfEntry {
  return {
    seed: "Sun:228.94#elemental_balance#a question#src:rws",
    savedAt: iso(60_000),
    updatedAt: iso(60_000),
    question: "a question",
    spread: "elemental_balance",
    source: "rws",
    lineage: "Rider–Waite–Smith",
    date: null,
    ai_source: "llm",
    model: "claude-fable-5",
    report: "A long paid reading.",
    birth: BIRTH,
    ...over,
  } as ShelfEntry;
}

// ---------------------------------------------------------------- conversion

test("a shelved row becomes the session it came from", () => {
  const s = sessionFromShelf(entry());
  assert.equal(s.oracle.seed, "Sun:228.94#elemental_balance#a question#src:rws");
  assert.equal(s.oracle.report, "A long paid reading.");
  assert.equal(s.oracle.spread, "elemental_balance");
  assert.equal(s.oracle.source, "rws");
  assert.equal(s.oracle.ai_source, "llm");
  assert.equal(s.oracle.model, "claude-fable-5");
});

test("the session's local DATE is carried through, never re-derived", () => {
  // The seed folds in the local date for daily spreads and the server
  // re-derives it. Substituting today's date would 409 a genuine session —
  // and would do it only for readings restored on a later day, which is the
  // hardest kind of bug to notice.
  const s = sessionFromShelf(entry({ spread: "daily", date: "2026-08-27" }));
  assert.equal(s.ctx.date, "2026-08-27");
});

test("a null date stays null rather than becoming today", () => {
  assert.equal(sessionFromShelf(entry({ date: null })).ctx.date, null);
});

test("the disclaimer is empty, not invented", () => {
  // A ShelfEntry does not carry it. Manufacturing plausible legal-sounding
  // copy on the client would be worse than showing none.
  assert.equal(sessionFromShelf(entry()).oracle.disclaimer, "");
});

// ------------------------------------------------------------------ the pick

test("restores the most recent session for this birth", () => {
  const picked = pickLatestSession([
    entry({ seed: "older", savedAt: iso(5 * 60_000), updatedAt: iso(5 * 60_000) }),
    entry({ seed: "newest", savedAt: iso(60_000), updatedAt: iso(60_000) }),
  ], BIRTH, NOW);
  assert.equal(picked?.oracle.seed, "newest");
});

test("the newest MATCH wins even when the list order disagrees", () => {
  // shelfList() sorts newest-first, but restoring the wrong session offers
  // the wrong claim — so the choice is made explicitly, not inherited.
  const picked = pickLatestSession([
    entry({ seed: "newest-but-another-chart", savedAt: iso(1_000), birth: OTHER_BIRTH }),
    entry({ seed: "older-but-mine", savedAt: iso(9 * 60_000) }),
  ], BIRTH, NOW);
  assert.equal(picked?.oracle.seed, "older-but-mine");
});

test("never restores another chart's reading", () => {
  assert.equal(pickLatestSession([entry({ birth: OTHER_BIRTH })], BIRTH, NOW), null);
});

test("an unattributable session (no birth recorded) is not claimed", () => {
  // Sessions shelved before birth was stored carry null. Guessing that they
  // belong to whoever is looking is exactly the wrong instinct.
  assert.equal(pickLatestSession([entry({ birth: null })], BIRTH, NOW), null);
});

test("with no chart loaded, nothing is restored", () => {
  assert.equal(pickLatestSession([entry()], null, NOW), null);
  assert.equal(pickLatestSession([entry()], undefined, NOW), null);
});

test("a session older than the window is left in the Library", () => {
  const old = entry({ savedAt: iso(RESTORE_WINDOW_MS + 60_000) });
  assert.equal(pickLatestSession([old], BIRTH, NOW), null);
});

test("a session just inside the window is restored", () => {
  const fresh = entry({ seed: "just-inside", savedAt: iso(RESTORE_WINDOW_MS - 60_000) });
  assert.equal(pickLatestSession([fresh], BIRTH, NOW)?.oracle.seed, "just-inside");
});

test("an empty or unparseable row is skipped, not restored blank", () => {
  assert.equal(pickLatestSession([entry({ report: "   " })], BIRTH, NOW), null);
  assert.equal(pickLatestSession([entry({ savedAt: "not-a-date" })], BIRTH, NOW), null);
});

test("an empty shelf restores nothing", () => {
  assert.equal(pickLatestSession([], BIRTH, NOW), null);
});
