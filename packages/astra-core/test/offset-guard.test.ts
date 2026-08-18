// TZ-3 — the guard on a hand-entered UTC offset.
//
// The case that produced it, 2026-08-17: a Barstow, California birth
// (lng -117.1833, mean solar -7.81) was cast at tz -5.7, and then at +7. Both
// gave a complete, plausible wheel describing a different sky. `resolveOffset`
// would have said -8, but it only runs when a city is picked on the map; the
// bare offset box beside it checked nothing, with the contradicting longitude
// in the very next field.
//
// The two checks catch different mistakes and both are needed: -5.7 is caught
// because no timezone is 42 minutes off the quarter-hour grid, and +7 is caught
// because it is nine hours from this longitude's sun. Neither check alone finds
// both.
import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  checkOffsetAgainstLongitude,
  OFFSET_SOLAR_TOLERANCE_H,
} from "../src/timezone.js";

const BARSTOW_LNG = -117.1833;

test("the two offsets that actually caused this", () => {
  const a = checkOffsetAgainstLongitude(-5.7, BARSTOW_LNG);
  assert.equal(a.level, "invalid", "-5.7 is not on the quarter-hour grid");
  assert.match(a.message, /quarter-hour/);
  // Only 2.1h from solar time — the longitude check alone would have PASSED it.
  assert.ok(Math.abs(a.deltaHours) < OFFSET_SOLAR_TOLERANCE_H);

  const b = checkOffsetAgainstLongitude(7, BARSTOW_LNG);
  assert.equal(b.level, "suspect", "+7 is nine hours from this longitude's sun");
  assert.ok(Math.abs(b.deltaHours) > 9);
});

test("the offset that was actually right passes silently", () => {
  const ok = checkOffsetAgainstLongitude(-8, BARSTOW_LNG);
  assert.equal(ok.level, "ok");
  assert.equal(ok.message, "");
});

test("-7 passes, because it is a real offset for this place", () => {
  // PDT is genuinely used at this longitude — it is simply the wrong one for a
  // November birth. A longitude guard cannot know that and must not pretend to;
  // resolveOffset is what knows the date. Flagging it here would be crying wolf
  // on a correct value half the year.
  assert.equal(checkOffsetAgainstLongitude(-7, BARSTOW_LNG).level, "ok");
});

test("real places that sit far from their sun are not flagged", () => {
  // Xinjiang: China runs one zone, UTC+8, out to a solar +5. The widest
  // legitimate gap on Earth, and the reason the tolerance is 3h and not 2.
  assert.equal(checkOffsetAgainstLongitude(8, 75.0).level, "ok");
  // Galicia on summer time: UTC+2 at a solar -0.58.
  assert.equal(checkOffsetAgainstLongitude(2, -8.7).level, "ok");
  // Adak, Alaska: UTC-9 (DST) at a solar -11.8.
  assert.equal(checkOffsetAgainstLongitude(-9, -176.6).level, "ok");
  // Western Argentina: UTC-3 at a solar -4.5.
  assert.equal(checkOffsetAgainstLongitude(-3, -68.0).level, "ok");
});

test("the date line is half an hour away, not twenty-four", () => {
  // Kiritimati: UTC+14 at longitude -157.4, a solar -10.5. Compared naively
  // that is 24.5 hours and would be the loudest false positive in the file.
  const k = checkOffsetAgainstLongitude(14, -157.4);
  assert.equal(k.level, "ok");
  assert.ok(Math.abs(k.deltaHours) < 1, `wrapped delta was ${k.deltaHours}`);
});

test("quarter-hour zones are real and pass", () => {
  assert.equal(checkOffsetAgainstLongitude(5.75, 85.3).level, "ok");   // Nepal
  assert.equal(checkOffsetAgainstLongitude(5.5, 77.2).level, "ok");    // India
  assert.equal(checkOffsetAgainstLongitude(8.75, 120.0).level, "ok");  // Eucla
  assert.equal(checkOffsetAgainstLongitude(12.75, 176.5).level, "ok"); // Chatham
});

test("offsets no place uses are refused outright", () => {
  assert.equal(checkOffsetAgainstLongitude(15, 0).level, "invalid");
  assert.equal(checkOffsetAgainstLongitude(-13, 0).level, "invalid");
  assert.equal(checkOffsetAgainstLongitude(Number.NaN, 0).level, "invalid");
});

test("the suggestion snaps to the nearest real offset", () => {
  assert.match(checkOffsetAgainstLongitude(-5.7, BARSTOW_LNG).message, /UTC−5:45/);
  assert.match(checkOffsetAgainstLongitude(-8.1, BARSTOW_LNG).message, /UTC−8\b/);
});

test("the check reports what it measured, not just a verdict", () => {
  const c = checkOffsetAgainstLongitude(7, BARSTOW_LNG);
  assert.ok(Math.abs(c.solarHours - -7.8122) < 0.001);
  assert.equal(typeof c.deltaHours, "number");
});
