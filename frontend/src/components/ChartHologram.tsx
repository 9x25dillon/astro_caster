// components/ChartHologram.tsx — the chart's second dimension, under the wheel.
//
// The wheel draws every body on ONE circle, and every aspect as a chord across
// it. The torus is the product of that circle with itself, on which the same
// two facts are a LATTICE and a family of diagonal circles (lib/torusLayers).
// A chord in the wheel and an aspect circle on the torus are the same statement
// seen from two places, so putting one under the other is not a backdrop — it
// is the chart's own missing axis.
//
// THE ALIGNMENT IS EXACT, AND IT IS THE REASON THIS IS NOT DECORATION.
//
// The wheel places a longitude at screen angle 180° − (λ − Asc) and reads the
// result through polar(), which is (cos, sin) with SVG's y pointing down. The
// torus places its θ at (cos θ, −sin θ) after projection, for the same reason
// inverted. Setting
//
//     θ(λ) = ((λ − Asc) mod 360) − 180
//
// makes the two land on the same screen angle for every longitude, so a natal
// body's meridian on the torus points out of the wheel's centre at exactly the
// degree the wheel marks it. `torusTheta` below is that one line, and
// test/hologram.test.ts pins it against lonToAngle rather than trusting it.
//
// Which is also why the camera does not yaw. A slow turn would look better and
// would cost the only thing here worth having: yaw slides θ off the wheel's
// angle and the correspondence stops being visible. The idle motion is carried
// by the HUD instead — scanlines and flicker, in CSS, over the top — and the
// underlay itself moves only when the chart or the reader's attention does.
//
// Drawn on canvas rather than into the SVG: 56 natal circles at 48 segments is
// ~2700 strokes, which is nothing for canvas and thousands of DOM nodes for
// SVG. It redraws on change, not on a clock.

import React, { useEffect, useMemo, useRef } from "react";
import { embedDonut, project, type Camera } from "../lib/torus";
import { natalLines, type NatalPosition } from "../lib/torusLayers";
import { beatHz, droneHz } from "../lib/resonance";
import { CHANNEL_A, CHANNEL_B, chromaticSplit, depthFade } from "../lib/hologram";

interface Props {
  size: number;
  ascendant: number;
  positions: readonly NatalPosition[];
  /** Aspect separations to draw as diagonal circles, in degrees. */
  aspectAngles: readonly number[];
  /** The body under the reader's attention — its lattice comes forward. */
  focusId?: string | null;
  /** The wheel's zoom/pan, mirrored so the two layers cannot drift apart. */
  view: { k: number; tx: number; ty: number };
}

/** The wheel's screen angle for a longitude, as a torus θ. See the header. */
export function torusTheta(lonDeg: number, ascDeg: number): number {
  return ((((lonDeg - ascDeg) % 360) + 360) % 360) - 180;
}

// A gentle tilt: enough that the ring reads as an object with a far side,
// little enough that the left-right alignment with the wheel stays obvious.
const PITCH_DEG = -24;
// The donut spans 2.22 in its own units. 0.62 lands its outer edge just inside
// the planet ring (rPlanet = 0.59R) rather than out under the house numerals:
// at 0.72 the lattice ran straight through the glyph layer and the two fought,
// which a screenshot showed and no test could. The underlay's business is the
// core, where the aspect chords are — those are the lines it is the other half
// of — so that is where it lives.
const FILL = 0.62;

export const ChartHologram: React.FC<Props> = ({
  size, ascendant, positions, aspectAngles, focusId, view,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // How sharply each body draws. A body in tight aspect with its nearest
  // neighbour beats slowly, and a slow beat is a small chromatic split — so the
  // parts of the chart that are most exact are the parts that resolve, and the
  // fringes gather on the bodies standing alone. Same number the field sounds.
  const splitOf = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of positions) {
      let best = Infinity;
      for (const q of positions) {
        if (q.id === p.id) continue;
        best = Math.min(best, beatHz(droneHz(p.longitude), droneHz(q.longitude)));
      }
      m.set(p.id, chromaticSplit(Number.isFinite(best) ? best : 0));
    }
    return m;
  }, [positions]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    const px = dpr;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const cam: Camera = {
      rotXDeg: PITCH_DEG,
      rotYDeg: 0, // never — see the header
      dist: 7,
      scale: ((size / 2) * FILL * dpr) / 2.22,
    };
    const P = (th: number, ph: number) => project(embedDonut(th, ph), cam);

    // One great circle at a fixed longitude on one axis — the whole file is
    // built from this, because on a product of two circles a single longitude
    // IS a circle.
    const circle = (lon: number, axis: "theta" | "phi", steps = 64) => {
      const pts: Array<[number, number]> = [];
      for (let i = 0; i <= steps; i++) {
        const a = (i / steps) * 360;
        pts.push(axis === "theta" ? [lon, a] : [a, lon]);
      }
      return pts;
    };

    const stroke = (
      pts: Array<[number, number]>, color: string, width: number, alpha: number,
      dx = 0, dy = 0,
    ) => {
      let prev = P(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) {
        const cur = P(pts[i][0], pts[i][1]);
        const depth = (prev.depth + cur.depth) / 2;
        ctx.globalAlpha = alpha * depthFade(depth);
        ctx.strokeStyle = color;
        ctx.lineWidth = width * px;
        ctx.beginPath();
        ctx.moveTo(cx + prev.x + dx * px, cy + prev.y + dy * px);
        ctx.lineTo(cx + cur.x + dx * px, cy + cur.y + dy * px);
        ctx.stroke();
        prev = cur;
      }
    };

    // 1 · the surface itself, on sign cusps — the ground the rest sits on
    for (let g = 0; g < 360; g += 30) {
      stroke(circle(torusTheta(g, ascendant), "theta", 40), "#7fd6e8", 0.7, 0.20);
      stroke(circle(g, "phi", 40), "#7fd6e8", 0.7, 0.13);
    }

    // 2 · the aspect circles — the diagonals whose shadows are the wheel's
    //     chords. Drawn under the lattice so the lattice reads as the figure.
    for (const angle of aspectAngles) {
      const targets = angle === 0 || angle === 180 ? [angle] : [angle, -angle];
      for (const t of targets) {
        const pts: Array<[number, number]> = [];
        for (let i = 0; i <= 96; i++) {
          const a = (i / 96) * 360;
          pts.push([a, a - t]);
        }
        stroke(pts, "#c9a84c", 0.8, 0.26);
      }
    }

    // 3 · the natal lattice, split into its two channels. A body the reader is
    //     attending to comes forward; the rest stay as context rather than
    //     dimming to nothing, because they are still true.
    // Oppositions are left out here, unlike on the torus panel. There they earn
    // their lines acoustically — 180° is one octave under the bedrock map, the
    // only other ratio that can lock — but nothing in this wheel rings, and 56
    // circles over a chart that already carries an aspect web is a thicket the
    // reader has to see past rather than a structure they can read.
    //
    // The two axes are also not equal here, which they are on the torus panel.
    // A MERIDIAN is the line that points out of the centre at the body's own
    // degree — it is the whole alignment argument, and the thing a reader can
    // check against the wheel above it. A parallel is the same fact on the axis
    // this chart does not have, so it stays as depth rather than as a claim.
    for (const l of natalLines(positions, () => "#e0c578", false)) {
      const isFocus = !!focusId && l.label.startsWith(focusId);
      const meridian = l.axis === "theta";
      const base = meridian ? 0.66 : 0.14;
      const alpha = isFocus ? Math.min(1, base * 2.2) : base;
      const width = (meridian ? 1 : 0.55) * (isFocus ? 1.9 : 1);
      const lon = meridian ? torusTheta(l.lon, ascendant) : l.lon;
      const pts = circle(lon, l.axis);
      const d = splitOf.get(l.label.replace(" ☍", "")) ?? 0;
      if (d >= 0.05) {
        stroke(pts, CHANNEL_A, width, alpha * 0.5, -d, -d * 0.4);
        stroke(pts, CHANNEL_B, width, alpha * 0.5, d, d * 0.4);
      }
      stroke(pts, isFocus ? "#f2dca0" : "#e0c578", width, alpha);
    }

    ctx.globalAlpha = 1;
  }, [size, ascendant, positions, aspectAngles, focusId, splitOf]);

  return (
    <canvas
      ref={canvasRef}
      className="chart-hologram"
      aria-hidden="true"
      style={{
        // Percentages, not the pixel size. The stage shrinks with the viewport
        // and the SVG shrinks with it (max-width on .wheel-area svg); a canvas
        // pinned to 720px would not, and the two layers would come apart on
        // exactly the screens this ships to as an APK. The backing store stays
        // at size × dpr, so the drawing is unchanged — only its box scales.
        width: "100%",
        height: "100%",
        // The wheel's own transform, mirrored. Its SVG group is
        // translate(tx ty) scale(k) about the viewBox centre, and the viewBox is
        // 1:1 with pixels, so the same operations about the element's centre put
        // the two layers in lockstep through a pinch.
        transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.k})`,
        transformOrigin: "center",
      }}
    />
  );
};
