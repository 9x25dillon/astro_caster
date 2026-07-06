// Forecast parity: the TS scanner must reproduce the backend's event set.
// Tolerance-based (parity/forecast.json carries the window): events match by
// IDENTITY (type, planet, aspect, target, direction); the exact date may
// differ by ≤ date_tolerance_days and the orb by ≤ orb_tolerance_deg, because
// astronomy-engine and pyswisseph nudge near-midnight stations and
// flat-minimum aspects by a day. Every expected event must find a match and
// vice-versa.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { generateForecast } from "../src/forecast.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const payload = JSON.parse(
  readFileSync(path.join(here, "../../../parity/forecast.json"), "utf8")
);
const DATE_TOL = payload.date_tolerance_days;
const ORB_TOL = payload.orb_tolerance_deg;

const identity = (e: any) =>
  `${e.type}|${e.planet}|${e.aspect}|${e.target}|${e.direction}`;
const dayDiff = (a: string, b: string) =>
  Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;

/** Greedy identity+window matcher; returns unmatched from each side. */
function diff(expected: any[], actual: any[]) {
  const byId = new Map<string, any[]>();
  for (const e of actual) {
    const k = identity(e);
    (byId.get(k) ?? byId.set(k, []).get(k)!).push(e);
  }
  const onlyExpected: any[] = [];
  for (const e of expected) {
    const pool = byId.get(identity(e)) ?? [];
    let hit = -1;
    let best = Infinity;
    for (let i = 0; i < pool.length; i++) {
      const dd = dayDiff(e.date, pool[i].date);
      if (dd <= DATE_TOL && Math.abs((e.orb ?? 0) - (pool[i].orb ?? 0)) <= ORB_TOL && dd < best) {
        best = dd;
        hit = i;
      }
    }
    if (hit >= 0) pool.splice(hit, 1);
    else onlyExpected.push(e);
  }
  const onlyActual = [...byId.values()].flat();
  return { onlyExpected, onlyActual };
}

for (const kase of payload.cases) {
  test(`forecast: ${kase.id}`, () => {
    const got = generateForecast(kase.natal, kase.start, kase.days, kase.min_sig);
    const { onlyExpected, onlyActual } = diff(kase.events, got);
    const fmt = (e: any) =>
      `${e.date} ${e.planet} ${e.aspect ?? e.direction} ${e.target ?? ""} orb=${e.orb}`;
    assert.deepEqual(
      { missing: onlyExpected.map(fmt), extra: onlyActual.map(fmt) },
      { missing: [], extra: [] },
      `${kase.id}: expected ${kase.events.length}, got ${got.length}`
    );
  });
}
