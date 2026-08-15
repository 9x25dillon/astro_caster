// Track A3 — the TS engine asserted against EXTERNAL ground truth.
//
// The mirror of backend/tests/test_anchors.py. Both suites read the SAME
// files under parity/anchors/ and each asserts its own engine against them
// independently: neither engine is permitted to be the other's reference
// here. That separation is what an anchor buys that a golden vector cannot —
// the vectors prove the two stacks agree, these prove they are right.
//
// Files not yet acquired are SKIPPED with a pointer, never silently passed:
// see parity/anchors/ACQUISITION.md for the exact queries and the reason the
// set is currently small (network egress policy, documented on 2026-08-12).
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { eclipticLonSpeed } from "../src/index.js";
import { initSwisseph } from "../src/swisseph.js";

await initSwisseph();

const here = path.dirname(fileURLToPath(import.meta.url));
const anchorDir = path.resolve(here, "../../../parity/anchors");

const angularSep = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
};

// ── Planetary longitudes ───────────────────────────────────────────────────
const lonFile = path.join(anchorDir, "planet_longitudes.json");

test("planetary longitudes match published ephemeris anchors", (t) => {
  if (!existsSync(lonFile)) {
    t.skip("planet_longitudes.json not acquired — see parity/anchors/ACQUISITION.md");
    return;
  }
  const payload = JSON.parse(readFileSync(lonFile, "utf8"));
  // The frame is load-bearing: apparent-of-date vs J2000-ecliptic differ by
  // up to ~1.4°/century of precession, which would read as an engine bug.
  // The file must say which one it recorded, and it must be ours.
  assert.match(
    payload.frame ?? "",
    /of date/i,
    "anchor frame must be the true ecliptic and equinox OF DATE — the frame " +
      "swe_calc_ut returns. See ACQUISITION.md §Frame trap."
  );

  for (const anchor of payload.anchors) {
    const got = eclipticLonSpeed(anchor.jd_ut, anchor.body);
    assert.ok(got, `${anchor.id}: TS engine returned no position for ${anchor.body}`);
    const tol = anchor.uncertainty + anchor.engine_allowance;
    const delta = angularSep(got!.lon, anchor.value);
    assert.ok(
      delta <= tol,
      `${anchor.id}: engine ${got!.lon}° vs published ${anchor.value}° ` +
        `(Δ${delta.toFixed(6)}° > ${tol}° tolerance)\n` +
        `  source: ${anchor.source}\n  ${anchor.url}\n` +
        "  Do NOT widen the anchor to make this pass — see parity/anchors/README.md."
    );
  }
});

// ── ΔT ─────────────────────────────────────────────────────────────────────
test("ΔT anchors are covered for this engine", (t) => {
  // The vendored wasm build exports swe_calc_ut/houses/julday/revjul/eclipse
  // wrappers only — there is no swe_deltat to call, so this engine's ΔT
  // cannot be asserted directly. It is covered TRANSITIVELY: A1's generative
  // harness (backend/tools/parity_property.py) holds TS planetary longitudes
  // to ≤0.01° of the backend's across 2000 stratified cases per CI run, and
  // backend/tests/test_anchors.py pins the backend's ΔT to the published
  // value. A ΔT error large enough to matter would break the first check.
  //
  // This test exists so that chain is asserted rather than assumed: if a
  // future wasm rebuild exports swe_deltat, this should become a direct
  // comparison against parity/anchors/delta_t.json.
  const deltaTFile = path.join(anchorDir, "delta_t.json");
  assert.ok(existsSync(deltaTFile), "delta_t.json anchor set is missing");
  const payload = JSON.parse(readFileSync(deltaTFile, "utf8"));
  assert.ok(
    payload.anchors.length > 0,
    "delta_t.json has no anchors — the transitive ΔT coverage argument in " +
      "parity/anchors/README.md rests on the backend having something to pin to"
  );
  t.diagnostic(
    `ΔT covered transitively via A1 + backend anchors (${payload.anchors.length} points)`
  );
});

// ── Eclipses ───────────────────────────────────────────────────────────────
const eclipseFile = path.join(anchorDir, "eclipses.json");

test("eclipse nature and date match the published catalog", async (t) => {
  if (!existsSync(eclipseFile)) {
    t.skip("eclipses.json not acquired — see parity/anchors/ACQUISITION.md");
    return;
  }
  const payload = JSON.parse(readFileSync(eclipseFile, "utf8"));
  const { searchEclipses } = await import("../src/ephemeris.js");

  // WHAT THIS CAN AND CANNOT ASSERT, and why.
  //
  // `nature` and the calendar date are compared directly — they are also
  // exactly what this engine surfaces to a reader, so this is the product
  // surface rather than a layer beneath it.
  //
  // The sub-second INSTANT is not compared here. The catalog publishes TD and
  // searchEclipses returns UT, and the vendored wasm exports no `swe_deltat`
  // to convert between them (the same limitation the ΔT test above documents).
  // Converting with the catalog's own ΔT column is not an option either: it is
  // an extrapolation after 2006, which is the trap eclipses.json's
  // delta_t_column_note exists for. The backend suite pins the instant to 3.5 s
  // against the same file, and A1's harness holds the two engines together, so
  // an instant error large enough to matter cannot hide — but it is covered
  // transitively, not here. If a future wasm build exports swe_deltat, this
  // should gain the direct comparison the backend already makes.
  for (const anchor of payload.anchors) {
    const publishedDate: string = anchor.td_instant.slice(0, 10);

    // TD and UT differ by ~21-71 s across this set, so an eclipse within a
    // minute or two of midnight UT could legitimately land on the adjacent
    // calendar date. None in this file is (earliest is 01:51 TD), but a future
    // anchor could be, and it would look like an engine fault rather than a
    // scale mismatch — so refuse to make a claim we cannot back.
    const hhmm = anchor.td_instant.slice(11, 16);
    if (hhmm < "00:05" || hhmm > "23:55") {
      t.diagnostic(`${anchor.id}: skipped, ${hhmm} TD is too near midnight to
        compare a UT calendar date without ΔT`);
      continue;
    }

    // Start a few days early and take enough events that the window covers it
    // whichever kind interleaves first.
    const start = new Date(`${publishedDate}T00:00:00Z`);
    start.setUTCDate(start.getUTCDate() - 3);
    const found = searchEclipses(start, 4);

    const match = found.find((e) => e.date === publishedDate);
    assert.ok(
      match,
      `${anchor.id}: TS engine reported nothing on ${publishedDate}; it found ` +
        `${JSON.stringify(found.map((e) => [e.date, e.is_solar ? "solar" : "lunar", e.kind]))}\n` +
        `  source: ${anchor.source}\n  ${anchor.url}\n  row: ${anchor.citation}`
    );
    assert.equal(
      match!.is_solar,
      anchor.kind === "solar",
      `${anchor.id}: TS engine says ${match!.is_solar ? "solar" : "lunar"}, ` +
        `catalog says ${anchor.kind}`
    );
    assert.equal(
      match!.kind,
      anchor.nature,
      `${anchor.id}: TS engine says nature=${match!.kind}, catalog says ` +
        `${anchor.nature}\n  row: ${anchor.citation}\n` +
        "  Do NOT widen the anchor to make this pass — see parity/anchors/README.md."
    );
  }
  t.diagnostic(`${payload.anchors.length} eclipse anchors checked (nature + date)`);
});
