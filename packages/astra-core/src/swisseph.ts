// WASM Swiss Ephemeris singleton — supplies the bodies astronomy-engine lacks
// (True Node, Chiron, Black Moon Lilith) from the same C code as the backend's
// pyswisseph, so their positions agree to well inside the parity tolerances
// (see vendor/swisseph/README.md for the measured deltas).
//
// Init is async (wasm compile + asset fetch); calculation is sync afterwards,
// matching ephemeris.ts's synchronous chart assembly. Callers `await
// initSwisseph()` once (idempotent); if it never ran or failed, chart casting
// degrades gracefully to the astronomy-engine body set.
//
// Asset loading is isomorphic via `new URL(..., import.meta.url)`:
//  - Node (parity tests under tsx): file: URL → read from disk
//  - Vite build: the literal pattern makes wasm + se1 emitted, hashed assets
//    served same-origin (and service-worker precached — no external requests)

import type { SwissEphModuleInstance } from "./vendor/swisseph/swisseph.js";

const SEFLG_SWIEPH = 2; // auto-falls back to Moshier per body when files are absent
const SEFLG_SPEED = 256;
const SEFLG_EQUATORIAL = 2048;

// Swiss body ids (swephexp.h)
export const SE_TRUE_NODE = 11;
export const SE_MEAN_APOG = 12;
export const SE_CHIRON = 15;

let instance: SwissEphModuleInstance | null = null;
let initPromise: Promise<boolean> | null = null;

async function loadBytes(url: URL): Promise<Uint8Array> {
  if (url.protocol === "file:") {
    // Node. The specifier is assembled so bundlers don't try to resolve it.
    const fs = await import(/* @vite-ignore */ "node" + ":fs");
    return new Uint8Array(fs.readFileSync(url));
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function doInit(): Promise<boolean> {
  try {
    const [factory, wasmBinary, seas] = await Promise.all([
      import("./vendor/swisseph/swisseph.js"),
      loadBytes(new URL("./vendor/swisseph/swisseph.wasm", import.meta.url)),
      loadBytes(new URL("./vendor/swisseph/seas_18.se1", import.meta.url)),
    ]);
    const m = await factory.default({ wasmBinary });
    m.FS.mkdir("/ephe");
    m.FS.writeFile("/ephe/seas_18.se1", seas);
    const p = m._malloc(16);
    m.stringToUTF8("/ephe", p, 16);
    m.ccall("swe_set_ephe_path_wrap", null, ["number"], [p]);
    m._free(p);
    instance = m;
    return true;
  } catch {
    return false; // chart casting degrades to the astronomy-engine body set
  }
}

/** Load + instantiate the wasm once. Safe to call repeatedly and concurrently;
 *  resolves false (never throws) when the engine can't be brought up. */
export function initSwisseph(): Promise<boolean> {
  if (!initPromise) initPromise = doInit();
  return initPromise;
}

export function swissReady(): boolean {
  return instance !== null;
}

function calcRaw(m: SwissEphModuleInstance, jd: number, body: number, flags: number): number[] | null {
  const xxPtr = m._malloc(6 * 8);
  const serrPtr = m._malloc(256);
  try {
    const ret = m.ccall(
      "swe_calc_ut_wrap",
      "number",
      ["number", "number", "number", "number", "number"],
      [jd, body, flags, xxPtr, serrPtr]
    ) as number;
    if (ret < 0) return null;
    const xx: number[] = [];
    for (let i = 0; i < 6; i++) xx.push(m.getValue(xxPtr + i * 8, "double"));
    return xx;
  } finally {
    m._free(xxPtr);
    m._free(serrPtr);
  }
}

/** Ecliptic position + declination for a Swiss body id, in the backend's frame
 *  (apparent geocentric, true ecliptic of date). Null when the engine isn't
 *  initialized or the body is unavailable — mirrors the backend's swe.Error
 *  skip so the chart simply omits the body. */
export function calcSwissBody(
  jd: number,
  body: number
): { lon: number; lat: number; speed: number; dec: number } | null {
  const m = instance;
  if (!m) return null;
  const ecl = calcRaw(m, jd, body, SEFLG_SWIEPH | SEFLG_SPEED);
  if (!ecl) return null;
  const eq = calcRaw(m, jd, body, SEFLG_SWIEPH | SEFLG_SPEED | SEFLG_EQUATORIAL);
  if (!eq) return null;
  return { lon: ecl[0], lat: ecl[1], speed: ecl[3], dec: eq[1] };
}

/** Houses + angles via swe_houses — the same C the backend's houses_ex runs
 *  (tropical; the wasm build has no sidereal export). cusps[0..11] = houses
 *  1..12; ascmc: 0=Asc, 1=MC, 2=ARMC, 3=Vertex. */
export function calcSwissHouses(
  jd: number,
  lat: number,
  lon: number,
  hsys: string
): { cusps: number[]; asc: number; mc: number; vertex: number } | null {
  const m = instance;
  if (!m) return null;
  const cuspsPtr = m._malloc(13 * 8);
  const ascmcPtr = m._malloc(10 * 8);
  try {
    m.ccall(
      "swe_houses_wrap",
      "number",
      ["number", "number", "number", "number", "number", "number"],
      [jd, lat, lon, hsys.charCodeAt(0), cuspsPtr, ascmcPtr]
    );
    const cusps: number[] = [];
    for (let i = 1; i <= 12; i++) cusps.push(m.getValue(cuspsPtr + i * 8, "double"));
    return {
      cusps,
      asc: m.getValue(ascmcPtr + 0 * 8, "double"),
      mc: m.getValue(ascmcPtr + 1 * 8, "double"),
      vertex: m.getValue(ascmcPtr + 3 * 8, "double"),
    };
  } finally {
    m._free(cuspsPtr);
    m._free(ascmcPtr);
  }
}

// Eclipse search — the same swe_*_when functions the backend's
// eclipse_timeline calls, with its flag set (SWIEPH|MOSEPH) and its
// retflag→nature decoding (checked in this exact order).
const SEFLG_ECL = SEFLG_SWIEPH | 4; // FLG_SWIEPH | FLG_MOSEPH
const ECLIPSE_NATURE: [string, number][] = [
  ["total", 4],
  ["annular_total", 32],
  ["annular", 8],
  ["partial", 16],
  ["penumbral", 64],
];

function eclipseNature(retflag: number): string {
  for (const [name, bit] of ECLIPSE_NATURE) if (retflag & bit) return name;
  return "unknown";
}

/** Next solar/lunar eclipse at/after jd: peak instant + decoded nature. */
export function nextSwissEclipse(
  jd: number,
  solar: boolean
): { jd: number; nature: string } | null {
  const m = instance;
  if (!m) return null;
  const tretPtr = m._malloc(10 * 8);
  const serrPtr = m._malloc(256);
  try {
    const retflag = m.ccall(
      solar ? "swe_sol_eclipse_when_glob_wrap" : "swe_lun_eclipse_when_wrap",
      "number",
      ["number", "number", "number", "number", "number", "number"],
      [jd, SEFLG_ECL, 0, tretPtr, 0, serrPtr]
    ) as number;
    if (retflag < 0) return null;
    return { jd: m.getValue(tretPtr + 0 * 8, "double"), nature: eclipseNature(retflag) };
  } finally {
    m._free(tretPtr);
    m._free(serrPtr);
  }
}
