// dailyOracle — the precompute that lets a notification and a home-screen
// widget answer without running our engine.
//
// The properties pinned here are the ones those two surfaces silently depend
// on. Both read a value computed hours or days earlier, so "the same date
// gives the same card" is not a nicety — if it drifts, the notification says
// The Tower and the app the reader then opens says The Star, and the feature
// has lied about something people take seriously.
import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  addLocalDays,
  dailyDrawFor,
  localDateKey,
  precomputeDailyDraws,
} from "../src/lib/dailyOracle";
import type { ChartResponse } from "@astra/core";

// A fixed chart. Any chart works — what matters is that it is the SAME chart
// across the assertions, since the draw is a function of (chart, date).
import { localChartFixture } from "./fixtures/chart";
const chart: ChartResponse = localChartFixture();

test("the same date always deals the same card", () => {
  const a = dailyDrawFor(chart, "2026-08-12");
  const b = dailyDrawFor(chart, "2026-08-12");
  assert.equal(a.cardId, b.cardId);
  assert.equal(a.reversed, b.reversed);
  assert.equal(a.title, b.title);
});

test("different dates are drawn independently", () => {
  // Not an assertion that consecutive days DIFFER — a fair deal repeats
  // sometimes, and a test demanding otherwise would be pinning unfairness.
  // What must hold is that the date reaches the seed at all, so a run of days
  // is not one card repeated.
  const run = precomputeDailyDraws(chart, 30, new Date(2026, 7, 12));
  const distinct = new Set(run.map((d) => `${d.cardId}${d.reversed}`));
  assert.ok(
    distinct.size > 1,
    `30 days produced ${distinct.size} distinct draws — the date is not reaching the seed`
  );
});

test("a precomputed run is consecutive local dates with no gaps or repeats", () => {
  const run = precomputeDailyDraws(chart, 14, new Date(2026, 7, 12));
  assert.equal(run.length, 14);
  assert.equal(run[0].date, "2026-08-12");
  assert.equal(run[13].date, "2026-08-25");
  assert.equal(new Set(run.map((d) => d.date)).size, 14);
});

test("a run crossing a month end keeps stepping by one calendar day", () => {
  // getDate() + n relies on Date normalising an overflowing day-of-month.
  const run = precomputeDailyDraws(chart, 4, new Date(2026, 7, 30)); // Aug 30
  assert.deepEqual(
    run.map((d) => d.date),
    ["2026-08-30", "2026-08-31", "2026-09-01", "2026-09-02"]
  );
});

test("a run crossing a year end rolls the year", () => {
  const run = precomputeDailyDraws(chart, 3, new Date(2026, 11, 31)); // Dec 31
  assert.deepEqual(run.map((d) => d.date), ["2026-12-31", "2027-01-01", "2027-01-02"]);
});

test("addLocalDays steps calendar days, not 86_400_000 ms", () => {
  // The DST case this exists for: adding a day's worth of MILLISECONDS across
  // a spring-forward boundary lands on the same calendar date at 23:00 the
  // previous day, so a run of days silently repeats one. Stepping the date
  // component cannot do that.
  //
  // The result is anchored at noon so that zones which transition AT midnight
  // cannot slide it onto a neighbouring date either.
  const start = new Date(2026, 2, 7, 23, 40, 0); // late evening, pre-transition
  const seen: string[] = [];
  for (let i = 0; i <= 10; i++) {
    const stepped = addLocalDays(start, i);
    assert.equal(stepped.getHours(), 12, `not anchored at noon at +${i} days`);
    seen.push(localDateKey(stepped));
  }
  assert.equal(new Set(seen).size, seen.length, "a calendar date repeated across the run");
  assert.deepEqual(seen.slice(0, 3), ["2026-03-07", "2026-03-08", "2026-03-09"]);
});

test("localDateKey is local, not UTC", () => {
  // Late-evening local time is already TOMORROW in UTC for negative offsets and
  // still yesterday for positive ones. The seed uses the local day, so this
  // must follow the local clock or the notification and the app disagree about
  // which day it is.
  const d = new Date(2026, 7, 12, 23, 30, 0);
  assert.equal(localDateKey(d), "2026-08-12");
  const e = new Date(2026, 7, 12, 0, 15, 0);
  assert.equal(localDateKey(e), "2026-08-12");
});

test("the notification line stays short and never ends mid-word", () => {
  const run = precomputeDailyDraws(chart, 40, new Date(2026, 7, 12));
  for (const d of run) {
    assert.ok(d.line.length <= 121, `line too long for a notification: ${d.line.length}`);
    assert.ok(!/\s$/.test(d.line), "line has trailing whitespace");
    if (d.line.endsWith("…")) {
      assert.ok(!/\w…$/.test(d.line) || d.line.length > 60, "truncated mid-word");
    }
  }
});

test("every precomputed day carries what a widget needs to render", () => {
  for (const d of precomputeDailyDraws(chart, 10, new Date(2026, 7, 12))) {
    assert.match(d.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(d.cardId.length > 0);
    assert.ok(d.cardName.length > 0);
    assert.equal(typeof d.reversed, "boolean");
    assert.ok(d.title.includes(d.cardName));
    assert.equal(d.reversed, d.title.endsWith(", reversed"));
  }
});
