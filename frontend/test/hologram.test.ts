// hologram — the treatment, and the two claims underneath it.
//
//   1. THE FLICKER IS SAFE, and safe by arithmetic rather than by taste.
//      Photosensitive-epilepsy guidance (WCAG 2.3.1 / Harding) puts the danger
//      above three general flashes per second at more than ~10% of maximum
//      luminance. Both bounds are asserted here by measuring the actual
//      waveform — counting its zero crossings and its peak-to-peak swing —
//      rather than by reading the constants back to themselves.
//
//   2. THE UNDERLAY IS ALIGNED. The whole argument for putting a torus behind
//      the wheel is that a natal body's meridian points out of the centre at
//      exactly the degree the wheel marks it. That is one line of trigonometry
//      with two sign conventions in it (SVG's y-down, and the projection's own
//      negation), so it is pinned against lonToAngle rather than trusted.
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { SEAL_ORDER } from "../src/lib/alchemy";
import { lonToAngle } from "../src/lib/astro";
import { DOUBLES, letterForBody } from "../src/lib/hebrew";
import { embedDonut, project, type Camera } from "../src/lib/torus";
import { torusTheta } from "../src/components/ChartHologram";
import {
  CHANNEL_A,
  CHANNEL_B,
  FLICKER_DEPTH,
  FLICKER_HZ,
  MAX_SPLIT_PX,
  SCANLINE_PITCH,
  SPLIT_SATURATION_HZ,
  chromaticSplit,
  depthFade,
  flicker,
  scanlinePhase,
  splitPasses,
} from "../src/lib/hologram";

// ── 1. The flicker is inside the safety envelope ────────────────────────────

test("the flicker waveform stays under 3 flashes/second and 10% swing", () => {
  // Sample sixty seconds at 1 kHz and MEASURE, rather than restating constants.
  // Sixty rather than four because the two components are incommensurable: they
  // only align in the limit, so a short window measures a swing meaningfully
  // under budget (0.0596 at 4s) and a centre meaningfully off 1. Both converge —
  // and spread over Math.min(...v), so the window also cannot grow much further
  // without blowing the argument stack.
  const seconds = 60;
  const N = seconds * 1000;
  const dt = 1 / 1000;
  const v: number[] = [];
  for (let i = 0; i < N; i++) v.push(flicker(i * dt));

  let lo = Infinity;
  let hi = -Infinity;
  for (const x of v) { if (x < lo) lo = x; if (x > hi) hi = x; }
  // Bounded BY the budget — under is the safe direction and is what happens.
  assert.ok(hi - lo <= FLICKER_DEPTH + 1e-12, `swing ${hi - lo} exceeded the budget`);
  assert.ok(hi - lo > FLICKER_DEPTH * 0.9, `swing ${hi - lo} collapsed — is it still flickering?`);
  assert.ok(hi - lo < 0.10, `swing ${hi - lo} is at or past the WCAG threshold`);
  assert.ok(Math.abs((hi + lo) / 2 - 1) < 1e-5, "the envelope must centre on 1");

  // Rate: count upward zero crossings of the centred signal. A "flash" needs a
  // full cycle, so crossings/duration is the flash rate.
  let crossings = 0;
  for (let i = 1; i < N; i++) {
    if (v[i - 1] - 1 <= 0 && v[i] - 1 > 0) crossings++;
  }
  const hz = crossings / seconds;
  assert.ok(hz <= 3, `${hz} flashes/second is at or past the WCAG limit of 3`);
  assert.ok(hz <= FLICKER_HZ + 0.2, `${hz} Hz drifted above the declared ${FLICKER_HZ}`);
});

test("reduced motion removes the flicker entirely rather than slowing it", () => {
  for (const t of [0, 0.1, 0.5, 1, 7.3, 100]) {
    assert.equal(flicker(t, true), 1, `t=${t}`);
    assert.equal(scanlinePhase(t, true), 0, `t=${t}`);
  }
  assert.notEqual(flicker(0.21), flicker(0.42));
});

test("the scanline field drifts within exactly one pitch", () => {
  for (const t of [0, 0.3, 1, 9.75]) {
    const p = scanlinePhase(t);
    assert.ok(p >= 0 && p < SCANLINE_PITCH, `phase ${p} left the pitch`);
  }
});

// ── The fringe is the data ──────────────────────────────────────────────────

test("chromatic split is zero at a zero-beat and saturates at the audible edge", () => {
  // A conjunction is where two drones stop beating, so it is the one place the
  // channels converge and the mark resolves. That is the whole reason the split
  // is driven by the beat rather than by a constant.
  assert.equal(chromaticSplit(0), 0);
  assert.ok(Math.abs(chromaticSplit(SPLIT_SATURATION_HZ) - MAX_SPLIT_PX) < 1e-12);
  assert.equal(chromaticSplit(SPLIT_SATURATION_HZ * 4), MAX_SPLIT_PX);
  assert.equal(chromaticSplit(-3), chromaticSplit(3));

  let prev = -1;
  for (let hz = 0; hz <= SPLIT_SATURATION_HZ; hz += 0.25) {
    const d = chromaticSplit(hz);
    assert.ok(d >= prev, `split fell back at ${hz} Hz`);
    assert.ok(d <= MAX_SPLIT_PX + 1e-12);
    prev = d;
  }
});

test("an exact conjunction draws one sharp mark, a wide one draws three", () => {
  const sharp = splitPasses(0, 0, "#e0c578");
  assert.equal(sharp.length, 1);
  assert.equal(sharp[0].dx, 0);
  assert.equal(sharp[0].dy, 0);

  const split = splitPasses(SPLIT_SATURATION_HZ, 0, "#e0c578");
  assert.equal(split.length, 3);
  assert.equal(split[0].color, CHANNEL_A);
  assert.equal(split[1].color, CHANNEL_B);
  assert.equal(split[2].color, "#e0c578");
  assert.ok(Math.abs(split[0].dx + split[1].dx) < 1e-12);
  assert.ok(Math.abs(split[0].dy + split[1].dy) < 1e-12);
  assert.equal(split[2].dx, 0);
  // separation is aimed: at angle 0 it is purely horizontal
  assert.ok(Math.abs(split[1].dx - MAX_SPLIT_PX) < 1e-12);
  assert.ok(Math.abs(split[1].dy) < 1e-12);
  const up = splitPasses(SPLIT_SATURATION_HZ, Math.PI / 2, "#e0c578");
  assert.ok(Math.abs(up[1].dx) < 1e-9);
  assert.ok(Math.abs(up[1].dy - MAX_SPLIT_PX) < 1e-12);
});

test("depth fades toward a floor rather than to nothing", () => {
  assert.ok(depthFade(-99) >= 0.22 - 1e-12);
  assert.ok(depthFade(99) <= 1 + 1e-12);
  assert.ok(depthFade(2) > depthFade(-2));
});

// ── 2. The underlay is aligned with the wheel ───────────────────────────────

const flat: Camera = { rotXDeg: 0, rotYDeg: 0, dist: 7, scale: 100 };

/** Where the projected torus puts a θ, as an SVG screen angle. */
function holoAngle(theta: number): number {
  const p = project(embedDonut(theta, 0), flat);
  return Math.atan2(p.y, p.x);
}

const wrapPi = (a: number) => {
  let r = a;
  while (r <= -Math.PI) r += 2 * Math.PI;
  while (r > Math.PI) r -= 2 * Math.PI;
  return r;
};

test("a natal meridian lands at the exact screen angle the wheel marks", () => {
  for (const asc of [0, 37.5, 180, 271.9, 359.4]) {
    for (const lon of [0, 15, 90, 123.456, 180, 270, 359.99]) {
      const wheel = lonToAngle(lon, asc);
      const holo = holoAngle(torusTheta(lon, asc));
      assert.ok(
        Math.abs(wrapPi(wheel - holo)) < 1e-12,
        `asc ${asc}, lon ${lon}: wheel ${wheel} vs underlay ${holo}`,
      );
    }
  }
});

test("the Ascendant sits at 9 o'clock in both layers, and stays there under pitch", () => {
  const asc = 118.3;
  assert.ok(Math.abs(wrapPi(lonToAngle(asc, asc) - Math.PI)) < 1e-12);
  assert.ok(Math.abs(wrapPi(holoAngle(torusTheta(asc, asc)) - Math.PI)) < 1e-12);

  // The component tilts the camera, which compresses the ring vertically — but
  // the Asc/Desc axis lies on y = 0, so a pitch about x cannot move it. The
  // chart's most important axis is the one that stays exactly aligned.
  const tilted: Camera = { ...flat, rotXDeg: -24 };
  for (const lon of [asc, asc + 180]) {
    const p = project(embedDonut(torusTheta(lon, asc), 0), tilted);
    assert.ok(Math.abs(p.y) < 1e-12, `pitch moved the ${lon === asc ? "Asc" : "Desc"}`);
  }
});

// ── The seal ring was already the seven doubles ─────────────────────────────

test("SEAL_ORDER and the seven doubles are the same order, index for index", () => {
  // The wheel's central seal draws the seven classical metals in descending
  // Chaldean order; the Sefer Yetzirah walks its seven doubles in that same
  // order. So the letter for the metal at index i is simply DOUBLES[i] — the
  // ring was already the doubles, and this asserts it instead of assuming it.
  assert.equal(SEAL_ORDER.length, 7);
  assert.equal(DOUBLES.length, 7);
  SEAL_ORDER.forEach((id, i) => {
    const hit = letterForBody(id, "yetzirah");
    assert.ok(hit, `${id} has no double`);
    assert.equal(hit.letter.name, DOUBLES[i].name, `index ${i}: ${id}`);
    assert.equal(hit.traditional, true);
  });
  assert.deepEqual([...SEAL_ORDER],
    ["Saturn", "Jupiter", "Mars", "Sun", "Venus", "Mercury", "Moon"]);
});
