// torusLayers.ts — the astrology of a PRODUCT of two circles.
//
// The torus is T² = S¹ × S¹: θ is one body's longitude, φ is the other's. That
// single fact decides where every astrological idea belongs on it, and the rule
// is arity:
//
//   a single longitude      →  a CIRCLE.   A fixed star at σ, or a natal planet
//   (star, cusp, natal          there, is the meridian θ = σ (where body A meets
//   position)                   it) and the parallel φ = σ (where body B does).
//                               The two cross at one point: both at once.
//
//   an arc partition        →  a GRID of cells. Twelve signs on each axis is a
//   (signs, houses)             144-tile checkerboard, and a tile is a whole
//                               statement — "A in Aries while B is in Taurus".
//                               Whole-sign aspects are TILES, not diagonals;
//                               the wheel cannot show you that and this can.
//
//   a per-body property     →  a STRIPE FIELD along one axis. Dignity depends on
//   (dignity, sect)             where a body IS, so body A's dignity varies with
//                               θ alone and body B's with φ alone. Laid over each
//                               other they make a terrain: bright where both are
//                               strong, dark through the mutual falls, and the
//                               trajectory visibly climbs and sinks through it.
//
//   a pair relation         →  a DIAGONAL circle. Aspects, already drawn — see
//   (aspects)                   torus.ts, where they are Villarceau circles.
//
// The layer that matters most is the natal one, because it is the same object
// as the SOUND. A natal body's drone sits at a fixed pitch; a transiting body's
// drone sweeps. Under the bedrock map (110 Hz · 2^(λ/180), lib/resonance.ts)
// two drones beat at |f_A − f_B|, which is zero exactly when the longitudes
// meet. So every crossing of a natal line on this surface IS a zero-beat: the
// grid you are looking at and the comb you are sweeping are one thing.
//
// Pure math. No DOM, no canvas, no ephemeris calls — the component draws.

import { SIGNS, dignityFor, signFor } from "@astra/core";
// norm360 rather than a local ((x%360)+360)%360. That idiom is NOT the same
// function: for a value already in range the round trip through +360 costs a
// ulp, so 228.94 comes back as 228.94000000000005 — measured here, by three
// tests failing at once. It matters beyond tidiness because a longitude folds
// into the session seed rounded to 0.01°, and a ulp is enough to round the
// other way. torus.ts and resonance.ts both use the exact form; so does this.
import { norm360 } from "./torus";

/** A great circle on the torus, at a fixed longitude on one axis. */
export interface AxisLine {
  /** The longitude the line stands at, [0, 360). */
  lon: number;
  /** Which circle it is: a meridian (θ = lon, body A) or a parallel (φ = lon). */
  axis: "theta" | "phi";
  label: string;
  color: string;
  /** Drawn heavier when the line means more — an exact natal position over its
   *  own opposition, a first-magnitude star over a faint one. */
  weight: number;
}

/** Where two axis lines cross: both bodies on a named longitude at once. */
export interface NodeCrossing {
  theta: number;
  phi: number;
  labelA: string;
  labelB: string;
}

// ---------------------------------------------------------------------------
// Signs — the partition both axes already carry
// ---------------------------------------------------------------------------

/** Element by sign index, in zodiacal order: fire, earth, air, water, repeating. */
const ELEMENT_CYCLE = ["Fire", "Earth", "Air", "Water"] as const;

export function elementOfSignIndex(i: number): string {
  return ELEMENT_CYCLE[((i % 4) + 4) % 4];
}

/** The twelve sign cusps as lines on one axis, tinted by element.
 *
 *  The torus already drew these — anonymous 30° wireframe, the comment noting
 *  they "sit on sign cusps" and nothing saying so on screen. Naming them is the
 *  cheapest true thing this surface can be taught to say. */
export function signLines(
  axis: "theta" | "phi",
  colorOfElement: (element: string) => string,
): AxisLine[] {
  return SIGNS.map((name, i) => ({
    lon: i * 30,
    axis,
    label: name,
    color: colorOfElement(elementOfSignIndex(i)),
    // The cardinal cusps (0° Aries, Cancer, Libra, Capricorn) carry the
    // solstice/equinox frame, so they read a step heavier than the rest.
    weight: i % 3 === 0 ? 1 : 0.55,
  }));
}

// ---------------------------------------------------------------------------
// Dignity — a per-body property, so a field along ONE axis
// ---------------------------------------------------------------------------

/** How strongly a body is placed, as a signed scalar in [-1, 1]. */
export const DIGNITY_STRENGTH: Readonly<Record<string, number>> = {
  Domicile: 1,
  Exaltation: 0.66,
  Neutral: 0,
  Detriment: -0.66,
  Fall: -1,
};

export interface DignityBand {
  /** Sign arc this band covers. */
  from: number;
  to: number;
  sign: string;
  dignity: string;
  /** −1 (fall) … +1 (domicile). */
  strength: number;
}

/**
 * The dignity terrain one body travels, sign by sign, all the way round.
 *
 * Returns twelve bands whatever the body — including all-Neutral for anything
 * outside the classical scheme (the Nodes, Chiron, Lilith, the angles). An
 * empty result would read as "no data"; twelve flat bands read as what is
 * actually true, which is that traditional dignity has nothing to say here.
 */
export function dignityBands(bodyId: string): DignityBand[] {
  return SIGNS.map((sign, i) => {
    const dignity = dignityFor(bodyId, sign) || "Neutral";
    return {
      from: i * 30,
      to: i * 30 + 30,
      sign,
      dignity,
      strength: DIGNITY_STRENGTH[dignity] ?? 0,
    };
  });
}

/** The dignity a body would hold at a given longitude. */
export function dignityAt(bodyId: string, lonDeg: number): string {
  return dignityFor(bodyId, signFor(lonDeg)) || "Neutral";
}

/**
 * The pair's JOINT condition at one point of the surface, in [-1, 1].
 *
 * The mean rather than the sum, so it stays comparable to a single body's
 * strength, and so "one exalted, one fallen" reads as the tension it is rather
 * than as the neutral a sum would flatten it into.
 */
export function jointStrength(bodyA: string, bodyB: string, theta: number, phi: number): number {
  const a = DIGNITY_STRENGTH[dignityAt(bodyA, theta)] ?? 0;
  const b = DIGNITY_STRENGTH[dignityAt(bodyB, phi)] ?? 0;
  return (a + b) / 2;
}

// ---------------------------------------------------------------------------
// The natal field — the layer that is the same object as the sound
// ---------------------------------------------------------------------------

/** A body at a fixed longitude, as the app already holds it. */
export interface NatalPosition {
  id: string;
  longitude: number;
}

/**
 * The natal chart as lines on the torus.
 *
 * Each natal body contributes FOUR circles: the meridian and parallel at its
 * own longitude, where a transiting body conjuncts it, and the pair at the
 * opposite degree.
 *
 * The opposition earns its lines for an acoustic reason rather than a doctrinal
 * one. Under the bedrock map an octave is 180°, so a transiting body opposite a
 * natal one sits at exactly TWICE its frequency — the only other rational ratio
 * the map admits, and audible as a second zero-beat between the transiting
 * drone's 2nd harmonic and the natal fundamental. Square, trine and sextile are
 * 2^½, 2^⅔ and 2^⅓: irrational, no low-order lock, nothing to hear. They are
 * why crossings get a bell instead. Drawing lines only where the surface can
 * actually RING is the honest version of this layer, and it teaches which
 * aspects are consonances rather than conventions.
 */
export function natalLines(
  positions: readonly NatalPosition[],
  colorOf: (bodyId: string) => string,
  includeOppositions = true,
): AxisLine[] {
  const out: AxisLine[] = [];
  for (const p of positions) {
    const lon = norm360(p.longitude);
    for (const axis of ["theta", "phi"] as const) {
      out.push({ lon, axis, label: p.id, color: colorOf(p.id), weight: 1 });
      if (includeOppositions) {
        out.push({
          lon: (lon + 180) % 360,
          axis,
          label: `${p.id} ☍`,
          color: colorOf(p.id),
          weight: 0.5,
        });
      }
    }
  }
  return out;
}

/**
 * Every point where BOTH bodies meet a natal position at once — the lattice the
 * dual sweep is hunting.
 *
 * n natal bodies give n² of these (4n² with oppositions), and each one is a
 * double zero-beat: both transiting drones locked to a natal drone in the same
 * instant. They are rare in time and exact in place, which is what makes them
 * worth marking rather than leaving to the eye.
 */
export function nodeCrossings(
  positions: readonly NatalPosition[],
  includeOppositions = true,
): NodeCrossing[] {
  const spread = (p: NatalPosition) => {
    const lon = norm360(p.longitude);
    return includeOppositions
      ? [{ lon, label: p.id }, { lon: (lon + 180) % 360, label: `${p.id} ☍` }]
      : [{ lon, label: p.id }];
  };
  const out: NodeCrossing[] = [];
  for (const a of positions) {
    for (const av of spread(a)) {
      for (const b of positions) {
        for (const bv of spread(b)) {
          out.push({ theta: av.lon, phi: bv.lon, labelA: av.label, labelB: bv.label });
        }
      }
    }
  }
  return out;
}

/** One transiting body arriving on one natal longitude: an audible zero-beat. */
export interface NatalCrossing {
  jd: number;
  /** Which transiting body reached it — "A" rides θ, "B" rides φ. */
  body: "A" | "B";
  /** The natal body whose line was crossed, and the longitude it stands at. */
  natal: string;
  natalLon: number;
  lonA: number;
  lonB: number;
  /** True when the lock is the octave (2:1) rather than the unison (1:1). */
  opposition: boolean;
}

/** Samples of a pair through time, as the trajectory supplies them. */
export interface PairSample {
  jd: number;
  lonA: number;
  lonB: number;
}

/** Signed separation in (−180, 180]. */
function sep(a: number, b: number): number {
  const d = norm360(a - b);
  return d > 180 ? d - 360 : d;
}

/**
 * Where the pair's trajectory actually MEETS a natal line.
 *
 * The lattice of natal lines has n² intersections (4n² with oppositions) and
 * drawing them all buries the surface in dots that mean "a crossing could
 * happen here" — which is every point of every line, and so is nothing. The
 * events worth marking are the ones this pair, in this window, actually
 * reaches: each is a moment a transiting drone slides into a natal drone and
 * the beat between them falls to zero.
 *
 * Found by sign change in the separation rather than by proximity, so a fast
 * body is not missed between samples and a slow one is not reported dozens of
 * times while it dawdles inside an orb. Same method the aspect crossings use,
 * for the same reason.
 */
export function natalCrossings(
  samples: readonly PairSample[],
  positions: readonly NatalPosition[],
  includeOppositions = true,
): NatalCrossing[] {
  const out: NatalCrossing[] = [];
  if (samples.length < 2) return out;

  for (const p of positions) {
    const base = norm360(p.longitude);
    const targets: Array<[number, boolean]> = includeOppositions
      ? [[base, false], [norm360(base + 180), true]]
      : [[base, false]];

    for (const [target, opposition] of targets) {
      for (const body of ["A", "B"] as const) {
        const lonOf = (s: PairSample) => (body === "A" ? s.lonA : s.lonB);
        let prev = sep(lonOf(samples[0]), target);
        for (let i = 1; i < samples.length; i++) {
          const cur = sep(lonOf(samples[i]), target);
          // A sign change across a SHORT arc is a crossing. The 180° guard
          // rejects the wrap at the far side of the circle, which flips sign
          // without the body having gone anywhere near the natal degree.
          if (prev !== 0 && Math.sign(cur) !== Math.sign(prev) &&
              Math.abs(cur - prev) < 180) {
            const t = Math.abs(prev) / (Math.abs(prev) + Math.abs(cur) || 1);
            const a = samples[i - 1];
            const b = samples[i];
            out.push({
              jd: a.jd + (b.jd - a.jd) * t,
              body,
              natal: p.id,
              natalLon: target,
              lonA: a.lonA + sep(b.lonA, a.lonA) * t,
              lonB: a.lonB + sep(b.lonB, a.lonB) * t,
              opposition,
            });
          }
          prev = cur;
        }
      }
    }
  }
  out.sort((x, y) => x.jd - y.jd);
  return out;
}

// ---------------------------------------------------------------------------
// Houses and stars — the same rule, different partitions
// ---------------------------------------------------------------------------

export interface HouseCuspLike {
  index: number;
  longitude: number;
}

/**
 * House cusps as lines. The same construction as the signs and deliberately a
 * DIFFERENT one from a fixed 30° grid: away from the equator Placidus cusps are
 * markedly unequal, and a house layer that quietly drew twelve even arcs would
 * be teaching a falsehood on exactly the charts where it matters most.
 */
export function houseLines(
  cusps: readonly HouseCuspLike[],
  axis: "theta" | "phi",
  color: string,
): AxisLine[] {
  return cusps.map((c) => ({
    lon: norm360(c.longitude),
    axis,
    label: `H${c.index}`,
    color,
    // The angles — Asc, IC, Desc, MC — are the chart's frame, not just four
    // more cusps.
    weight: c.index === 1 || c.index === 4 || c.index === 7 || c.index === 10 ? 1 : 0.5,
  }));
}

export interface StarLike {
  star: string;
  star_longitude: number;
}

/**
 * Fixed stars as threads.
 *
 * A star is a single longitude, so it is a circle on each axis — the same
 * object as a natal body, and drawn thinner because it is a background against
 * which the chart moves rather than part of the chart. Only stars that actually
 * contact this chart are passed in: the whole catalogue would be a fog, and the
 * ones already within orb are the ones the reader has a reason to look for.
 */
export function starLines(
  stars: readonly StarLike[],
  color: string,
): AxisLine[] {
  const seen = new Set<string>();
  const out: AxisLine[] = [];
  for (const s of stars) {
    // The same star can contact several natal bodies; it is still one thread.
    if (seen.has(s.star)) continue;
    seen.add(s.star);
    const lon = norm360(s.star_longitude);
    for (const axis of ["theta", "phi"] as const) {
      out.push({ lon, axis, label: s.star, color, weight: 0.4 });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// The letters — the same arity rule, applied to an alphabet
// ---------------------------------------------------------------------------
//
// The Sefer Yetzirah's partition of the alphabet turns out to be the partition
// this surface already has, and the arity rule at the top of this file places
// each part without needing a new idea:
//
//   12 elementals → one per SIGN, and a sign is an arc of one axis, so a
//                   letter is a MARK at the arc's midpoint. Twelve on θ,
//                   twelve on φ, and the pair standing over any point of the
//                   surface names the tile the trajectory is currently in.
//
//    7 doubles    → one per classical PLANET, and a planet here is a single
//                   longitude, so its letter is a mark on the circle that
//                   longitude already draws (see natalLines).
//
//    3 mothers    → one per ELEMENT, and an element is not a position at all.
//                   They get no mark on the surface: they are how the surface
//                   TURNS, and they live in lib/torus4 as the three orthogonal
//                   plane-pairs of ℝ⁴. Aleph is the Hopf flow this panel has
//                   been running since chapter V.
//
// A mark needs a reference circle to sit on, since a longitude on one axis is a
// whole circle in the other. Sign letters ride the equator (φ = 0 for the θ
// letters, θ = 0 for the φ letters) and body letters ride the quarter (φ = 90,
// θ = 90) — two rings that never collide and are both on the surface's near
// face at the default camera.

import {
  letterAtLongitude,
  letterForBody,
  type Attribution,
  type HebrewLetter,
} from "./hebrew";

/** A glyph to be drawn at one point of the torus. */
export interface GlyphMark {
  theta: number;
  phi: number;
  glyph: string;
  color: string;
  /** Relative size — the reader's eye should sort these before reading them. */
  size: number;
  /** What it says, for the readout and the canvas's accessible label. */
  title: string;
}

/** Where sign letters ride, and where body letters ride. Kept apart on purpose. */
const SIGN_RING = 0;
const BODY_RING = 90;

/**
 * The twelve elementals along one axis, each at the middle of its sign.
 *
 * The midpoint rather than the cusp, because the letter names the whole arc and
 * a glyph sitting on a cusp reads as belonging to the boundary — which is the
 * one place in the sign it does not mean anything special.
 */
export function signLetterMarks(
  axis: "theta" | "phi",
  colorOfElement: (element: string) => string,
): GlyphMark[] {
  return SIGNS.map((sign, i) => {
    const mid = i * 30 + 15;
    const letter = letterAtLongitude(mid);
    return {
      theta: axis === "theta" ? mid : SIGN_RING,
      phi: axis === "theta" ? SIGN_RING : mid,
      glyph: letter.glyph,
      color: colorOfElement(elementOfSignIndex(i)),
      size: 1,
      title: `${letter.glyph} ${letter.name} · ${sign} · path ${letter.path} (${letter.joins}) · ${letter.value}`,
    };
  });
}

/**
 * The doubles over the natal bodies that have one.
 *
 * Bodies outside the seven are skipped rather than given a substitute glyph.
 * There are seven doubles because there were seven planets, and handing the
 * North Node a spare letter would make the alphabet look like it covers a sky
 * it was never asked about — the same reason letterForBody returns null.
 */
export function natalLetterMarks(
  positions: readonly NatalPosition[],
  colorOf: (bodyId: string) => string,
  scheme: Attribution = "yetzirah",
  includeModernOuters = false,
): GlyphMark[] {
  const out: GlyphMark[] = [];
  for (const p of positions) {
    const hit = letterForBody(p.id, scheme, includeModernOuters);
    if (!hit) continue;
    const lon = norm360(p.longitude);
    const l: HebrewLetter = hit.letter;
    const title =
      `${l.glyph} ${l.name} · ${p.id} ${lon.toFixed(1)}° · path ${l.path} (${l.joins}) · ${l.value}` +
      (hit.traditional ? "" : " · modern attribution");
    for (const axis of ["theta", "phi"] as const) {
      out.push({
        theta: axis === "theta" ? lon : BODY_RING,
        phi: axis === "theta" ? BODY_RING : lon,
        glyph: l.glyph,
        color: colorOf(p.id),
        // A double is a body, and a body outranks the arc it stands in.
        size: hit.traditional ? 1.25 : 1.1,
        title,
      });
    }
  }
  return out;
}
