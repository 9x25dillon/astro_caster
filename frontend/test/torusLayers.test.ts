// The astrology of a product of two circles.
//
// Everything here rests on one rule — arity decides geometry. A single
// longitude is a CIRCLE on each axis; an arc partition is a GRID; a per-body
// property is a STRIPE FIELD along one axis; a pair relation is a DIAGONAL.
// The tests worth writing are the ones where getting it wrong would teach a
// reader something false, and the sharpest of those is the natal layer, because
// it claims to be the same object as the SOUND.
import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  dignityAt,
  dignityBands,
  elementOfSignIndex,
  houseLines,
  jointStrength,
  natalCrossings,
  natalLines,
  nodeCrossings,
  signLines,
  starLines,
} from "../src/lib/torusLayers";
import { droneHz } from "../src/lib/resonance";

const el = (e: string) => e;

// ── signs ───────────────────────────────────────────────────────────────────

test("the elements cycle fire-earth-air-water and land on the right signs", () => {
  assert.equal(elementOfSignIndex(0), "Fire");   // Aries
  assert.equal(elementOfSignIndex(1), "Earth");  // Taurus
  assert.equal(elementOfSignIndex(4), "Fire");   // Leo
  assert.equal(elementOfSignIndex(11), "Water"); // Pisces
});

test("twelve sign lines, on the cusps, cardinals heavier", () => {
  const ls = signLines("theta", el);
  assert.equal(ls.length, 12);
  assert.deepEqual(ls.map((l) => l.lon), [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]);
  // 0° Aries / Cancer / Libra / Capricorn carry the equinox-solstice frame.
  assert.deepEqual(ls.filter((l) => l.weight === 1).map((l) => l.lon), [0, 90, 180, 270]);
});

// ── dignity: a field along ONE axis ─────────────────────────────────────────

test("dignity varies with longitude alone — that is what makes it an axis", () => {
  // The Sun rules Leo and falls in Libra. If dignity depended on the PAIR it
  // could not be drawn as a stripe field, and the whole layer scheme collapses.
  assert.equal(dignityAt("Sun", 125), "Domicile");    // 5° Leo
  assert.equal(dignityAt("Sun", 190), "Fall");        // 10° Libra
  assert.equal(dignityAt("Sun", 5), "Exaltation");    // 5° Aries
});

test("a body outside the classical scheme gets twelve FLAT bands, not none", () => {
  // Empty would render as "no data" and read as a bug. Twelve neutral bands
  // read as what is true: traditional dignity has nothing to say about Chiron.
  const bands = dignityBands("Chiron");
  assert.equal(bands.length, 12);
  assert.ok(bands.every((b) => b.strength === 0));
});

test("dignity bands tile the whole circle without gap or overlap", () => {
  const bands = dignityBands("Venus");
  assert.equal(bands.length, 12);
  bands.forEach((b, i) => {
    assert.equal(b.from, i * 30);
    assert.equal(b.to, i * 30 + 30);
  });
  assert.equal(bands[11].to, 360);
});

test("joint strength is the MEAN, so exalted-plus-fallen reads as tension", () => {
  // A sum would flatten +1 and −1 into the same 0 a pair of neutrals gives, and
  // the most interesting cell on the terrain would look like the dullest.
  const sunDom = 125;   // Leo
  const sunFall = 190;  // Libra
  assert.equal(jointStrength("Sun", "Sun", sunDom, sunDom), 1);
  assert.equal(jointStrength("Sun", "Sun", sunFall, sunFall), -1);
  assert.equal(jointStrength("Sun", "Sun", sunDom, sunFall), 0);
  // …but it is reachable from a genuinely neutral cell only by coincidence of
  // value, never of meaning — the bands themselves still differ.
  assert.notDeepEqual(
    [dignityAt("Sun", sunDom), dignityAt("Sun", sunFall)],
    ["Neutral", "Neutral"],
  );
});

// ── the natal field: the layer that IS the sound ────────────────────────────

const NATAL = [
  { id: "Sun", longitude: 228.94 },
  { id: "Moon", longitude: 141.02 },
];

test("each natal body draws four circles: its own degree and its opposition, on both axes", () => {
  const ls = natalLines(NATAL, () => "#fff");
  assert.equal(ls.length, NATAL.length * 4);
  const sunTheta = ls.filter((l) => l.axis === "theta" && l.label.startsWith("Sun"));
  assert.deepEqual(sunTheta.map((l) => l.lon).sort((a, b) => a - b), [48.94, 228.94]);
});

test("THE CLAIM: a natal line is exactly where the drones stop beating", () => {
  // The layer is only worth drawing if it is the same object as the sound.
  // Under the bedrock map f(λ) = 110·2^(λ/180), two drones beat at |f_A − f_B|,
  // which is zero exactly when the longitudes meet. So crossing a natal
  // meridian on this surface IS a zero-beat, not a picture of one.
  for (const p of NATAL) {
    const natalF = droneHz(p.longitude);
    const line = natalLines([p], () => "#fff").find((l) => l.axis === "theta")!;
    assert.equal(Math.abs(droneHz(line.lon) - natalF), 0);
  }
});

test("THE SECOND LOCK: the opposition line is exactly one octave, which is why it is drawn", () => {
  // 180° is an octave under this map, so opposition is a true 2:1 — the only
  // other rational ratio the map admits, and the reason the opposition earns
  // lines while the square and trine do not.
  for (const p of NATAL) {
    const f = droneHz(p.longitude);
    const opp = droneHz((p.longitude + 180) % 360);
    const ratio = Math.max(f, opp) / Math.min(f, opp);
    assert.ok(Math.abs(ratio - 2) < 1e-9, `ratio ${ratio} should be exactly 2`);
  }
});

test("the aspects that DON'T ring are irrational — the reason they get a bell", () => {
  // Square, trine, sextile: 2^½, 2^⅔, 2^⅓. No low-order harmonic lock, nothing
  // to hear, so drawing them as natal lines would promise a sound that never
  // comes. This pins the arithmetic that decision rests on.
  const base = 100;
  const f0 = droneHz(base);
  for (const [aspect, deg, expected] of [
    ["square", 90, Math.SQRT2],
    ["trine", 120, Math.pow(2, 2 / 3)],
    ["sextile", 60, Math.pow(2, 1 / 3)],
  ] as const) {
    const r = droneHz(base + deg) / f0;
    assert.ok(Math.abs(r - expected) < 1e-9, `${aspect} ratio ${r}`);
    // …and none of them is a simple ratio: no p/q with q ≤ 6 comes close.
    let simple = false;
    for (let q = 1; q <= 6; q++) {
      for (let p = q; p <= 6 * q; p++) {
        if (Math.abs(r - p / q) < 1e-6) simple = true;
      }
    }
    assert.equal(simple, false, `${aspect} should have no low-order lock`);
  }
});

test("node crossings are the lattice of both bodies locked at once", () => {
  const xs = nodeCrossings(NATAL);
  // 2 bodies × 2 (self + opposition) on each axis → (2·2)² = 16.
  assert.equal(xs.length, 16);
  assert.ok(xs.some((c) => c.theta === 228.94 && c.phi === 141.02));
  // Every crossing is a double zero-beat by construction.
  const natalHz = new Set(NATAL.flatMap((p) => [
    droneHz(p.longitude), droneHz((p.longitude + 180) % 360),
  ]));
  for (const c of xs) {
    assert.ok(natalHz.has(droneHz(c.theta)));
    assert.ok(natalHz.has(droneHz(c.phi)));
  }
});

test("without oppositions the lattice is exactly the conjunction grid", () => {
  assert.equal(nodeCrossings(NATAL, false).length, 4);
  assert.equal(natalLines(NATAL, () => "#fff", false).length, 4);
});

// ── the crossings the sweep actually hits ───────────────────────────────────

/** A body walking steadily through the zodiac, one degree a day. */
function walk(fromA: number, fromB: number, days: number, rateA = 1, rateB = 13) {
  return Array.from({ length: days }, (_, i) => ({
    jd: 2460000 + i,
    lonA: (fromA + rateA * i) % 360,
    lonB: (fromB + rateB * i) % 360,
  }));
}

test("a transiting body arriving on a natal degree is found once, not once per sample", () => {
  // Proximity would report a slow body dozens of times while it dawdles inside
  // an orb, and miss a fast one entirely between samples. A sign change in the
  // separation reports the arrival exactly once, at the instant.
  const samples = walk(100, 0, 40, 1, 0);
  const xs = natalCrossings(samples, [{ id: "Mars", longitude: 120 }], false);
  const aHits = xs.filter((x) => x.body === "A");
  assert.equal(aHits.length, 1);
  assert.equal(aHits[0].natal, "Mars");
  assert.ok(Math.abs(aHits[0].lonA - 120) < 1.5);
});

test("the wrap at the far side of the circle is NOT a crossing", () => {
  // Separation flips sign at ±180° without the body going near the natal
  // degree. Counting that would invent a transit on the opposite side of the sky.
  const samples = walk(0, 0, 300, 1, 0);
  const xs = natalCrossings(samples, [{ id: "X", longitude: 0 }], false);
  // In 300 days at 1°/day starting AT 0°, body A meets 0° again only after 360.
  assert.equal(xs.filter((x) => x.body === "A").length, 0);
});

test("both bodies are swept — the field is a comb and there are two probes", () => {
  const samples = walk(100, 100, 40, 1, 3);
  const xs = natalCrossings(samples, [{ id: "Sun", longitude: 130 }], false);
  assert.ok(xs.some((x) => x.body === "A"));
  assert.ok(xs.some((x) => x.body === "B"));
});

test("oppositions are reported and LABELLED as such — a different lock", () => {
  // Unison and octave are both real locks under this map, and they do not
  // sound alike: one is a zero beat between fundamentals, the other between a
  // 2nd harmonic and a fundamental. Marking them identically would teach that
  // they are the same event.
  const samples = walk(100, 0, 120, 1, 0);
  const xs = natalCrossings(samples, [{ id: "Moon", longitude: 300 }], true);
  const opp = xs.filter((x) => x.opposition && x.body === "A");
  assert.equal(opp.length, 1);
  assert.ok(Math.abs(opp[0].natalLon - 120) < 1e-9);
  assert.equal(xs.some((x) => !x.opposition && x.body === "A"), false);
});

test("crossings come back in time order, whatever order the bodies were given", () => {
  const samples = walk(0, 0, 200, 1, 2);
  const xs = natalCrossings(samples, [
    { id: "Late", longitude: 150 }, { id: "Early", longitude: 20 },
  ]);
  for (let i = 1; i < xs.length; i++) assert.ok(xs[i].jd >= xs[i - 1].jd);
});

test("an empty or single-sample trajectory yields nothing rather than throwing", () => {
  assert.deepEqual(natalCrossings([], [{ id: "X", longitude: 10 }]), []);
  assert.deepEqual(
    natalCrossings([{ jd: 1, lonA: 10, lonB: 20 }], [{ id: "X", longitude: 10 }]),
    [],
  );
});

// ── houses and stars ────────────────────────────────────────────────────────

test("house cusps are drawn UNEQUAL, because away from the equator they are", () => {
  // A house layer that quietly drew twelve even arcs would teach a falsehood on
  // exactly the charts where houses matter most.
  const cusps = [
    { index: 1, longitude: 12 }, { index: 2, longitude: 51 },
    { index: 3, longitude: 74 }, { index: 4, longitude: 96 },
  ];
  const ls = houseLines(cusps, "theta", "#888");
  assert.deepEqual(ls.map((l) => l.lon), [12, 51, 74, 96]);
  const gaps = ls.slice(1).map((l, i) => l.lon - ls[i].lon);
  assert.ok(new Set(gaps).size > 1, "cusps were forced onto an even grid");
  // The angles are the frame, not four more cusps.
  assert.equal(ls.find((l) => l.label === "H1")!.weight, 1);
  assert.equal(ls.find((l) => l.label === "H2")!.weight, 0.5);
});

test("a star contacting several bodies is still ONE thread", () => {
  const hits = [
    { star: "Regulus", star_longitude: 150.1 },
    { star: "Regulus", star_longitude: 150.1 },
    { star: "Spica", star_longitude: 204.3 },
  ];
  const ls = starLines(hits, "#9ab");
  // Two stars, two axes each — not three.
  assert.equal(ls.length, 4);
  assert.equal(new Set(ls.map((l) => l.label)).size, 2);
});

test("an in-range longitude survives normalisation BIT-EXACT", () => {
  // The trap this file walked into. `((x % 360) + 360) % 360` is not the same
  // function as `x % 360` fixed up only when negative: for a value already in
  // range the trip through +360 costs a ulp, and 228.94 comes back as
  // 228.94000000000005. Three tests failed on it at once.
  //
  // It is not cosmetic. A longitude folds into the session seed rounded to
  // 0.01°, so a ulp is enough to round the other way — the same class of drift
  // that moved 28.8% of measured charts across an ephemeris change.
  for (const lon of [0, 0.01, 141.02, 228.94, 359.99]) {
    const l = natalLines([{ id: "X", longitude: lon }], () => "#fff", false);
    assert.equal(l[0].lon, lon, `${lon} did not survive normalisation`);
    const h = houseLines([{ index: 1, longitude: lon }], "theta", "#fff");
    assert.equal(h[0].lon, lon);
    const st = starLines([{ star: "S", star_longitude: lon }], "#fff");
    assert.equal(st[0].lon, lon);
    assert.ok(nodeCrossings([{ id: "X", longitude: lon }], false)
      .some((c) => c.theta === lon && c.phi === lon));
  }
});

test("negative and out-of-range longitudes normalise rather than escaping", () => {
  const ls = natalLines([{ id: "X", longitude: -30 }], () => "#fff", false);
  assert.ok(ls.every((l) => l.lon >= 0 && l.lon < 360));
  assert.equal(ls[0].lon, 330);
  const st = starLines([{ star: "S", star_longitude: 725 }], "#fff");
  assert.equal(st[0].lon, 5);
});
