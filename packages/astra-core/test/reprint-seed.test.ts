// A reprint reproduces its session — even across an ephemeris change.
//
// `printSessionTome` re-casts the chart on-device and re-deals the spread so a
// shelved reading prints its plates offline, months later. Until v1.0.4 that
// re-deal DERIVED its own seed from the freshly cast chart, which looks
// equivalent and is not: `defaultSeed` folds in longitudes rounded to 0.01°, so
// any change under a shelved reading walks some charts across a rounding
// boundary and deals a different spread — printed beside report text that is
// already written and still names the old cards.
//
// This is not hypothetical. Measured across the v1.0.3 → v1.0.4 change (the
// APK's engine gaining sepl_18/semo_18, so planets come from Swiss data rather
// than Moshier), over 500 charts spanning 1930–2010:
//
//   re-derived seed : 144/500 (28.8%) dealt a DIFFERENT spread
//   stored seed     : 500/500 reproduced the original draw
//
// The stored seed is the session's identity — the Bookshelf is literally keyed
// on it. These tests exist so a refactor that "simplifies" the override away
// fails loudly rather than silently re-opening the divergence.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { buildLocalReading, defaultSeed } from "../src/tarot.js";
import type { ChartResponse } from "../src/types.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const payload = JSON.parse(
  readFileSync(path.join(here, "../../../parity/tarot-reading.json"), "utf8")
);

function asChart(slim: any): ChartResponse {
  return {
    planets: slim.planets,
    houses: [], angles: {} as any, aspects: [], patterns: [],
    elements: slim.elements, modalities: slim.modalities, meta: {},
  } as ChartResponse;
}

const kase = payload.cases[0];
const chart = asChart(kase.chart);
const SPREAD = kase.spread ?? "three_card";
const QUESTION = kase.question ?? "what is moving";

/** The same chart after an ephemeris change: every longitude nudged by an
 *  arcsecond or so, which is the scale of the Moshier → Swiss-files move. */
function nudged(c: ChartResponse, arcsec: number): ChartResponse {
  const d = arcsec / 3600;
  return {
    ...c,
    planets: c.planets.map((p) => ({
      ...p,
      longitude: (p.longitude + d + 360) % 360,
    })),
  } as ChartResponse;
}

test("an unseeded reading still derives its seed from the chart", () => {
  const r = buildLocalReading(chart, SPREAD, QUESTION);
  assert.equal(r.seed, defaultSeed(chart, SPREAD, QUESTION, null));
});

test("a stored seed overrides the derived one", () => {
  const stored = defaultSeed(chart, SPREAD, QUESTION, null);
  const moved = nudged(chart, 30); // half a rounding bucket — moves the seed
  assert.notEqual(defaultSeed(moved, SPREAD, QUESTION, null), stored);

  const reprint = buildLocalReading(moved, SPREAD, QUESTION, { seed: stored });
  assert.equal(reprint.seed, stored, "the reprint reports the session's seed");
});

test("a reprint from the stored seed deals the original spread", () => {
  const original = buildLocalReading(chart, SPREAD, QUESTION);
  const moved = nudged(chart, 30);

  const rederived = buildLocalReading(moved, SPREAD, QUESTION);
  const reprint = buildLocalReading(moved, SPREAD, QUESTION, { seed: original.seed });

  const ids = (r: typeof original) =>
    r.cards.map((c) => `${c.card.id}${c.reversed ? "R" : ""}`);

  assert.deepEqual(ids(reprint), ids(original), "stored seed reproduces the draw");
  assert.notDeepEqual(
    ids(rederived), ids(original),
    "and the re-derived seed is what would have dealt a different one",
  );
});

test("an empty or absent seed falls back to derivation, never to a blank draw", () => {
  const derived = buildLocalReading(chart, SPREAD, QUESTION).seed;
  for (const seed of [undefined, null, ""]) {
    const r = buildLocalReading(chart, SPREAD, QUESTION, { seed });
    assert.equal(r.seed, derived, `seed=${JSON.stringify(seed)} derives`);
  }
});
