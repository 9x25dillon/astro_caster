// crystal.ts — the thirty-two, twice.
//
// There are exactly 32 crystallographic point groups, and the Sefer Yetzirah
// opens by counting exactly 32 paths of wisdom — ten sefirot and twenty-two
// letters. Two closed lists of the same length is a coincidence until the
// ORDERINGS agree, and they do, for a reason neither tradition arranged:
//
//   · Path 1 is Kether, the undifferentiated point. Point group 1 is the
//     identity alone — one operation, no symmetry to speak of.
//   · Path 32 is Tav, Yesod–Malkuth, the path of manifestation. Point group
//     m-3m is the cubic holohedry, order 48, the most symmetric arrangement
//     matter is allowed to take.
//
// So the point groups sorted by the standard crystallographic sequence, from
// the least symmetric system to the most, run alongside the paths from unity to
// the formed world. The count even splits where it must: triclinic, monoclinic,
// orthorhombic and the two lowest tetragonal groups come to 2 + 3 + 3 + 2 = 10,
// which is the sefirot, leaving 22 for the letters. That cut falls INSIDE the
// tetragonal system rather than on a system boundary, and this file says so
// rather than rounding it off — see PATH_NAMES.
//
// The second correspondence is the one that is not a coincidence at all.
//
// The crystallographic restriction theorem permits rotation axes of order 1, 2,
// 3, 4 and 6, and no others: no lattice can carry a 5-fold or an 8-fold or a
// 12-fold axis, because those angles cannot tile the plane. The astrological
// harmonics are the same numbers. A conjunction is the 1st harmonic, an
// opposition the 2nd, a trine the 3rd, a square the 4th, a sextile the 6th —
// and the quintile is the 5th, the semisquare the 8th, the quincunx and
// semisextile the 12th.
//
// Which means the traditional split between MAJOR and MINOR aspects — a
// division astrology inherited without a stated reason, and which this app
// already hard-codes as a set of five names — is exactly the split the
// restriction theorem makes. The five aspects that crystallize are the five
// majors. The minors are the aspects with no lattice; a 5-fold arrangement of
// matter is a quasicrystal, which is real, was not believed to be possible
// until 1982, and has no repeating cell. That is the whole feature in one
// sentence, and it was true before anyone wrote this file.
//
// The triclinic system is the low-symmetry end and gets the work the spec asks
// of it: its two groups (1 and -1) are what a node falls back to when nothing
// in the chart claims a symmetry for it, and its lattice — three unequal axes,
// three angles none of them right — is the deformation this file applies to the
// 4D torus. The cell is not invented: its three interaxial angles ARE three
// pairwise separations of the bodies on screen, so the crystal is triclinic
// exactly when the chart is asymmetric, and degenerates toward higher symmetry
// as the bodies come into aspect.
//
// Pure math and tables. Geometry consumes this (lib/torus4 takes the matrix);
// the component draws.

import { HEBREW_LETTERS, letterForBody, type Attribution, type HebrewLetter } from "./hebrew";

export type CrystalSystem =
  | "triclinic" | "monoclinic" | "orthorhombic"
  | "tetragonal" | "trigonal" | "hexagonal" | "cubic";

export interface PointGroup {
  /** Hermann–Mauguin symbol, the crystallographer's name for it. */
  hm: string;
  /** Schoenflies symbol, the spectroscopist's. */
  schoenflies: string;
  system: CrystalSystem;
  /** Number of symmetry operations in the group. */
  order: number;
  /** Highest PROPER rotation axis — the number the restriction theorem bounds.
   *  Note this is not always the digit in the symbol: -4 has a 4-fold
   *  rotoinversion but only a 2-fold proper rotation, and -6 only a 3-fold. */
  axis: 1 | 2 | 3 | 4 | 6;
  /** Has a centre of inversion. An opposition is an inversion, which is why
   *  this flag is the one the chart can actually switch. */
  inversion: boolean;
  /** How many mirror planes. */
  mirrors: number;
  /** Its path, 1–32. Equal to its index in this list. */
  path: number;
}

/**
 * The 32, in the standard crystallographic sequence: system by system from
 * triclinic to cubic, and within a system in International Tables order.
 *
 * The index in this array IS the path number, so the array must never be
 * reordered — a test pins the sequence and the total.
 */
export const POINT_GROUPS: readonly PointGroup[] = ([
  ["1",     "C1",  "triclinic",    1,  1, false, 0],
  ["-1",    "Ci",  "triclinic",    2,  1, true,  0],
  ["2",     "C2",  "monoclinic",   2,  2, false, 0],
  ["m",     "Cs",  "monoclinic",   2,  1, false, 1],
  ["2/m",   "C2h", "monoclinic",   4,  2, true,  1],
  ["222",   "D2",  "orthorhombic", 4,  2, false, 0],
  ["mm2",   "C2v", "orthorhombic", 4,  2, false, 2],
  ["mmm",   "D2h", "orthorhombic", 8,  2, true,  3],
  ["4",     "C4",  "tetragonal",   4,  4, false, 0],
  ["-4",    "S4",  "tetragonal",   4,  2, false, 0],
  ["4/m",   "C4h", "tetragonal",   8,  4, true,  1],
  ["422",   "D4",  "tetragonal",   8,  4, false, 0],
  ["4mm",   "C4v", "tetragonal",   8,  4, false, 4],
  ["-42m",  "D2d", "tetragonal",   8,  2, false, 2],
  ["4/mmm", "D4h", "tetragonal",  16,  4, true,  5],
  ["3",     "C3",  "trigonal",     3,  3, false, 0],
  ["-3",    "S6",  "trigonal",     6,  3, true,  0],
  ["32",    "D3",  "trigonal",     6,  3, false, 0],
  ["3m",    "C3v", "trigonal",     6,  3, false, 3],
  ["-3m",   "D3d", "trigonal",    12,  3, true,  3],
  ["6",     "C6",  "hexagonal",    6,  6, false, 0],
  ["-6",    "C3h", "hexagonal",    6,  3, false, 1],
  ["6/m",   "C6h", "hexagonal",   12,  6, true,  1],
  ["622",   "D6",  "hexagonal",   12,  6, false, 0],
  ["6mm",   "C6v", "hexagonal",   12,  6, false, 6],
  ["-6m2",  "D3h", "hexagonal",   12,  3, false, 4],
  ["6/mmm", "D6h", "hexagonal",   24,  6, true,  7],
  ["23",    "T",   "cubic",       12,  3, false, 0],
  ["m-3",   "Th",  "cubic",       24,  3, true,  3],
  ["432",   "O",   "cubic",       24,  4, false, 0],
  ["-43m",  "Td",  "cubic",       24,  3, false, 6],
  ["m-3m",  "Oh",  "cubic",       48,  4, true,  9],
] as const).map(([hm, schoenflies, system, order, axis, inversion, mirrors], i) => ({
  hm, schoenflies, system: system as CrystalSystem, order,
  axis: axis as PointGroup["axis"], inversion, mirrors, path: i + 1,
}));

const BY_HM = new Map(POINT_GROUPS.map((g) => [g.hm, g]));

export function pointGroup(hm: string): PointGroup {
  const g = BY_HM.get(hm);
  if (!g) throw new Error(`crystal.ts: no point group ${hm}`);
  return g;
}

/** The seven systems, least symmetric first — the order POINT_GROUPS follows. */
export const CRYSTAL_SYSTEMS: readonly CrystalSystem[] = [
  "triclinic", "monoclinic", "orthorhombic", "tetragonal", "trigonal",
  "hexagonal", "cubic",
];

/** The holohedry of a system: its highest-symmetry group, the full symmetry of
 *  the lattice itself rather than of anything sitting in it. */
export function holohedry(system: CrystalSystem): PointGroup {
  return POINT_GROUPS.filter((g) => g.system === system)
    .reduce((a, b) => (b.order > a.order ? b : a));
}

// ---------------------------------------------------------------------------
// The 32 paths
// ---------------------------------------------------------------------------

const SEFIROT = [
  "Kether", "Chokmah", "Binah", "Chesed", "Geburah",
  "Tiphereth", "Netzach", "Hod", "Yesod", "Malkuth",
];

/** What a path is called: a sefirah for 1–10, a letter for 11–32. */
export function pathName(path: number): string {
  if (path >= 1 && path <= 10) return SEFIROT[path - 1];
  const l = HEBREW_LETTERS[path - 11];
  return l ? `${l.glyph} ${l.name}` : `path ${path}`;
}

export const PATH_NAMES: readonly string[] =
  Array.from({ length: 32 }, (_, i) => pathName(i + 1));

/** The point group standing at a path. The two lists are the same length and
 *  the same order, so this is an index, not a lookup table. */
export function pointGroupForPath(path: number): PointGroup {
  return POINT_GROUPS[Math.max(0, Math.min(31, Math.round(path) - 1))];
}

/** A letter's group — the one at its own path, 11–32. */
export function pointGroupForLetter(letter: HebrewLetter): PointGroup {
  return pointGroupForPath(letter.path);
}

// ---------------------------------------------------------------------------
// Aspects — the restriction theorem, read as astrology
// ---------------------------------------------------------------------------

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * The harmonic an aspect angle belongs to: the n for which the angle is a
 * multiple of 360/n and no smaller n will do.
 *
 * Conjunction 0° is the 1st by convention (and by the algebra: every body is
 * its own conjunction). Everything else falls out of the arithmetic —
 * 120° → 3, 90° → 4, 60° → 6, 72° → 5, 45° → 8, 150° → 12.
 */
export function harmonicOf(angleDeg: number): number {
  const a = Math.round(Math.abs(angleDeg)) % 360;
  if (a === 0) return 1;
  return 360 / gcd(a, 360);
}

/** The five orders a lattice is allowed to have. Not a style choice: 5-fold and
 *  8-fold and 12-fold rotations cannot tile a plane, so no crystal has one. */
export const CRYSTALLOGRAPHIC_ORDERS: readonly number[] = [1, 2, 3, 4, 6];

export function isCrystallographic(n: number): boolean {
  return CRYSTALLOGRAPHIC_ORDERS.includes(n);
}

/**
 * The crystal system an aspect belongs to, by its harmonic.
 *
 * Systems are classified by their highest proper rotation, and those are
 * exactly 1 (triclinic), 2 (monoclinic and orthorhombic), 3 (trigonal),
 * 4 (tetragonal) and 6 (hexagonal). Cubic is the odd one out — it is the only
 * system with more than one high-order axis, so no single aspect reaches it and
 * it is left to the multi-body patterns below.
 *
 * Returns null for a non-crystallographic harmonic, which is not a failure to
 * classify: it is the finding. The quintile, semisquare, sesquiquadrate,
 * quincunx and semisextile have no lattice, and the aspects that DO have one
 * are precisely the five this app already calls major.
 */
export function systemsForAspect(angleDeg: number): CrystalSystem[] | null {
  const n = harmonicOf(angleDeg);
  if (!isCrystallographic(n)) return null;
  switch (n) {
    case 1: return ["triclinic"];
    case 2: return ["monoclinic", "orthorhombic"];
    case 3: return ["trigonal"];
    case 4: return ["tetragonal"];
    default: return ["hexagonal"];
  }
}

/** Every point group an aspect can reach, most symmetric first. */
export function familyForAspect(angleDeg: number): PointGroup[] {
  const systems = systemsForAspect(angleDeg);
  if (!systems) return [];
  return POINT_GROUPS.filter((g) => systems.includes(g.system))
    .sort((a, b) => b.order - a.order);
}

export interface AspectCrystal {
  group: PointGroup;
  /** How much of the family's symmetry survived, 1 at exact. */
  retained: number;
  harmonic: number;
}

/**
 * The group an aspect actually carries, given how far off exact it is.
 *
 * An exact aspect gets the holohedry — the full symmetry of the lattice. Widen
 * the orb and the group steps down through its family, which is what strain
 * does to a real crystal: operations stop being satisfied one at a time, and
 * the symbol shortens. At the edge of orb only the bare rotation axis is left.
 *
 * Returns null for the aspects with no lattice, and the caller should say so
 * rather than substituting the nearest one that has one.
 */
export function crystalForAspect(
  angleDeg: number,
  orbDeg: number,
  maxOrbDeg: number,
): AspectCrystal | null {
  const family = familyForAspect(angleDeg);
  if (!family.length) return null;
  const t = maxOrbDeg > 0 ? Math.max(0, Math.min(1, Math.abs(orbDeg) / maxOrbDeg)) : 0;
  const idx = Math.min(family.length - 1, Math.floor(t * family.length));
  return { group: family[idx], retained: 1 - t, harmonic: harmonicOf(angleDeg) };
}

// ---------------------------------------------------------------------------
// The multi-body patterns — the only route to cubic
// ---------------------------------------------------------------------------

/**
 * A configuration reaches cubic because cubic is the one system with several
 * high-order axes, and a pattern is the one thing in a chart with several axes.
 *
 * Unlike everything above, this table is a READING rather than a derivation:
 * each line is an argument about a configuration's symmetry, and a different
 * reading would order them differently. The arguments, in order —
 *
 *   Stellium    bodies piled in one place, nothing articulated: the bare
 *               rotation group, no mirrors, no centre.
 *   Grand Trine three bodies at 120° lying in one plane. A plane of bodies is a
 *               mirror, and there is no opposition anywhere in it, so no centre
 *               of inversion: 3-fold, mirrors, no inversion — Td exactly.
 *   Kite        the grand trine with an opposition added, and an opposition IS
 *               an inversion (λ → λ + 180 is the inversion of the circle), so
 *               it is the grand trine's group with a centre put in.
 *   T-Square    a 4-fold axis with one arm missing. Inverting the apex lands
 *               where no body is, so it is NOT centrosymmetric despite carrying
 *               an opposition — the pure rotation group.
 *   Grand Cross the fourth arm arrives and the centre comes back: the holohedry,
 *               order 48, the most symmetric arrangement there is. Path 32.
 *   Yod         built from quincunxes, which are 12-fold. No lattice permits a
 *               12-fold axis, so the Yod has no crystal at all — the same
 *               finding as the quintile, arriving from the other direction.
 */
export const PATTERN_GROUPS: Readonly<Record<string, string | null>> = {
  "Stellium": "23",
  "Grand Trine": "-43m",
  "Kite": "m-3",
  "T-Square": "432",
  "Grand Cross": "m-3m",
  "Yod": null,
};

export function crystalForPattern(patternType: string): PointGroup | null {
  const hm = PATTERN_GROUPS[patternType];
  return hm ? pointGroup(hm) : null;
}

// ---------------------------------------------------------------------------
// Standing nodes — where the paths are actually read
// ---------------------------------------------------------------------------

/**
 * The group a standing node carries.
 *
 * A node on this surface is a transiting body arriving on a natal one: the
 * moment two drones lock and the beat between them falls to zero, which is
 * what a standing wave's node is. It takes the group at its natal body's path.
 *
 * Bodies with no letter — the Nodes, Chiron, Lilith, the angles — fall to
 * triclinic, and to which of its two groups by the one thing the node itself
 * knows: an opposition is an inversion, so an opposition node gets -1, the
 * centrosymmetric group, and a conjunction node gets 1, the identity alone.
 * That is not a default standing in for a missing answer. A body the alphabet
 * has no letter for genuinely has no symmetry to claim, and 1 is the group of
 * having none.
 */
export interface NodeCrystal {
  group: PointGroup;
  path: number;
  pathName: string;
  /** False when the node fell through to triclinic for want of a letter. */
  lettered: boolean;
  letter: HebrewLetter | null;
}

export function crystalForNode(
  natalBodyId: string,
  opposition: boolean,
  scheme: Attribution = "yetzirah",
  includeModernOuters = false,
): NodeCrystal {
  const hit = letterForBody(natalBodyId, scheme, includeModernOuters);
  if (hit) {
    const group = pointGroupForLetter(hit.letter);
    return {
      group, path: group.path, pathName: pathName(group.path),
      lettered: true, letter: hit.letter,
    };
  }
  const path = opposition ? 2 : 1;
  return {
    group: pointGroupForPath(path), path, pathName: pathName(path),
    lettered: false, letter: null,
  };
}

// ---------------------------------------------------------------------------
// The triclinic lattice — a deformation, not a decoration
// ---------------------------------------------------------------------------

export interface TriclinicCell {
  a: number; b: number; c: number;
  /** Interaxial angles in DEGREES: α between b and c, β between a and c,
   *  γ between a and b. */
  alpha: number; beta: number; gamma: number;
}

/**
 * The angles a cell is allowed, and why the band is narrow.
 *
 * A cell exists only where its normalised volume is real:
 *
 *   V² = 1 − cos²α − cos²β − cos²γ + 2·cosα·cosβ·cosγ  >  0
 *
 * and V² reaches exactly zero when all three angles are 60° or all three are
 * 120° — the two flat degeneracies, where the cell collapses to a plane and the
 * deformation matrix stops being invertible. Separations run the full 0–180°,
 * so they cannot be used raw. Mapping them into [65°, 115°] keeps V² above
 * about 0.31 everywhere, which a test verifies by sweep rather than by
 * argument.
 */
export const CELL_ANGLE_MIN = 65;
export const CELL_ANGLE_MAX = 115;

/** Map a 0–180° separation onto the legal interaxial band. */
export function cellAngleFromSeparation(sepDeg: number): number {
  const t = Math.max(0, Math.min(1, Math.abs(sepDeg) / 180));
  return CELL_ANGLE_MIN + t * (CELL_ANGLE_MAX - CELL_ANGLE_MIN);
}

/** Map a longitude onto an axis length. Distinct longitudes give distinct
 *  axes, so the cell is genuinely triclinic unless two bodies are conjunct —
 *  and then two axes coincide, which is the symmetry rising, correctly. */
export function cellAxisFromLongitude(lonDeg: number): number {
  const r = ((lonDeg % 360) + 360) % 360;
  return 0.75 + 0.5 * (r / 360);
}

/** The normalised unit-cell volume — the V of the orientation matrix. */
export function cellVolume(cell: TriclinicCell): number {
  const D = Math.PI / 180;
  const ca = Math.cos(cell.alpha * D);
  const cb = Math.cos(cell.beta * D);
  const cg = Math.cos(cell.gamma * D);
  const v2 = 1 - ca * ca - cb * cb - cg * cg + 2 * ca * cb * cg;
  return Math.sqrt(Math.max(v2, 0));
}

/**
 * Three bodies' longitudes → one triclinic cell.
 *
 * Nothing here is chosen. The three interaxial angles ARE the three pairwise
 * separations, because a cell's α is the angle between its b and c axes and
 * those axes are bodies B and C — so the angle between them is what the chart
 * already calls their separation. The three lengths are the three longitudes.
 * A chart with no symmetry gives a cell with none, and bodies coming into
 * aspect visibly straighten the cell as they go.
 */
export function cellFromLongitudes(lonA: number, lonB: number, lonC: number): TriclinicCell {
  const sep = (x: number, y: number) => {
    const d = Math.abs((((x - y) % 360) + 360) % 360);
    return d > 180 ? 360 - d : d;
  };
  return {
    a: cellAxisFromLongitude(lonA),
    b: cellAxisFromLongitude(lonB),
    c: cellAxisFromLongitude(lonC),
    alpha: cellAngleFromSeparation(sep(lonB, lonC)),
    beta: cellAngleFromSeparation(sep(lonA, lonC)),
    gamma: cellAngleFromSeparation(sep(lonA, lonB)),
  };
}

/** A cubic cell — the identity of this whole apparatus, for the off switch. */
export const UNIT_CELL: TriclinicCell = {
  a: 1, b: 1, c: 1, alpha: 90, beta: 90, gamma: 90,
};

/**
 * The crystallographic orientation matrix, row-major, extended to 4D.
 *
 *   ⎡ a   b·cos γ   c·cos β                        0 ⎤
 *   ⎢ 0   b·sin γ   c·(cos α − cos β·cos γ)/sin γ  0 ⎥
 *   ⎢ 0   0         c·V/sin γ                      0 ⎥
 *   ⎣ 0   0         0                              1 ⎦
 *
 * The standard fractional-to-Cartesian matrix, unchanged. The fourth row and
 * column are the identity on purpose: w is the coordinate the projection
 * spends, and skewing it would mean the fade and the shape were arguing about
 * the same axis. The lattice bends the space; the fourth dimension stays the
 * depth it was.
 */
export type Matrix4 = readonly [
  readonly [number, number, number, number],
  readonly [number, number, number, number],
  readonly [number, number, number, number],
  readonly [number, number, number, number],
];

export function triclinicMatrix(cell: TriclinicCell): Matrix4 {
  const D = Math.PI / 180;
  const ca = Math.cos(cell.alpha * D);
  const cb = Math.cos(cell.beta * D);
  const cg = Math.cos(cell.gamma * D);
  const sg = Math.sin(cell.gamma * D);
  const V = cellVolume(cell);
  // γ is clamped into [65°, 115°] upstream, so sin γ ≥ 0.9 and this never
  // divides by anything small. The guard is here anyway because a caller can
  // hand in its own cell, and a NaN matrix would silently blank the canvas.
  const s = Math.abs(sg) < 1e-9 ? 1e-9 : sg;
  return [
    [cell.a, cell.b * cg, cell.c * cb, 0],
    [0, cell.b * sg, (cell.c * (ca - cb * cg)) / s, 0],
    [0, 0, (cell.c * V) / s, 0],
    [0, 0, 0, 1],
  ];
}

/** How far a matrix moves a unit sphere, roughly — used to renormalise the
 *  deformed surface so switching the lattice on does not also change the zoom. */
export function matrixScale(m: Matrix4): number {
  const cols = [0, 1, 2].map((j) => Math.hypot(m[0][j], m[1][j], m[2][j]));
  const mean = (cols[0] + cols[1] + cols[2]) / 3;
  return mean > 1e-9 ? mean : 1;
}

// ---------------------------------------------------------------------------
// The habit — a point group drawn
// ---------------------------------------------------------------------------

/**
 * A point group as a closed outline: the orbit of a small asymmetric motif
 * under the group's action, in the plane tangent to the node.
 *
 * A crystal habit is the orbit of a general FACE, not of a point — which is why
 * the motif is three points rather than one. Under group 1 the orbit is the
 * motif itself and the shard is a shapeless splinter; under -1 it is the
 * splinter and its inversion, so every vertex up-and-right has a partner
 * down-and-left; under 6/mmm it is a twelve-fold rosette. The shape is doing
 * the naming, and a reader can tell 1 from -1 without reading a symbol.
 *
 * This is a SHADOW and should be described as one. A point group acts on three
 * dimensions and this outline lives in two, so what survives is the principal
 * axis, the mirror and the centre — the three things that differ between
 * neighbours in the list. The full group is in the symbol.
 */
export function shardOutline(g: PointGroup): Array<[number, number]> {
  const n = g.axis;
  const mirrored = g.mirrors > 0;
  // The motif must fit inside one asymmetric unit or the orbit overlaps itself:
  // a sector of 360/n, halved again when a mirror doubles the group.
  const sector = 360 / (n * (mirrored ? 2 : 1));
  const motif: Array<[number, number]> = [
    [1, sector * 0.16],
    [0.58, sector * 0.5],
    [0.86, sector * 0.84],
  ];

  const pts: Array<[number, number]> = [];
  const at = (r: number, deg: number) => {
    const t = (deg * Math.PI) / 180;
    pts.push([r * Math.cos(t), r * Math.sin(t)]);
  };
  for (let k = 0; k < n; k++) {
    const rot = (k * 360) / n;
    for (const [r, th] of motif) {
      at(r, rot + th);
      if (mirrored) at(r, rot - th);
    }
  }
  // In the plane, inversion IS the half turn, so an even-fold axis already
  // contains it and only the odd ones need it added.
  if (g.inversion && n % 2 === 1) {
    for (const [x, y] of pts.slice()) pts.push([-x, -y]);
  }
  // Drawn as a ring, so the vertices have to be in angular order — otherwise
  // the same set of points reads as a scribble rather than a habit.
  return pts.sort((p, q) => Math.atan2(p[1], p[0]) - Math.atan2(q[1], q[0]));
}
