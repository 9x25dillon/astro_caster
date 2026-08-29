// torus4.ts — four angles, four dimensions, and the three ways to turn.
//
// torus.ts embeds T² = S¹ × S¹ two ways: the donut, and the Clifford torus,
// which already lives in ℝ⁴ (on the unit 3-sphere) and reaches the screen by
// stereographic projection. This file finishes the job the Clifford embedding
// started, in two steps.
//
// FIRST: rotation. A 4D rotation has no axis — four dimensions do not have one
// — it has a PLANE. There are six coordinate planes, and they fall into exactly
// three pairs that share no coordinate at all:
//
//     {xy, zw}        {xz, yw}        {xw, yz}
//
// Turn both planes of one pair at once and you have a double rotation; turn
// them at the SAME rate and you have an isoclinic rotation, which moves every
// point of space by the same amount and leaves no direction fixed. There are
// three such pairs and the Sefer Yetzirah has three mothers, so lib/hebrew
// hands them out: א {xy, zw}, מ {xz, yw}, ש {xw, yz}.
//
// That first one is not a new feature. On the Clifford torus the xy plane holds
// body A's longitude and the zw plane holds body B's, so Aleph's isoclinic
// rotation IS the Hopf flow this panel has shipped since chapter V — the torus
// sliding along its own aspect circles, never tilting. Mem and Shin mix the two
// bodies' planes together, which no rotation in this app has ever done, and
// under them the surface leaves the pose it has always been drawn in. It also
// passes THROUGH the projection pole and turns inside out on the way. That is
// not a bug to be prevented; it is the one thing four dimensions can do that
// three cannot, and it is the reason to look.
//
// SECOND: a third and fourth body. T⁴ = S¹×S¹×S¹×S¹ needs four angles, and the
// only honest source of a fourth angle is a fourth longitude. House position
// and aspect angle both LOOK like candidates and are not: a house position is
// λ minus a fixed cusp and an aspect angle is λ_A − λ_B, so either one is a
// function of the angles already plotted. Feeding one in as θ₂ pins the curve
// to a 2-dimensional diagonal of T⁴ — a torus wearing two extra coordinates
// that can never disagree with the first two. It would render, and it would be
// a picture of nothing. Two more bodies genuinely free the other two circles.
//
// The nested embedding below is the standard one and it degenerates the right
// way: set the two new radii to zero and it is the donut, coordinate for
// coordinate. That is what makes it safe to offer as a surface.
//
// Pure math. No DOM, no ephemeris. Depends on torus.ts for the shared Vec3 and
// donut radii, and on hebrew.ts for the plane-pair table.

import { DONUT_R, DONUT_r, type Vec3 } from "./torus";
import { MOTHER_PLANE_PAIRS, type Plane4 } from "./hebrew";
import { matrixScale, type Matrix4 } from "./crystal";

const DEG = Math.PI / 180;

export interface Point4 {
  x: number;
  y: number;
  z: number;
  w: number;
}

/** A 4D point brought to 3-space, keeping the coordinate it was flattened by. */
export interface Slice3 extends Vec3 {
  /** The 4th coordinate BEFORE the divide — the hyper-depth, for phasing. */
  w: number;
}

// ---------------------------------------------------------------------------
// Rotation — six planes, three pairs
// ---------------------------------------------------------------------------

const AXES: Record<Plane4, ["x" | "y" | "z" | "w", "x" | "y" | "z" | "w"]> = {
  xy: ["x", "y"], xz: ["x", "z"], xw: ["x", "w"],
  yz: ["y", "z"], yw: ["y", "w"], zw: ["z", "w"],
};

/** Rotate within one coordinate plane, first axis toward second. */
export function rotate4(p: Point4, plane: Plane4, deg: number): Point4 {
  const [i, j] = AXES[plane];
  const a = deg * DEG;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const out: Point4 = { ...p };
  out[i] = p[i] * c - p[j] * s;
  out[j] = p[i] * s + p[j] * c;
  return out;
}

export type Mother = "Aleph" | "Mem" | "Shin";

/**
 * A double rotation in one mother's plane-pair: `alpha` in the first plane,
 * `beta` in the second. Equal angles give the isoclinic rotation.
 *
 * The two planes of a pair share no coordinate, so the two rotations commute
 * and the order here is a matter of writing, not of result — which is what
 * "completely orthogonal" buys, and what makes each mother a single motion
 * rather than a sequence of two.
 */
export function motherRotation(
  p: Point4,
  mother: Mother,
  alphaDeg: number,
  betaDeg = alphaDeg,
): Point4 {
  const [first, second] = MOTHER_PLANE_PAIRS[mother];
  return rotate4(rotate4(p, first, alphaDeg), second, betaDeg);
}

// ---------------------------------------------------------------------------
// The two 4D surfaces
// ---------------------------------------------------------------------------

/** The Clifford torus as a point of ℝ⁴, on the unit 3-sphere: xy holds body
 *  A's longitude, zw holds body B's. Unprojected — rotate first, then flatten. */
export function cliffordPoint(thetaDeg: number, phiDeg: number): Point4 {
  const t = thetaDeg * DEG;
  const p = phiDeg * DEG;
  const k = Math.SQRT1_2;
  return { x: Math.cos(t) * k, y: Math.sin(t) * k, z: Math.cos(p) * k, w: Math.sin(p) * k };
}

export interface HyperRadii {
  /** Distance to the tube's centre — the hole. */
  R1: number;
  /** The tube itself: body B. */
  R2: number;
  /** Body C, swelling and shrinking the tube's distance from the hole. */
  R3: number;
  /** Body D, lifting the tube out of the plane. */
  R4: number;
}

/**
 * The nested hyper-torus, R1 and R2 matched to the donut so the two surfaces
 * are the same object when the second pair is switched off.
 *
 * R3 and R4 are deliberately under half the tube radius. The third and fourth
 * bodies MODULATE a shape the reader already knows how to read; at comparable
 * size they overwhelm it and the surface stops being recognisably a torus.
 */
export const HYPER_RADII: HyperRadii = { R1: DONUT_R, R2: DONUT_r, R3: 0.34, R4: 0.30 };

/**
 * T⁴ → ℝ⁴, four longitudes in, one point out.
 *
 *   x = (R1 + R2·cos b + R3·cos c)·cos a
 *   y = (R1 + R2·cos b + R3·cos c)·sin a
 *   z =  R2·sin b + R4·cos d
 *   w =  R3·sin c + R4·sin d
 *
 * a runs around the hole (body A), b around the tube (body B) — torus.ts's
 * convention, kept — while c and d fold in through the third and fourth. With
 * R3 = R4 = 0 the last two terms vanish, w goes flat, and what is left is
 * embedDonut(a, b) exactly. A test pins that.
 *
 * As an immersion of a 4-manifold into 4-space this self-intersects, and it is
 * meant to: the crossings are where four bodies stand in configurations that
 * differ in a coordinate the projection has spent. Turning a mother separates
 * them.
 */
export function embedHyper(
  aDeg: number, bDeg: number, cDeg: number, dDeg: number,
  r: HyperRadii = HYPER_RADII,
): Point4 {
  const a = aDeg * DEG;
  const b = bDeg * DEG;
  const c = cDeg * DEG;
  const d = dDeg * DEG;
  const ring = r.R1 + r.R2 * Math.cos(b) + r.R3 * Math.cos(c);
  return {
    x: ring * Math.cos(a),
    y: ring * Math.sin(a),
    z: r.R2 * Math.sin(b) + r.R4 * Math.cos(d),
    w: r.R3 * Math.sin(c) + r.R4 * Math.sin(d),
  };
}

// ---------------------------------------------------------------------------
// ℝ⁴ → ℝ³
// ---------------------------------------------------------------------------

// Matches torus.embedClifford. The parity test asserts the two agree to 1e-12,
// so this literal cannot drift away from that one unnoticed.
const CLIFFORD_SCALE = 0.95;

/**
 * How close to the projection pole the divide is allowed to get.
 *
 * Undisturbed, the Clifford torus keeps w ≤ 1/√2, so 1 − w never falls below
 * 0.29 and stereographic projection is exact — no clamp is reached and the
 * Villarceau circles stay true circles. Mem and Shin rotate the surface THROUGH
 * w = 1, where the true projection is infinite. The floor bounds that at about
 * three times the resting scale, so the pole passage renders as the surface
 * rushing outward and folding back through itself, which is what is actually
 * happening, instead of as a screen full of NaN.
 */
const POLE_FLOOR = 0.1;

/** Stereographic projection from (0,0,0,1) — the Clifford route. */
export function stereo3(p: Point4): Slice3 {
  const k = CLIFFORD_SCALE / Math.max(1 - p.w, POLE_FLOOR);
  return { x: p.x * k, y: p.y * k, z: p.z * k, w: p.w };
}

/** Where the hyper-torus's eye sits on the w axis. Clear of the surface at
 *  rest (|w| ≤ R3 + R4 = 0.64), so nothing is clamped until a mother turns. */
export const HYPER_EYE_W = 2.0;
// Brings the projected hyper-torus back to roughly the donut's screen box, so
// switching surfaces does not also change the zoom.
const HYPER_SCALE = 0.62;

/** Perspective divide along w — the same move torus.project makes along z.
 *  At eyeW = 1 this is the textbook x/(1−w); the larger eye is what keeps the
 *  nested surface, whose w is not bounded by 1, clear of its own singularity. */
export function perspective3(p: Point4, eyeW = HYPER_EYE_W): Slice3 {
  const k = (HYPER_SCALE * eyeW) / Math.max(eyeW - p.w, POLE_FLOOR);
  return { x: p.x * k, y: p.y * k, z: p.z * k, w: p.w };
}

// ---------------------------------------------------------------------------
// One entry point
// ---------------------------------------------------------------------------

/**
 * Apply a lattice to a point of ℝ⁴ — the triclinic skew, or any other.
 *
 * The matrix's fourth row and column are the identity (see crystal.triclinicMatrix),
 * so w passes through untouched: the lattice bends the shape, and the fourth
 * dimension stays the depth the projection is about to spend.
 */
export function deform4(p: Point4, m: Matrix4): Point4 {
  const v = [p.x, p.y, p.z, p.w];
  return {
    x: m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2] + m[0][3] * v[3],
    y: m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2] + m[1][3] * v[3],
    z: m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2] + m[2][3] * v[3],
    w: m[3][0] * v[0] + m[3][1] * v[1] + m[3][2] * v[2] + m[3][3] * v[3],
  };
}

export type Surface = "donut" | "clifford" | "hyper";

/** The four longitudes a point of T⁴ needs. c and d are ignored by the
 *  surfaces that do not have a second pair. */
export interface Angles4 {
  a: number;
  b: number;
  c?: number;
  d?: number;
}

/** A mother's turn, as the panel holds it. */
export interface Spin {
  mother: Mother;
  /** Angle in the pair's first plane. */
  alpha: number;
  /** Angle in its second. Equal to alpha is the isoclinic case — for Aleph,
   *  the Hopf flow. */
  beta?: number;
}

const NO_SPIN: Spin = { mother: "Aleph", alpha: 0, beta: 0 };

/**
 * A point of the chart, wherever it is being drawn.
 *
 * The donut has no fourth dimension to be turned in, so a spin does not reach
 * it — the surface select and the mother select are honestly independent
 * controls, and this is the one combination where one of them does nothing.
 */
export function embed4(
  surface: Surface,
  ang: Angles4,
  spin: Spin = NO_SPIN,
  radii: HyperRadii = HYPER_RADII,
  // The lattice, if one is on. Applied BEFORE the mother turns, because a
  // crystal is a rigid deformed object being rotated — not a rotating object
  // being sheared, which would glue the skew to the viewer's frame and make the
  // deformation look like a property of the camera.
  lattice: Matrix4 | null = null,
): Slice3 {
  if (surface === "donut") {
    const p = embedHyper(ang.a, ang.b, 0, 0, { ...radii, R3: 0, R4: 0 });
    // The donut has no fourth dimension to turn in, but it is still a shape in
    // space, and a lattice deforms space. Renormalised so switching the crystal
    // on skews the surface without also resizing it.
    if (!lattice) return { x: p.x, y: p.y, z: p.z, w: 0 };
    const d = deform4(p, lattice);
    const k = 1 / matrixScale(lattice);
    return { x: d.x * k, y: d.y * k, z: d.z * k, w: 0 };
  }
  const raw = surface === "clifford"
    ? cliffordPoint(ang.a, ang.b)
    : embedHyper(ang.a, ang.b, ang.c ?? 0, ang.d ?? 0, radii);
  const shaped = lattice ? deform4(raw, lattice) : raw;
  const beta = spin.beta ?? spin.alpha;
  const turned = spin.alpha === 0 && beta === 0
    ? shaped
    : motherRotation(shaped, spin.mother, spin.alpha, beta);
  const flat = surface === "clifford" ? stereo3(turned) : perspective3(turned);
  if (!lattice) return flat;
  const k = 1 / matrixScale(lattice);
  return { x: flat.x * k, y: flat.y * k, z: flat.z * k, w: flat.w };
}

/**
 * Opacity from hyper-depth: full at the near side of the fourth dimension,
 * fading as a point folds into it.
 *
 * The spec's phrase for this is right — a body passing into the inner hyper-fold
 * should soften rather than vanish. `floor` is why it softens: a letter at zero
 * alpha is a letter the reader cannot find again, and every glyph here labels a
 * position that is still true when it is hard to see.
 */
export function phaseAlpha(
  w: number,
  wMax = HYPER_RADII.R3 + HYPER_RADII.R4,
  floor = 0.28,
): number {
  if (wMax <= 0) return 1;
  const t = Math.max(-1, Math.min(1, w / wMax));
  return floor + (1 - floor) * (0.5 + 0.5 * t);
}
