// Vectors are generated from the Python reference (resonarium/natal_seed.py,
// via backend/tools/gen_parity_vectors.py). The match contract is per-layer,
// read from the file itself: seed layer, PRNG, seed-chart mapping and
// binaural compare with === (mt19937 discipline); bedrock_hz compares within
// the file's stated abs tolerance, because 110*2**(lon/180) goes through libm
// pow and transcendentals are not bit-identical across substrates — the same
// boundary resonarium/tests/test_biosentinel.py draws. If this file fails,
// one of the three implementations moved without its siblings.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  ChartValidationError,
  bedrockFrequencies,
  binauralConfig,
  canonicalizeChart,
  deriveNatalSeed,
  mulberry32,
  personalSoundtrack,
  seedChartFromResponse,
  seedLower32,
  seedToHex,
  type SeedChart,
  type SoundtrackSource,
} from "../src/resonarium.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const payload = JSON.parse(
  readFileSync(path.join(here, "../../../parity/resonarium-seed.json"), "utf8")
);

assert.equal(payload.schema, "astra-parity/resonarium-seed@1");

const BEDROCK_ABS_TOL: number = payload.match.bedrock_hz.abs_tol;
assert.ok(BEDROCK_ABS_TOL > 0 && BEDROCK_ABS_TOL <= 1e-9);

function assertBedrockClose(got: readonly number[], want: number[]) {
  assert.equal(got.length, want.length);
  for (let i = 0; i < want.length; i++) {
    assert.ok(
      Math.abs(got[i] - want[i]) <= BEDROCK_ABS_TOL,
      `bedrock[${i}]: ${got[i]} vs ${want[i]}`,
    );
  }
}

for (const kase of payload.cases) {
  test(`resonarium seed: ${kase.id}`, () => {
    const chart = kase.chart as SeedChart;
    assert.equal(canonicalizeChart(chart), kase.canonical);
    const seed = deriveNatalSeed(chart, kase.intention);
    assert.equal(seedToHex(seed), kase.seed_hex);
    assert.equal(seedLower32(seed), kase.seed32);
    assertBedrockClose(bedrockFrequencies(chart), kase.bedrock_hz);
    assert.deepEqual({ ...binauralConfig(chart) }, kase.binaural);
    const rand = mulberry32(kase.seed32);
    assert.deepEqual(kase.prng.map(() => rand()), kase.prng);
  });
}

for (const kase of payload.adapter_cases) {
  test(`resonarium adapter: ${kase.id}`, () => {
    const source = kase.chart_response as SoundtrackSource;
    const sc = seedChartFromResponse(source);
    assert.deepEqual(sc, kase.seed_chart);
    assert.equal(canonicalizeChart(sc), kase.canonical);
    assert.equal(seedToHex(deriveNatalSeed(sc, "")), kase.seed_hex);
    assertBedrockClose(bedrockFrequencies(sc), kase.bedrock_hz);
    assert.deepEqual({ ...binauralConfig(sc) }, kase.binaural);

    // The composite the app calls: one hop from engine chart to tonal field.
    const spec = personalSoundtrack(source);
    assert.equal(spec.seed_hex, kase.seed_hex);
    assert.equal(spec.seed32, seedLower32(deriveNatalSeed(sc, "")));
    assertBedrockClose(spec.bedrock_hz, kase.bedrock_hz);
    assert.deepEqual({ ...spec.binaural }, kase.binaural);
  });
}

test("resonarium: validation refuses what the reference refuses", () => {
  assert.throws(() => deriveNatalSeed({} as SeedChart), ChartValidationError);
  assert.throws(
    () => deriveNatalSeed({ sun: 1.0, moon: 2.0 }), // < 3 longitude fields
    ChartValidationError,
  );
  assert.throws(
    // 1e21 is finite but outside the cross-substrate format domain
    () => deriveNatalSeed({ sun: 142.73, moon: 78.41, asc: 215.92, aspects_sum: 1e21 }),
    ChartValidationError,
  );
  assert.throws(
    () => deriveNatalSeed({ sun: NaN, moon: 78.41, asc: 215.92 }),
    ChartValidationError,
  );
});

test("resonarium: every emitted frequency respects the audio-safety clamp", () => {
  const chart: SeedChart = { sun: 0.0, moon: 179.999999, asc: 359.999999 };
  for (const hz of bedrockFrequencies(chart)) {
    assert.ok(hz >= 20.0 && hz <= 18000.0);
  }
  const b = binauralConfig(chart);
  assert.ok(b.carrier_hz >= 20.0 && b.carrier_hz <= 18000.0);
  assert.ok(b.beat_hz >= 4.0 && b.beat_hz < 12.0);
});
