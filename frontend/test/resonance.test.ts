// resonance — the bridge between the torus (geometry) and the resonarium
// (sound), and the lock that keeps it from drifting.
//
// The load-bearing claim of the Torus tab's audio is arithmetic, not taste:
// the resonarium's bedrock map is 110·2^(λ/180), one octave per 180°, i.e.
// exactly 20/3 cents per degree — so the interval between two bodies' drones
// is 2^(Δ/180) and EVERY classical aspect lands on an exact multiple of 200
// cents. The major-aspect family is the whole-tone scale. If that stops being
// true, the feature is decoration, so it is pinned here rather than asserted
// in a comment.
//
// The other half is a drift lock. lib/resonance.droneHz deliberately MIRRORS
// the per-element body of the engine's bedrockFrequencies rather than editing
// the engine to expose it (the engine is parity-locked against natal_seed.py
// by parity/resonarium-seed.json, and the standing instruction is to prefer a
// new consumer over an edit). A mirror can drift, so the first test drives a
// REAL chart through both paths and demands they agree exactly.
import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  bedrockFrequencies,
  mulberry32,
  personalSoundtrack,
  seedChartFromResponse,
} from "@astra/core";
import {
  bellDecaySeconds,
  bellHz,
  beatHz,
  CANONICAL_LONGITUDE_KEYS,
  CENTS_PER_DEGREE,
  centsBetween,
  droneHz,
  harmonicFor,
  natalDroneHz,
  natalDroneIndex,
  participatesInSeed,
  SEED_KEY_BY_TORUS_BODY,
} from "../src/lib/resonance";
import { localChartFixture } from "./fixtures/chart";

// ---------------------------------------------------------------------------
// The drift lock
// ---------------------------------------------------------------------------

test("droneHz reproduces the engine's bedrock_hz element-for-element", () => {
  const chart = localChartFixture();
  const seed = seedChartFromResponse(chart);
  const spec = personalSoundtrack(chart);

  // bedrock_hz is COMPACTED — only keys actually present are emitted — so the
  // comparison has to replay the same presence filter, which is exactly the
  // discipline natalDroneIndex exists to enforce.
  const present = CANONICAL_LONGITUDE_KEYS.filter((k) => k in seed);
  assert.equal(spec.bedrock_hz.length, present.length);
  assert.ok(present.length >= 12, "fixture should carry a full-ish body set");

  present.forEach((k, i) => {
    assert.equal(
      droneHz(seed[k] as number),
      spec.bedrock_hz[i],
      `drone for ${k} drifted from the engine's bedrock_hz[${i}]`
    );
  });
});

test("droneHz agrees with bedrockFrequencies on adversarial longitudes", () => {
  // Negative, >360, and exact-boundary values: the places a mirrored modulo
  // goes wrong. The engine uses Python's %, not ((x%360)+360)%360, because the
  // latter loses a ulp on in-range values — this pins that the mirror does too.
  const lons = [0, -0, 360, -360, 179.999999, 180, 180.000001, -0.000001,
                359.9999999, 720.5, -540.25, 1e-9, 45.123456789];
  const chart: Record<string, number> = {};
  lons.forEach((l, i) => { chart[CANONICAL_LONGITUDE_KEYS[i % 14]] = l; });
  const keys = CANONICAL_LONGITUDE_KEYS.filter((k) => k in chart);
  const engine = bedrockFrequencies(chart);
  keys.forEach((k, i) => {
    assert.equal(droneHz(chart[k]), engine[i], `mirror drifted at ${k}=${chart[k]}`);
  });
});

// ---------------------------------------------------------------------------
// The arithmetic the feature rests on
// ---------------------------------------------------------------------------

test("the bedrock map is exactly 20/3 cents per degree", () => {
  assert.equal(CENTS_PER_DEGREE, 20 / 3);
  assert.equal(centsBetween(180, 0), 1200); // one octave per half circle
  assert.equal(centsBetween(0, 180), -1200);
});

test("every classical aspect is an exact multiple of 200 cents", () => {
  const table: Array<[string, number, number]> = [
    ["conjunction", 0, 0],
    ["semisextile", 30, 200],
    ["sextile", 60, 400],
    ["square", 90, 600],
    ["trine", 120, 800],
    ["quincunx", 150, 1000],
    ["opposition", 180, 1200],
  ];
  for (const [name, deg, cents] of table) {
    assert.ok(
      Math.abs(centsBetween(deg, 0) - cents) < 1e-9,
      `${name} should sound ${cents}¢`
    );
    // and the ratio, read off the actual drones rather than the formula
    const ratio = droneHz(deg) / droneHz(0);
    assert.ok(
      Math.abs(1200 * Math.log2(ratio) - cents) < 1e-9,
      `${name}'s drones should be ${cents}¢ apart`
    );
  }
  // the two rational ones, exactly
  assert.equal(droneHz(0) / droneHz(0), 1);
  assert.ok(Math.abs(droneHz(180) / droneHz(0) - 2) < 1e-12);
});

test("exact aspects stay on the 200¢ grid from anywhere in the zodiac", () => {
  // The algebra says this; 100k randomized pairs say it about the code. A
  // seeded PRNG so a failure is reproducible, not a coin flip.
  const rand = mulberry32(0x5eed1234);
  const steps = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
  let worst = 0;
  for (let i = 0; i < 100000; i++) {
    const a = rand() * 360;
    const k = steps[Math.floor(rand() * steps.length)];
    const c = centsBetween(a + k, a);
    const off = Math.abs(c % 200);
    worst = Math.max(worst, Math.min(off, 200 - off));
  }
  assert.ok(worst < 1e-9, `worst deviation from the 200¢ grid was ${worst}¢`);
});

test("the map never reaches its own safety clamp over a zodiac", () => {
  // [110, 440) — the clamp at [20, 18000] is real but unreachable here, so the
  // drone is continuous across the whole circle with no flat spot.
  assert.equal(droneHz(0), 110);
  assert.ok(Math.abs(droneHz(180) - 220) < 1e-12);
  for (let d = 0; d < 360; d += 0.25) {
    const hz = droneHz(d);
    assert.ok(hz >= 110 && hz < 440, `${d}° sounded ${hz} Hz`);
  }
});

test("measuring an aspect the long way inverts the interval class", () => {
  // 360° is 2400¢, so the map is periodic over TWO octaves. A trine measured
  // as 240° gives 1600¢ = an octave + 400¢ — the same interval class as 800¢
  // inverted (minor sixth ↔ major third). The claim survives either reading.
  const short = centsBetween(120, 0);
  const long = centsBetween(240, 0);
  assert.ok(Math.abs(short - 800) < 1e-9);
  assert.ok(Math.abs(long - 1600) < 1e-9);
  assert.ok(Math.abs((short % 1200) + (long % 1200) - 1200) < 1e-9, "inversions");
});

test("the beat collapses to zero at conjunction and is widest at opposition", () => {
  assert.equal(beatHz(droneHz(100), droneHz(100)), 0);
  // at opposition |fA − fB| is not a beat at all: it is the lower frequency
  const lo = droneHz(0);
  assert.ok(Math.abs(beatHz(droneHz(180), lo) - lo) < 1e-9);
  // and the audible-beat window really does narrow up the zodiac
  const near0 = beatHz(droneHz(10), droneHz(0));
  const near350 = beatHz(droneHz(360), droneHz(350));
  assert.ok(near350 > near0 * 3, "the exponential map narrows the beat window");
});

// ---------------------------------------------------------------------------
// Body ↔ seed-key mapping — the compaction trap
// ---------------------------------------------------------------------------

test("North Node is the true node, and Lilith has no seed key at all", () => {
  assert.equal(SEED_KEY_BY_TORUS_BODY["North Node"], "true_node");
  assert.equal(SEED_KEY_BY_TORUS_BODY.Lilith, undefined);
  assert.equal(participatesInSeed("North Node"), true);
  assert.equal(participatesInSeed("Lilith"), false);
});

test("asc and mc hold indices 10 and 11, so the node and Chiron are 12 and 13", () => {
  const all = new Set<string>(CANONICAL_LONGITUDE_KEYS);
  assert.equal(natalDroneIndex("Pluto", all), 9);
  assert.equal(natalDroneIndex("North Node", all), 12);
  assert.equal(natalDroneIndex("Chiron", all), 13);
  // the naive zip — node at 10, Chiron at 11 — is exactly the bug this prevents
  assert.notEqual(natalDroneIndex("North Node", all), 10);
});

test("a missing body shifts every later index, and the map follows", () => {
  // client.localPairTrajectory warns Chiron can be absent under Moshier; the
  // engine COMPACTS rather than padding, so a hardcoded index would sound the
  // wrong planet. Drop an early key and watch the tail move.
  const noPluto = new Set<string>(CANONICAL_LONGITUDE_KEYS);
  noPluto.delete("pluto");
  assert.equal(natalDroneIndex("Pluto", noPluto), null);
  assert.equal(natalDroneIndex("North Node", noPluto), 11);
  assert.equal(natalDroneIndex("Chiron", noPluto), 12);

  const noChiron = new Set<string>(CANONICAL_LONGITUDE_KEYS);
  noChiron.delete("chiron");
  assert.equal(natalDroneIndex("North Node", noChiron), 12);
  assert.equal(natalDroneIndex("Chiron", noChiron), null);
});

test("natalDroneHz returns the engine's own value for every torus body", () => {
  const chart = localChartFixture();
  const seed = seedChartFromResponse(chart);
  const spec = personalSoundtrack(chart);
  const present = new Set(Object.keys(seed));

  for (const [body, key] of Object.entries(SEED_KEY_BY_TORUS_BODY)) {
    const hz = natalDroneHz(body, spec.bedrock_hz, present);
    if (!present.has(key)) { assert.equal(hz, null); continue; }
    assert.equal(hz, droneHz(seed[key] as number), `${body} resolved to the wrong drone`);
  }
  // Lilith is selectable on the torus but sounds no natal tone.
  assert.equal(natalDroneHz("Lilith", spec.bedrock_hz, present), null);
});

test("natalDroneHz refuses an index past the end of a short bedrock_hz", () => {
  const present = new Set<string>(CANONICAL_LONGITUDE_KEYS);
  assert.equal(natalDroneHz("Chiron", [110, 220], present), null);
});

// ---------------------------------------------------------------------------
// Aspects as harmonics — the bell
// ---------------------------------------------------------------------------

test("harmonicFor collapses the aspect table to one roots-of-unity condition", () => {
  const expected: Array<[number, number]> = [
    [0, 1], [180, 2], [120, 3], [90, 4], [72, 5], [60, 6],
    [45, 8], [135, 8], [30, 12], [150, 12],
  ];
  for (const [angle, n] of expected) {
    assert.equal(harmonicFor(angle), n, `${angle}° should be harmonic ${n}`);
  }
});

test("the bell rings at the aspect's own place on the circle", () => {
  // Not a sample and not an arbitrary note: the aspect ANGLE through the same
  // bedrock map, two octaves up.
  assert.equal(bellHz(0), 440);
  assert.ok(Math.abs(bellHz(180) - 880) < 1e-9);
  assert.ok(bellHz(90) > bellHz(0) && bellHz(90) < bellHz(120));
  // structural aspects toll, fine-grained minors tick
  assert.ok(bellDecaySeconds(0) > bellDecaySeconds(30));
  for (const a of [0, 30, 60, 90, 120, 150, 180]) {
    const d = bellDecaySeconds(a);
    assert.ok(d >= 0.25 && d <= 2.0, `${a}° decay ${d}s out of range`);
  }
});
