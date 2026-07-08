// Predictive parity (MOBILE_ROADMAP §3.4): the TS engine must reproduce
// parity/predictive.json (backend predictive.py) — secondary progressions and
// solar return — within the shared tolerance contract. Positions are angular →
// cross-engine widened (×5); tallies exact. ISO instants compared to ±2s
// (cross-engine root-find / progression math nudges the whole second).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { angularSeparation, calculateChart, eclipseTimeline, progressedChart, solarReturn } from "../src/index.js";
import type { ChartRequest } from "../src/index.js";

const dayDiff = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;

const here = path.dirname(fileURLToPath(import.meta.url));
const payload = JSON.parse(
  readFileSync(path.join(here, "../../../parity/predictive.json"), "utf8")
);
const TOL = payload.tolerances as Record<string, number>;
const CROSS = 5;
const BOUNDARY_MARGIN = TOL["planet.longitude_deg"] * CROSS * 2;

const MAX_ORB: Record<string, number> = {
  Conjunction: 8, Opposition: 8, Trine: 7, Square: 6, Sextile: 5,
  Quincunx: 3, Semisextile: 2, Sesquiquadrate: 2, Semisquare: 2, Quintile: 2,
};
const aspectKey = (a: any) => [...[a.p1, a.p2].sort(), a.type].join("|");

function compareAspects(actual: any[], expected: any[], orbFactor: number, ctx: string) {
  const exp = new Map(expected.map((a) => [aspectKey(a), a]));
  const act = new Map(actual.map((a) => [aspectKey(a), a]));
  for (const [k, a] of exp) {
    if (act.has(k)) {
      assert.ok(Math.abs(act.get(k)!.orb - a.orb) <= TOL["aspect.orb_deg"] * CROSS * 2, `${ctx}: ${k} orb`);
    } else {
      assert.ok(Math.abs(a.orb - MAX_ORB[a.type] * orbFactor) <= BOUNDARY_MARGIN, `${ctx}: missing ${k} not at boundary (orb ${a.orb})`);
    }
  }
  for (const [k, a] of act) {
    if (!exp.has(k)) assert.ok(Math.abs(a.orb - MAX_ORB[a.type] * orbFactor) <= BOUNDARY_MARGIN, `${ctx}: extra ${k} not at boundary (orb ${a.orb})`);
  }
}

function comparePlanets(actual: any[], expected: any[], ctx: string) {
  const expP = new Map(expected.map((p: any) => [p.id, p]));
  const actP = new Map(actual.map((p: any) => [p.id, p]));
  assert.deepEqual([...actP.keys()].sort(), [...expP.keys()].sort(), `${ctx}: planet ids`);
  for (const [id, ep] of expP) {
    const ap: any = actP.get(id);
    assert.ok(angularSeparation(ap.longitude, (ep as any).longitude) <= TOL["planet.longitude_deg"] * CROSS, `${ctx}: ${id} lon`);
    for (const f of ["sign", "house", "dignity", "element", "modality"] as const) {
      assert.equal(ap[f], (ep as any)[f], `${ctx}: ${id}.${f}`);
    }
  }
}

const isoWithin = (a: string, b: string, sec: number, ctx: string) =>
  assert.ok(Math.abs(Date.parse(a) - Date.parse(b)) <= sec * 1000, `${ctx}: ${a} vs ${b}`);

for (const kase of payload.cases) {
  test(`predictive parity: ${kase.id}`, () => {
    const req = kase.request;

    // Secondary progression.
    const prog = progressedChart(req, kase.progressed.target_iso);
    assert.ok(Math.abs(prog.age_years - kase.progressed.age_years) <= 0.01, "age_years");
    // Progression is pure time arithmetic (no ephemeris) → matches near-exactly.
    isoWithin(prog.progressed_iso, kase.progressed.progressed_iso, 2, "progressed_iso");
    comparePlanets(prog.planets, kase.progressed.planets, "progressed");
    compareAspects(prog.aspects_to_natal, kase.progressed.aspects_to_natal, 0.6, "progressed.aspects");

    // Solar return — two independent parity claims:
    //
    // 1. Root-find parity: TS's solarReturn lands on the same return instant as
    //    the backend (within a window). The instant is found by a Sun-longitude
    //    root-find, which amplifies the ~arcsec cross-engine Sun difference into
    //    tens of seconds of time (dt = dLon / 0.9856°/day).
    const sr = solarReturn(req, kase.solar_return.year);
    isoWithin(sr.return_iso, kase.solar_return.return_iso, 600, "return_iso");

    // 2. Chart parity: build the return chart at the BACKEND's instant so the
    //    root-find offset doesn't leak into the comparison — otherwise the
    //    Earth-rotation-tied fields (Asc/MC/houses/Part of Fortune) would differ
    //    by ~0.1°/tens-of-seconds. At a shared instant they match within the
    //    normal cross-engine tolerance.
    const t = new Date(kase.solar_return.return_iso);
    const srReq: ChartRequest = {
      year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate(),
      hour: t.getUTCHours(), minute: t.getUTCMinutes(), second: t.getUTCSeconds(),
      lat: req.lat, lng: req.lng, tz_offset: 0,
      house_system: req.house_system ?? "P", zodiac: req.zodiac ?? "tropical",
    };
    const chart = calculateChart(srReq);
    comparePlanets(chart.planets, kase.solar_return.planets, "solar_return");
    for (let i = 0; i < kase.solar_return.houses.length; i++) {
      const d = angularSeparation(chart.houses[i].longitude, kase.solar_return.houses[i].longitude);
      assert.ok(d <= TOL["house.cusp_deg"] * CROSS, `SR house ${i + 1} Δ${d}`);
      assert.equal(chart.houses[i].sign, kase.solar_return.houses[i].sign, `SR house ${i + 1} sign`);
    }
    for (const n of ["ascendant", "midheaven", "descendant", "imum_coeli"] as const) {
      assert.ok(angularSeparation((chart.angles as any)[n], kase.solar_return.angles[n]) <= TOL["angle_deg"] * CROSS, `SR ${n}`);
    }
    compareAspects(chart.aspects, kase.solar_return.aspects, 1.0, "solar_return.aspects");
    assert.deepEqual(chart.elements, kase.solar_return.elements, "SR elements");
    assert.deepEqual(chart.modalities, kase.solar_return.modalities, "SR modalities");

    // Eclipse timeline — astronomy-engine's eclipse search vs the Swiss one.
    // Eclipses are precisely timed, so dates align to the day; the luminary's
    // longitude (and thus sign/degree + activations) matches within tolerance.
    const ecl = eclipseTimeline(req, kase.eclipses.start_iso, kase.eclipses.count);
    assert.equal(ecl.eclipses.length, kase.eclipses.events.length, "eclipse count");
    for (let i = 0; i < kase.eclipses.events.length; i++) {
      const e = kase.eclipses.events[i];
      const a = ecl.eclipses[i]; // both sorted by time; eclipses are weeks apart
      assert.ok(dayDiff(a.date, e.date) <= 1, `eclipse ${i} date ${a.date} vs ${e.date}`);
      assert.equal(a.kind, e.kind, `eclipse ${i} kind`);
      assert.equal(a.nature, e.nature, `eclipse ${i} nature`);
      assert.ok(angularSeparation(a.longitude, e.longitude) <= 0.2, `eclipse ${i} lon ${a.longitude} vs ${e.longitude}`);
      // Activations by identity; membership can flip only for orbs at the 3° cutoff.
      const key = (c: any) => `${c.natal_body}|${c.aspect}`;
      const expA = new Map<string, number>(e.activations.map((c: any) => [key(c), c.orb]));
      const actA = new Map(a.activations.map((c) => [key(c), c.orb] as const));
      for (const [k, orb] of expA) {
        if (actA.has(k)) assert.ok(Math.abs(actA.get(k)! - orb) <= 0.1, `eclipse ${i} ${k} orb`);
        else assert.ok(3 - orb <= 0.1, `eclipse ${i} missing ${k} not at cutoff (orb ${orb})`);
      }
      for (const [k, orb] of actA) {
        if (!expA.has(k)) assert.ok(3 - orb <= 0.1, `eclipse ${i} extra ${k} not at cutoff (orb ${orb})`);
      }
    }
  });
}
