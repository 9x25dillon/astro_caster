// TZ-2 — historical offset resolution.
//
// These cases exist because the bug they close was silent: `CeremonyModal`
// defaulted `tz_offset` to -5 and, on geolocate, set it from the BROWSER'S
// CURRENT offset — today's DST state, not the DST state at the birth moment.
// A July birth in New York entered in January was cast an hour wrong, and the
// chart looked perfectly plausible. Nothing errored; the wheel just quietly
// described a different sky.
//
// Every case below is a date where "the offset now" and "the offset then"
// disagree — which is exactly the class the old code got wrong.
import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  firstTransition,
  resolveOffset,
  zoneOffsetMsAt,
  type WallClock,
} from "../src/timezone.js";

const at = (year: number, month: number, day: number, hour = 12, minute = 0): WallClock =>
  ({ year, month, day, hour, minute });

test("a zone's own history is followed, not its modern rule", () => {
  // Nepal moved to +05:45 in 1986. A 1985 birth must not get the modern rule —
  // only a real historical rule set can tell these apart, which is why this
  // module reads the platform's tzdb through Intl instead of shipping a table.
  assert.equal(resolveOffset(at(1985, 1, 1), "Asia/Kathmandu", 85.3).hours, 5.5);
  assert.equal(resolveOffset(at(2000, 1, 1), "Asia/Kathmandu", 85.3).hours, 5.75);
});

test("summer and winter births in the same zone differ by the DST rule of their own year", () => {
  assert.equal(resolveOffset(at(1979, 7, 4), "America/New_York", -74).hours, -4);
  assert.equal(resolveOffset(at(1979, 1, 4), "America/New_York", -74).hours, -5);
});

test("a doubled hour resolves to the first occurrence and says so", () => {
  // 2024-11-03 01:30 happens twice in New York.
  const r = resolveOffset(at(2024, 11, 3, 1, 30), "America/New_York", -74);
  assert.equal(r.ambiguity, "fold");
  assert.equal(r.hours, -4, "the earlier occurrence is the larger offset");
  assert.match(r.note ?? "", /happened twice/);
});

test("an hour that never existed is moved forward, not invented", () => {
  // 2024-03-10 02:30 does not occur in New York — the clocks jump 02:00 → 03:00.
  const r = resolveOffset(at(2024, 3, 10, 2, 30), "America/New_York", -74);
  assert.equal(r.ambiguity, "gap");
  assert.equal(r.hours, -5);
  assert.match(r.note ?? "", /never occurred/);
});

test("wartime rules are honoured", () => {
  // Germany ran double summer time during WWII.
  assert.equal(resolveOffset(at(1940, 6, 1), "Europe/Berlin", 13.4).hours, 2);
});

test("a birth predating standard time falls back to local mean time", () => {
  // Einstein, Ulm, 1879-03-14 11:30 — the fixture used across this repo. Germany
  // had no standard time until 1893, so the honest answer is LMT for the
  // birthplace's own longitude, which is where the repo's `tz 0.67` comes from.
  const r = resolveOffset(at(1879, 3, 14, 11, 30), "Europe/Berlin", 9.9876);
  assert.equal(r.kind, "lmt");
  assert.ok(Math.abs(r.hours - 0.666) < 0.01, `expected ~0.666, got ${r.hours}`);
  assert.match(r.note ?? "", /predates standard time/);
  // TZ-1b: the zone's own offset is offered as the one-tap alternative.
  assert.equal(typeof r.zoneAlternativeHours, "number");
});

test("an ordinary modern birth resolves cleanly with no disclosure", () => {
  const r = resolveOffset(at(2000, 6, 15, 9, 0), "Europe/London", -0.13);
  assert.equal(r.kind, "zone");
  assert.equal(r.ambiguity, "none");
  assert.equal(r.note, undefined, "no note means nothing surprising happened");
  assert.equal(r.hours, 1); // BST
});

test("the resolved instant round-trips to the wall clock it came from", () => {
  // The offset is only meaningful if applying it returns the original reading.
  for (const [zone, wc] of [
    ["America/New_York", at(1979, 7, 4, 12, 0)],
    ["Asia/Kathmandu", at(1985, 1, 1, 12, 0)],
    ["Australia/Sydney", at(2010, 12, 25, 6, 30)],
  ] as const) {
    const r = resolveOffset(wc, zone, 0);
    const back = new Date(r.utcMs + r.hours * 3_600_000);
    assert.equal(back.getUTCHours(), wc.hour, `${zone} hour`);
    assert.equal(back.getUTCMinutes(), wc.minute, `${zone} minute`);
  }
});

test("resolution is deterministic — the same input always gives the same offset", () => {
  const once = resolveOffset(at(1979, 7, 4), "America/New_York", -74);
  for (let i = 0; i < 5; i++) {
    const again = resolveOffset(at(1979, 7, 4), "America/New_York", -74);
    assert.equal(again.hours, once.hours);
    assert.equal(again.utcMs, once.utcMs);
  }
});

// --- probe drift ------------------------------------------------------------
// These two exist because the bug they close survived a full test suite. The
// resolver was correct for every modern date, so all 46 cases above passed
// while `firstTransition` was wrong by YEARS — and firstTransition is what
// decides whether a birth predates standard time and should fall back to local
// mean time. A silent 2.6-year window of wrong offsets is exactly the failure
// mode this file's header warns about.

test("zoneOffsetMsAt returns whole seconds even for a probe carrying milliseconds", () => {
  // Intl.formatToParts reports the wall clock truncated to seconds. Subtracting
  // an instant that still carries milliseconds yields a fractional-second
  // "offset" — e.g. -17762001ms where the real offset is -17762000ms. Offsets
  // in tzdb only ever change on whole seconds, so a remainder is always a bug.
  for (const zone of ["America/New_York", "Europe/Dublin", "Asia/Kathmandu"]) {
    for (const extra of [1, 7, 999]) {
      const off = zoneOffsetMsAt(Date.UTC(1880, 0, 1) + extra, zone);
      // `===` not assert.equal: a negative offset gives `-0`, and strict
      // assert compares with Object.is, which says -0 !== 0. The value is a
      // whole second; only the sign of zero differs.
      assert.ok(off % 1000 === 0, `${zone} offset ${off} is not a whole second`);
    }
  }
});

test("firstTransition finds the true end of local mean time, not an early false hit", () => {
  // firstTransition binary-searches for the first instant whose offset differs
  // from the LMT offset. With fractional offsets the equality predicate flipped
  // while still inside the LMT era and the search converged early: New York
  // came out 1881-04-02 instead of 1883-11-18, US Standard Time Day.
  const day = (zone: string): string => {
    const t = firstTransition(zone);
    assert.ok(t !== null, `${zone} should have a transition`);
    return new Date(t as number).toISOString().slice(0, 10);
  };
  assert.equal(day("America/New_York"), "1883-11-18");
  assert.equal(day("America/Los_Angeles"), "1883-11-18");
});
