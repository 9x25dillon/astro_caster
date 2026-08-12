// The regression the A1 generative harness caught on its first run: sidereal
// whole-sign cusps were the TROPICAL sign boundaries shifted into the
// sidereal frame — i.e. mid-sign, off by the ayanamsha mod 30 (~5° in 2000).
// swe snaps whole-sign cusps in the frame of the chart; so do we now. The
// backend (pyswisseph swe_houses_ex with the sidereal flag) is the reference:
// every cusp lands on a multiple of 30° in the chart's own zodiac, starting
// from the sign holding the sidereal Ascendant.
import assert from "node:assert/strict";
import { test } from "node:test";

import { calculateChart } from "../src/index.js";
import { initSwisseph } from "../src/swisseph.js";

await initSwisseph();

const base = {
  year: 2000, month: 6, day: 15, hour: 12, minute: 0, second: 0,
  lat: 43.0, lng: 0.0, tz_offset: 0.0,
};

test("sidereal whole-sign cusps snap to sidereal sign boundaries", () => {
  const chart = calculateChart({ ...base, house_system: "W", zodiac: "sidereal" } as any);
  for (const h of chart.houses) {
    const off = Math.min(h.longitude % 30, 30 - (h.longitude % 30));
    assert.ok(off < 1e-9, `cusp ${h.index} not on a sign boundary: ${h.longitude}`);
  }
  const asc = chart.angles.ascendant;
  assert.equal(
    chart.houses[0].longitude,
    Math.floor(asc / 30) * 30,
    "house 1 must start at the sidereal Ascendant's sign"
  );
});

test("tropical whole-sign cusps still snap (control)", () => {
  const chart = calculateChart({ ...base, house_system: "W", zodiac: "tropical" } as any);
  for (const h of chart.houses) {
    const off = Math.min(h.longitude % 30, 30 - (h.longitude % 30));
    assert.ok(off < 1e-9, `cusp ${h.index} not on a sign boundary: ${h.longitude}`);
  }
});

test("sidereal quadrant systems keep the shifted-tropical identity", () => {
  // Placidus is angle-anchored — shifting frames must not move cusps
  // relative to the angles. Asc must still sit exactly on cusp 1.
  const chart = calculateChart({ ...base, house_system: "P", zodiac: "sidereal" } as any);
  const d = Math.abs(chart.houses[0].longitude - chart.angles.ascendant);
  assert.ok(Math.min(d, 360 - d) < 1e-6, "sidereal Placidus cusp 1 ≠ Asc");
});
