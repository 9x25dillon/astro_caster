// The rounding mode is part of the parity spec, not an implementation detail.
//
// Python's round() is round-half-to-EVEN; JS Math.round is round-half-UP
// (toward +Infinity). Every rounded field in the chart response inherited that
// mismatch, and it stayed invisible for a long time because a tie costs only
// 1e-6 — far inside the 0.01° tolerance those fields are held to.
// `meta.julian_day` is the one field compared as an equality check (1e-6), so
// that is where A1's generative harness caught it: seed 31559911369, case
// 1845, a JD of exactly 2451711.0078125 that Python formats as ...007812 and
// JS's toFixed formats as ...007813.
//
// RESONARIUM_PARITY.md Constraint 1 already recorded the same dependency for
// orbs ("a reproduction using half-away-from-zero diverges on the exact-half
// cases"). These tests exist so a future refactor back to Math.round — which
// looks like a harmless simplification — fails loudly instead of silently
// re-opening a cross-engine divergence.
import assert from "node:assert/strict";
import { test } from "node:test";

import { calculateChart } from "../src/index.js";
import { initSwisseph } from "../src/swisseph.js";

await initSwisseph();

test("julian_day formats half-to-even, matching the Python backend", () => {
  // The exact case A1 found. 12:11:15 UTC on 2000-06-15 is JD
  // 2451711.0078125 — an exact binary value whose 7th decimal is a tie.
  const chart = calculateChart({
    year: 2000, month: 6, day: 15, hour: 12, minute: 11, second: 15,
    lat: -58.0, lng: 0.0, tz_offset: 0.0,
  } as any);
  assert.equal(
    chart.meta.julian_day,
    "2451711.007812",
    "half-to-even keeps the even digit; Math.round/toFixed would give ...007813"
  );
  // Guard the premise rather than assume it: if this ever stops being a tie,
  // the test above stops testing anything.
  assert.equal(
    (2451711.0078125).toFixed(6),
    "2451711.007813",
    "premise: raw toFixed rounds this tie the other way"
  );
});

test("a NEAR-tie is not treated as a tie", () => {
  // The regression the first attempt at this fix introduced, and the reason
  // the tie test reads the decimal expansion instead of doing arithmetic on
  // it. JD 2451710.5140625000931 is a double sitting just ABOVE the tie, so
  // correct rounding takes it UP — but scaling by 1e6 first rounds the product
  // to exactly …0625e6, manufacturing a tie that is not there and sending it
  // DOWN. That turned one divergence into five across the same 2000 cases.
  const chart = calculateChart({
    year: 2000, month: 6, day: 15, hour: 12, minute: 5, second: 15,
    lat: 16.0, lng: 0.0, tz_offset: 11.75,
  } as any);
  assert.equal(
    chart.meta.julian_day,
    "2451710.514063",
    "just above the tie must round UP — scaling first would give ...514062"
  );
  // The trap itself, asserted so it stays legible: the SCALED product lands on
  // exactly .5 while the true value does not, which is why the tie test must
  // read the decimal expansion rather than compute with it.
  const jd = 2451710.5140625000931;
  assert.equal((jd * 1e6) % 1, 0.5, "scaling manufactures an exact tie");
  assert.equal(
    jd.toFixed(20).slice(-14),
    "50009313225746",
    "…while the exact expansion is clearly above the tie"
  );
});
