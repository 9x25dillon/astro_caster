// Advanced parity (MOBILE_ROADMAP §3.4): the TS engine must reproduce
// parity/advanced.json (backend advanced.py) — harmonic charts, midpoint trees,
// fixed stars. Pure arithmetic on natal positions, so exact modulo the natal
// cross-engine position noise. NOTE: harmonic longitudes multiply that noise ×N,
// so harmonic tolerances are scaled by the harmonic number.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { angularSeparation, fixedStarHits, harmonicChart, midpointTree } from "../src/index.js";

import { initSwisseph } from "../src/swisseph.js";

// The extended bodies (Node/Chiron/Lilith) ride the WASM Swiss engine.
await initSwisseph();

const here = path.dirname(fileURLToPath(import.meta.url));
const payload = JSON.parse(
  readFileSync(path.join(here, "../../../parity/advanced.json"), "utf8")
);
const TOL = payload.tolerances as Record<string, number>;
// Same Swiss C code + data on both stacks now — the ×5 cross-engine widening
// collapses; the contract tolerances in the vector are the outer bound.
const CROSS = 1;
const POS_TOL = TOL["planet.longitude_deg"] * CROSS; // 0.05°

/** Compare two sets of {key, orb, cutoff-membership} tuples: matched orbs within
 *  `orbTol`; symmetric-difference entries allowed only when their orb sits within
 *  `margin` of the membership `cutoff` (cross-engine borderline). */
function compareOrbSet(
  actual: { key: string; orb: number }[],
  expected: { key: string; orb: number }[],
  cutoff: number, orbTol: number, margin: number, ctx: string
) {
  const exp = new Map(expected.map((e) => [e.key, e.orb]));
  const act = new Map(actual.map((a) => [a.key, a.orb]));
  for (const [k, orb] of exp) {
    if (act.has(k)) assert.ok(Math.abs(act.get(k)! - orb) <= orbTol, `${ctx}: ${k} orb ${act.get(k)} vs ${orb}`);
    else assert.ok(cutoff - orb <= margin, `${ctx}: missing ${k} not at boundary (orb ${orb})`);
  }
  for (const [k, orb] of act) {
    if (!exp.has(k)) assert.ok(cutoff - orb <= margin, `${ctx}: extra ${k} not at boundary (orb ${orb})`);
  }
}

for (const kase of payload.cases) {
  test(`advanced parity: ${kase.id}`, () => {
    const req = kase.request;

    // ---- Harmonic chart (positions amplify natal noise ×N) ----
    const N = kase.harmonic.n;
    const harmTol = POS_TOL * N;
    const harm = harmonicChart(req, N);
    const expPos = new Map<string, any>(kase.harmonic.positions.map((p: any) => [p.id, p]));
    const actPos = new Map(harm.positions.map((p) => [p.id, p] as const));
    assert.deepEqual([...actPos.keys()].sort(), [...expPos.keys()].sort(), "harmonic ids");
    for (const [id, ep] of expPos) {
      const ap = actPos.get(id)!;
      assert.ok(angularSeparation(ap.longitude, (ep as any).longitude) <= harmTol, `harmonic ${id} lon`);
      // sign/degree only when the harmonic longitude sits clear of a sign edge
      // by the amplified margin (a boundary flip is cross-engine noise, not a bug).
      const within = ((ep as any).longitude % 30 + 30) % 30;
      if (within > harmTol && within < 30 - harmTol) {
        assert.equal(ap.sign, (ep as any).sign, `harmonic ${id} sign`);
      }
    }
    compareOrbSet(
      harm.aspects.map((a) => ({ key: [a.p1, a.p2].sort().join("|"), orb: a.orb })),
      kase.harmonic.aspects.map((a: any) => ({ key: [a.p1, a.p2].sort().join("|"), orb: a.orb })),
      2.0, TOL["aspect.orb_deg"] * CROSS * 2, harmTol * 2, "harmonic.conjunctions"
    );

    // ---- Midpoint tree (flatten to pair|body|aspect contacts) ----
    const tree = midpointTree(req, kase.midpoint_tree.orb);
    const flatten = (entries: any[]) =>
      entries.flatMap((e: any) => e.contacts.map((c: any) => ({ key: `${e.pair}|${c.body}|${c.aspect}`, orb: c.orb })));
    compareOrbSet(
      flatten(tree), flatten(kase.midpoint_tree.entries),
      kase.midpoint_tree.orb, TOL["aspect.orb_deg"] * CROSS * 2, POS_TOL * 2, "midpoint_tree"
    );

    // ---- Fixed stars (catalogue longitudes are deterministic → exact) ----
    const stars = fixedStarHits(req, kase.fixed_stars.orb);
    compareOrbSet(
      stars.map((h) => ({ key: `${h.star}|${h.natal_body}`, orb: h.orb })),
      kase.fixed_stars.hits.map((h: any) => ({ key: `${h.star}|${h.natal_body}`, orb: h.orb })),
      kase.fixed_stars.orb, TOL["aspect.orb_deg"] * CROSS, POS_TOL * 2, "fixed_stars"
    );
    const actHit = new Map(stars.map((h) => [`${h.star}|${h.natal_body}`, h]));
    for (const eh of kase.fixed_stars.hits) {
      const ah = actHit.get(`${eh.star}|${eh.natal_body}`);
      if (!ah) continue; // borderline membership handled above
      assert.equal(ah.star_longitude, eh.star_longitude, `star ${eh.star} longitude`);
      assert.equal(ah.sign, eh.sign, `star ${eh.star} sign`);
      assert.equal(ah.nature, eh.nature, `star ${eh.star} nature`);
    }
  });
}
