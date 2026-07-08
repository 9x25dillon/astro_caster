// Relational parity (MOBILE_ROADMAP §3.4): the TS relational engine must
// reproduce parity/synastry.json (backend synastry.py) within the shared
// tolerance contract. Positions (composite/Davison charts, inter-aspect orbs)
// are angular → cross-engine widened (×5); the house grid and the synastry-tarot
// spread are categorical/arithmetic → exact. List order is NOT asserted (TS and
// pyswisseph enumerate bodies differently); everything compares by identity.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  angularSeparation,
  calculateChart,
  compositeMidpoints,
  davisonChart,
  synastryAspects,
  synastryGrid,
  synastryTarot,
} from "../src/index.js";

import { initSwisseph } from "../src/swisseph.js";

// The extended bodies (Node/Chiron/Lilith) ride the WASM Swiss engine.
await initSwisseph();

const here = path.dirname(fileURLToPath(import.meta.url));
const payload = JSON.parse(
  readFileSync(path.join(here, "../../../parity/synastry.json"), "utf8")
);
const TOL = payload.tolerances as Record<string, number>;
// Same Swiss C code + data on both stacks now — the ×5 cross-engine widening
// collapses; the contract tolerances in the vector are the outer bound.
const CROSS = 1;
const BOUNDARY_MARGIN = TOL["planet.longitude_deg"] * CROSS * 2;

const MAX_ORB: Record<string, number> = {
  Conjunction: 8, Opposition: 8, Trine: 7, Square: 6, Sextile: 5,
  Quincunx: 3, Semisextile: 2, Sesquiquadrate: 2, Semisquare: 2, Quintile: 2,
};
const aspectKey = (a: any) => [...[a.p1, a.p2].sort(), a.type].join("|");

/** Compare two aspect lists as identity sets: matched orbs within tolerance,
 *  symmetric-difference entries only when they sit on an aspect-family cutoff
 *  (scaled by orbFactor) within the cross-engine boundary margin. */
function compareAspects(actual: any[], expected: any[], orbFactor: number, ctx: string) {
  const exp = new Map(expected.map((a) => [aspectKey(a), a]));
  const act = new Map(actual.map((a) => [aspectKey(a), a]));
  for (const [k, a] of exp) {
    if (act.has(k)) {
      assert.ok(
        Math.abs(act.get(k)!.orb - a.orb) <= TOL["aspect.orb_deg"] * CROSS * 2,
        `${ctx}: ${k} orb ${act.get(k)!.orb} vs ${a.orb}`
      );
    } else {
      assert.ok(
        Math.abs(a.orb - MAX_ORB[a.type] * orbFactor) <= BOUNDARY_MARGIN,
        `${ctx}: missing aspect not at boundary: ${k} (orb ${a.orb})`
      );
    }
  }
  for (const [k, a] of act) {
    if (exp.has(k)) continue;
    assert.ok(
      Math.abs(a.orb - MAX_ORB[a.type] * orbFactor) <= BOUNDARY_MARGIN,
      `${ctx}: extra aspect not at boundary: ${k} (orb ${a.orb})`
    );
  }
}

/** Tolerance-compare a chart-like object (planets/houses/angles/aspects/tallies). */
function compareChartLike(actual: any, expected: any, aspectFactor: number, ctx: string) {
  const expP = new Map(expected.planets.map((p: any) => [p.id, p]));
  const actP = new Map(actual.planets.map((p: any) => [p.id, p]));
  assert.deepEqual([...actP.keys()].sort(), [...expP.keys()].sort(), `${ctx}: planet ids`);
  for (const [id, ep] of expP) {
    const ap: any = actP.get(id);
    assert.ok(
      angularSeparation(ap.longitude, (ep as any).longitude) <= TOL["planet.longitude_deg"] * CROSS,
      `${ctx}: ${id} lon ${ap.longitude} vs ${(ep as any).longitude}`
    );
    for (const f of ["sign", "house", "dignity", "element", "modality"] as const) {
      assert.equal(ap[f], (ep as any)[f], `${ctx}: ${id}.${f}`);
    }
  }
  for (let i = 0; i < expected.houses.length; i++) {
    const d = angularSeparation(actual.houses[i].longitude, expected.houses[i].longitude);
    assert.ok(d <= TOL["house.cusp_deg"] * CROSS, `${ctx}: house ${i + 1} Δ${d}`);
    assert.equal(actual.houses[i].sign, expected.houses[i].sign, `${ctx}: house ${i + 1} sign`);
  }
  if (expected.angles) {
    for (const n of ["ascendant", "midheaven", "descendant", "imum_coeli"] as const) {
      const d = angularSeparation(actual.angles[n], expected.angles[n]);
      assert.ok(d <= TOL["angle_deg"] * CROSS, `${ctx}: ${n} Δ${d}`);
    }
  }
  compareAspects(actual.aspects, expected.aspects, aspectFactor, `${ctx}.aspects`);
  assert.deepEqual(actual.elements, expected.elements, `${ctx}: elements`);
  assert.deepEqual(actual.modalities, expected.modalities, `${ctx}: modalities`);
}

test("relational parity: synastry / composite / davison / tarot", () => {
  const reqA = payload.pair.a.request;
  const reqB = payload.pair.b.request;
  const chartA = calculateChart(reqA);
  const chartB = calculateChart(reqB);

  // Inter-aspects — set + orb tolerance (aspectsBetween uses orbFactor 0.6).
  compareAspects(synastryAspects(chartA, chartB), payload.inter_aspects, 0.6, "inter_aspects");

  // House grid — categorical, compared by identity (order-insensitive).
  const grid = synastryGrid(chartA, chartB);
  const overlayMap = (xs: any[]) => new Map(xs.map((o) => [`${o.host_owner}:${o.planet_id}`, o]));
  for (const side of ["b_in_a", "a_in_b"] as const) {
    const exp = overlayMap(payload.grid[side]);
    const act = overlayMap((grid as any)[side]);
    assert.deepEqual([...act.keys()].sort(), [...exp.keys()].sort(), `grid.${side} keys`);
    for (const [k, eo] of exp) {
      assert.equal(act.get(k)!.host_house, (eo as any).host_house, `grid.${side} ${k} house`);
    }
  }
  const empMap = (xs: any[]) =>
    new Map(xs.map((e) => [`${e.host_owner}:${e.house}`, { count: e.count, planets: [...e.planets].sort() }]));
  assert.deepEqual(empMap((grid as any).emphasis), empMap(payload.grid.emphasis), "grid.emphasis");
  const rulerMap = (xs: any[]) =>
    new Map(xs.map((r) => [`${r.host_owner}:${r.house}`, { cusp_sign: r.cusp_sign, ruler: r.ruler, lands_in_other_house: r.lands_in_other_house }]));
  assert.deepEqual(rulerMap((grid as any).rulers), rulerMap(payload.grid.rulers), "grid.rulers");

  // Composite (midpoint method) and Davison charts.
  compareChartLike(compositeMidpoints(chartA, chartB, "midpoint"), payload.composite, 1.0, "composite");
  compareChartLike(davisonChart(reqA, reqB), payload.davison, 1.0, "davison");

  // Synastry tarot — categorical, exact.
  const spread = synastryTarot(chartA, chartB).spread;
  assert.deepEqual([...spread.shared_themes].sort(), [...payload.synastry_tarot.shared_themes].sort(), "shared_themes");
  assert.deepEqual([...spread.complementary_shadows].sort(), [...payload.synastry_tarot.complementary_shadows].sort(), "complementary_shadows");
  assert.equal(spread.bond_card, payload.synastry_tarot.bond_card, "bond_card");
});
