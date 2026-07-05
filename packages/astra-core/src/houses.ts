// Ascendant, Midheaven, and Placidus house cusps — the piece the Python
// backend delegates to swe.houses_ex and we must compute ourselves.
//
// ARMC comes from apparent sidereal time (GAST) + east longitude; obliquity
// is the TRUE obliquity of date. The Placidus intermediates use the classic
// pole-iteration (as in Swiss Ephemeris swehouse.c): each cusp is the
// horizon-formula longitude Asc1(ra, pole) where the pole converges via
// pole = atan( sin(asin(tan φ · tan δ) / division) / tan δ ).
// Placidus is undefined above the polar circles — callers stay below ~66°.

import { norm360 } from "./astrology.js";

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

/** Ecliptic longitude rising on the eastern horizon for geographic (or house
 * pole) latitude `poleDeg`, given a right ascension `raDeg` on the meridian
 * frame. With poleDeg = φ and raDeg = ARMC + 90 this IS the Ascendant. */
export function asc1(raDeg: number, poleDeg: number, epsDeg: number): number {
  const ra = raDeg * D2R;
  const pole = poleDeg * D2R;
  const eps = epsDeg * D2R;
  const lon = Math.atan2(
    Math.cos(ra),
    -(Math.sin(ra) * Math.cos(eps) + Math.tan(pole) * Math.sin(eps))
  );
  return norm360(lon * R2D);
}

/** Midheaven: ecliptic longitude on the meridian at right ascension ARMC. */
export function midheaven(armcDeg: number, epsDeg: number): number {
  const armc = armcDeg * D2R;
  const eps = epsDeg * D2R;
  return norm360(Math.atan2(Math.sin(armc), Math.cos(armc) * Math.cos(eps)) * R2D);
}

export function ascendant(armcDeg: number, epsDeg: number, latDeg: number): number {
  // The +90 hour-angle offset is already baked into asc1's cos/(-sin) form,
  // so the Ascendant is asc1 evaluated directly at the RAMC.
  return asc1(armcDeg, latDeg, epsDeg);
}

function placidusCusp(
  armcDeg: number,
  offsetDeg: number,
  division: number,
  latDeg: number,
  epsDeg: number
): number {
  const ra = norm360(armcDeg + offsetDeg);
  const tanPhi = Math.tan(latDeg * D2R);
  const sinEps = Math.sin(epsDeg * D2R);
  let lon = asc1(ra, 0, epsDeg);
  for (let i = 0; i < 30; i++) {
    const delta = Math.asin(sinEps * Math.sin(lon * D2R)); // declination of point
    const tanDelta = Math.tan(delta);
    let pole = 0;
    if (Math.abs(tanDelta) > 1e-10) {
      const ad = Math.asin(Math.max(-1, Math.min(1, tanPhi * tanDelta)));
      pole = Math.atan(Math.sin(ad / division) / tanDelta) * R2D;
    }
    const next = asc1(ra, pole, epsDeg);
    if (Math.abs(next - lon) < 1e-9) {
      lon = next;
      break;
    }
    lon = next;
  }
  return lon;
}

/** Twelve Placidus cusps, index 0 == house 1. */
export function placidusCusps(
  armcDeg: number,
  latDeg: number,
  epsDeg: number
): number[] {
  const asc = ascendant(armcDeg, epsDeg, latDeg);
  const mc = midheaven(armcDeg, epsDeg);
  // Swiss Ephemeris feeds Asc1(armc + {30,60,120,150}); its Asc1 leads ours by
  // 90° (sin vs cos numerator), so our equivalent offsets are those minus 90.
  const c11 = placidusCusp(armcDeg, -60, 3, latDeg, epsDeg);
  const c12 = placidusCusp(armcDeg, -30, 1.5, latDeg, epsDeg);
  const c2 = placidusCusp(armcDeg, 30, 1.5, latDeg, epsDeg);
  const c3 = placidusCusp(armcDeg, 60, 3, latDeg, epsDeg);
  return [
    asc,
    c2,
    c3,
    norm360(mc + 180),
    norm360(c11 + 180),
    norm360(c12 + 180),
    norm360(asc + 180),
    norm360(c2 + 180),
    norm360(c3 + 180),
    mc,
    c11,
    c12,
  ];
}

/** 1..12 house index for an ecliptic longitude — port of ephemeris._house_of. */
export function houseOf(longitude: number, cusps: number[]): number {
  const lon = norm360(longitude);
  for (let i = 0; i < 12; i++) {
    const start = norm360(cusps[i]);
    const end = norm360(cusps[(i + 1) % 12]);
    const span = norm360(end - start);
    const offset = norm360(lon - start);
    if (offset < span) return i + 1;
  }
  return 12;
}
