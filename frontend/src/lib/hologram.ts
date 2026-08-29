// hologram.ts — the holographic treatment, as arithmetic.
//
// A hologram is not a look. It is a recorded INTERFERENCE PATTERN: two
// coherent beams meet, their phase difference is written down as fringes, and
// replaying the fringes reconstructs the depth. That is worth saying here
// because this app already computes interference and has since session 37 —
// under the bedrock map (110 Hz · 2^(λ/180), lib/resonance) two bodies' drones
// beat at |f_A − f_B|, which falls to zero exactly when their longitudes meet.
//
// So the chart's fringes are not invented. The chromatic split between the two
// channels IS the beat rate, and it closes to nothing at a conjunction — which
// is the same event the torus draws as a crossing and the field plays as a
// zero-beat. Three instruments, one number.
//
// The rest of the idiom — scanlines, flicker, bloom — is the requested look
// rather than a derivation, and this file says so. What it does NOT do is
// leave the safety of those effects to taste:
//
//   FLICKER IS BOUNDED IN CODE, NOT IN CSS.
//
// Photosensitive epilepsy guidance (WCAG 2.3.1, Harding) puts the danger at
// more than three general flashes per second where the luminance change exceeds
// about 10% of maximum. Everything here runs at 2.4 Hz with a 6% swing — under
// both thresholds by a factor of well over one — and collapses to a constant
// under prefers-reduced-motion. A holographic chart that no one can look at is
// not a holographic chart.
//
// Pure math. No DOM, no canvas, no imports. The components draw.

// ---------------------------------------------------------------------------
// The safety envelope
// ---------------------------------------------------------------------------

/** Flashes per second. WCAG's general-flash threshold is 3; this sits under it
 *  with room, and is slow enough to read as a breathing instrument rather than
 *  a strobe. */
export const FLICKER_HZ = 2.4;

/** Peak-to-peak luminance swing, as a fraction. The guidance draws its line
 *  near 0.10 of maximum relative luminance; 0.06 is comfortably inside, and on
 *  a panel this dim the absolute change is smaller still. */
export const FLICKER_DEPTH = 0.06;

/** Scanline contrast. Kept very low on purpose: a high-contrast stripe field is
 *  its own hazard under the same guidance, and the effect only has to be
 *  perceptible, not legible. */
export const SCANLINE_ALPHA = 0.055;

/** Scanline pitch in CSS pixels — spacing between line centres. */
export const SCANLINE_PITCH = 3;

/** How fast the stripe field drifts, pixels per second. Slow enough that it
 *  never reads as motion, only as a surface that is not quite still. */
export const SCANLINE_DRIFT = 7;

/**
 * The flicker envelope: a luminance multiplier around 1.
 *
 * Two summed sinusoids at incommensurable rates, so it never settles into a
 * pulse the eye can predict and lock onto — a single sine reads as a heartbeat,
 * which is a different (and more insistent) thing than a hologram's instability.
 *
 * The swing is BOUNDED BY FLICKER_DEPTH and approaches it asymptotically rather
 * than reaching it: the two components only align in the limit, so any finite
 * window measures slightly less (0.0596 over four seconds, 0.060 over sixty —
 * measured, and the test samples a long enough window to see it). Under budget
 * is the safe direction, and the bound is what the safety argument needs.
 *
 * `reduced` returns a flat 1: the effect is gone, not slowed. A reader who has
 * asked for no motion has not asked for less motion.
 */
export function flicker(tSeconds: number, reduced = false): number {
  if (reduced) return 1;
  const a = Math.sin(2 * Math.PI * FLICKER_HZ * tSeconds);
  const b = Math.sin(2 * Math.PI * FLICKER_HZ * 0.37 * tSeconds + 1.7);
  return 1 + ((a + b) / 2) * (FLICKER_DEPTH / 2);
}

/** Where the stripe field sits at a given moment, in pixels within one pitch. */
export function scanlinePhase(tSeconds: number, reduced = false): number {
  if (reduced) return 0;
  return (tSeconds * SCANLINE_DRIFT) % SCANLINE_PITCH;
}

// ---------------------------------------------------------------------------
// The fringe — the part that is the data
// ---------------------------------------------------------------------------

/** The widest the two channels ever separate, in CSS pixels at 1× zoom. */
export const MAX_SPLIT_PX = 2.6;

/** Beat rate at which the split saturates. The same 8 Hz the torus uses for the
 *  edge of audible beating: past it two drones stop pulsing and start being an
 *  interval, and the fringe has nothing left to say. */
export const SPLIT_SATURATION_HZ = 8;

/**
 * Chromatic separation from a beat rate.
 *
 * Zero at a zero-beat — so an exact conjunction is the one place the channels
 * converge and the glyph resolves to a single sharp mark. That is the whole
 * argument for driving this from the beat rather than from a constant: the
 * image is sharpest exactly where the chart is most exact, and a reader learns
 * to find conjunctions by looking for the part that is in focus.
 */
export function chromaticSplit(beatHz: number): number {
  const t = Math.min(1, Math.abs(beatHz) / SPLIT_SATURATION_HZ);
  return MAX_SPLIT_PX * t;
}

/** The two channels a split image is written in. Cyan and magenta because they
 *  are what a real chromatic aberration leaves at an edge, and because they sit
 *  either side of the parchment gold this app is otherwise built from — the
 *  chart's own data stays gold and legible between them. */
export const CHANNEL_A = "#4fe3f0";
export const CHANNEL_B = "#ff5ad0";

/**
 * The three passes a split glyph is drawn in: two offset channels, then the
 * true mark on top.
 *
 * `angleRad` aims the separation. Passing the body's own screen angle makes the
 * split radial, so the fringe always points out of the wheel's centre and the
 * ring never looks smeared sideways.
 */
export interface SplitPass {
  dx: number;
  dy: number;
  color: string;
  alpha: number;
}

export function splitPasses(
  beatHz: number,
  angleRad: number,
  baseColor: string,
  alpha = 1,
): SplitPass[] {
  const d = chromaticSplit(beatHz);
  if (d < 0.05) return [{ dx: 0, dy: 0, color: baseColor, alpha }];
  const dx = Math.cos(angleRad) * d;
  const dy = Math.sin(angleRad) * d;
  return [
    { dx: -dx, dy: -dy, color: CHANNEL_A, alpha: alpha * 0.55 },
    { dx, dy, color: CHANNEL_B, alpha: alpha * 0.55 },
    { dx: 0, dy: 0, color: baseColor, alpha },
  ];
}

// ---------------------------------------------------------------------------
// Depth
// ---------------------------------------------------------------------------

/**
 * How solid a thing at a given depth should look.
 *
 * A projected image loses contrast with distance rather than going dark, which
 * is why this returns a multiplier that never reaches zero: the far side of the
 * underlay must stay visible as structure. `floor` is the contrast a thing keeps
 * when it is as far away as this scene goes.
 */
export function depthFade(depth: number, span = 5.6, floor = 0.22): number {
  const t = Math.max(0, Math.min(1, (depth + span / 2) / span));
  return floor + (1 - floor) * t;
}
