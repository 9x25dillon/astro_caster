// TorusPanel.tsx — chapter V's torus geometry: a planet pair as a curve
// winding around T², aspects as the fixed diagonal circles it crosses.
//
// Everything here is deterministic and on-device (lib/torus.ts does the math,
// api/client.localPairTrajectory samples the WASM ephemeris) — there is no
// backend endpoint to fall back FROM. The renderer is hand-rolled canvas-2D
// with painter's-algorithm depth sorting: a few thousand strokes per frame,
// redrawn only while something moves, and not a byte of new dependency.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store/useStore";
import {
  localAspectDefs,
  localPairTrajectory,
  trackEvent,
  TORUS_BODIES,
  type PairTrajectory,
} from "../api/client";
import {
  aspectCirclePath,
  aspectTargets,
  findAspectEvents,
  jdToDate,
  nearestAspect,
  project,
  windings,
  wrap180,
  type AspectAngleDef,
  type AspectEvent,
  type Camera,
} from "../lib/torus";
import {
  embed4,
  phaseAlpha,
  HYPER_RADII,
  type Mother,
  type Spin,
  type Surface,
} from "../lib/torus4";
import {
  cellFromLongitudes,
  crystalForAspect,
  crystalForNode,
  harmonicOf,
  pathName,
  shardOutline,
  triclinicMatrix,
  type Matrix4,
} from "../lib/crystal";
import {
  ATTRIBUTION_LABEL,
  MOTHERS,
  MOTHER_ELEMENTS,
  MOTHER_PLANE_PAIRS,
  letterForBody,
  tileWord,
  type Attribution,
} from "../lib/hebrew";
import {
  beatHz,
  centsBetween,
  droneHz,
  natalDroneHz,
  participatesInSeed,
} from "../lib/resonance";
import { audioSupported, TorusVoice } from "../lib/torusAudio";
import {
  dignityAt,
  houseLines,
  natalCrossings,
  natalLetterMarks,
  natalLines,
  signLetterMarks,
  signLines,
  starLines,
  DIGNITY_STRENGTH,
  type AxisLine,
  type GlyphMark,
} from "../lib/torusLayers";
import { ELEMENT_COLORS } from "../lib/astro";
import { fetchFixedStars, type FixedStarHit } from "../api/client";
import { getSoundtrack } from "../lib/soundtrackStore";

// Same glyphs the engine's PLANET_TABLE carries — UI copy, not a second list.
const BODY_GLYPHS: Record<string, string> = {
  Sun: "☉", Moon: "☽", Mercury: "☿", Venus: "♀", Mars: "♂", Jupiter: "♃",
  Saturn: "♄", Uranus: "♅", Neptune: "♆", Pluto: "♇",
  "North Node": "☊", Chiron: "⚷", Lilith: "⚸",
};

const ASPECT_GLYPHS: Record<string, string> = {
  Conjunction: "☌", Opposition: "☍", Trine: "△", Square: "□", Sextile: "✶",
  Quincunx: "⚻", Semisextile: "⚺", Sesquiquadrate: "⚼", Semisquare: "∠",
  Quintile: "Q",
};

const MAJORS = new Set(["Conjunction", "Opposition", "Trine", "Square", "Sextile"]);

const WINDOWS = [
  { label: "3 months", days: 91 },
  { label: "1 year", days: 365 },
  { label: "4 years", days: 1461 },
  { label: "12 years", days: 4383 },
];

interface Seg {
  x1: number; y1: number; x2: number; y2: number;
  depth: number; color: string; alpha: number; width: number;
}

interface Dot {
  x: number; y: number; depth: number; r: number;
  color: string; label?: string; ring?: boolean;
}

const JD_UNIX = 2440587.5;
const nowJd = () => Date.now() / 86400000 + JD_UNIX;

function isoDay(jd: number): string {
  return jdToDate(jd).toISOString().slice(0, 10);
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

const prefersReducedMotion = (): boolean => {
  try {
    return window.matchMedia?.(REDUCED_MOTION_QUERY).matches ?? false;
  } catch {
    return false;
  }
};

// ── The teaching layers ─────────────────────────────────────────────────────
//
// One rule places all of them: the torus is a PRODUCT of two circles, so an
// idea's arity decides its shape. A single longitude is a CIRCLE on each axis;
// an arc partition is a GRID; a per-body property is a STRIPE FIELD along one
// axis; a pair relation is a DIAGONAL (the aspect circles, already drawn).
// The maths lives in lib/torusLayers; this file only draws it.
type LayerId = "signs" | "dignity" | "natal" | "houses" | "hebrew" | "crystal" | "stars";

/** What each layer is, in the sentence a reader gets when they switch it on.
 *  Written to say what the SHAPE means, not what the feature is called —
 *  a legend that only names things teaches nothing the label did not. */
const LAYER_COPY: Record<LayerId, { label: string; note: string }> = {
  signs: {
    label: "Signs",
    note:
      "The grid was always here — the wireframe sits on sign cusps. Each tile " +
      "is one sign-pair, so a whole-sign aspect is a TILE, not a diagonal. " +
      "Cardinal cusps are drawn heavier: they carry the equinox-solstice frame.",
  },
  dignity: {
    label: "Dignity terrain",
    note:
      "Dignity depends on where a body IS, so it varies along one axis alone — " +
      "which is exactly what makes it a terrain rather than a table. Warm and " +
      "bright is domicile or exaltation, cold and dim is detriment or fall. " +
      "Watch the trajectory climb and sink through it.",
  },
  natal: {
    label: "Natal field",
    note:
      "Each natal body is a fixed longitude, so it is a whole CIRCLE here: a " +
      "meridian where this pair's first body conjuncts it, a parallel where the " +
      "second does. Their crossings are marked. This is the same object as the " +
      "sound — under the bedrock map two drones beat at zero exactly when the " +
      "longitudes meet, so every crossing is a zero-beat you can hear. The " +
      "fainter lines are oppositions: 180° is one octave, the only other ratio " +
      "this map makes rational, and the only other aspect that can lock.",
  },
  houses: {
    label: "Houses",
    note:
      "The same construction as the signs and deliberately NOT an even grid — " +
      "away from the equator Placidus cusps are markedly unequal, and drawing " +
      "twelve equal arcs would be a falsehood on the charts where houses matter " +
      "most. The angles are heavier.",
  },
  hebrew: {
    label: "Hebrew letters",
    note:
      "The Sefer Yetzirah splits its alphabet 3 + 7 + 12, and this surface was " +
      "already split the same way. The twelve ELEMENTALS are signs, so each " +
      "sits at the middle of its 30° arc on both axes — the pair standing over " +
      "any point names the tile the pair is in, and their gematria is the one " +
      "number here that survives every rotation. The seven DOUBLES are the " +
      "classical planets, so each rides the circle its natal longitude already " +
      "draws. The three MOTHERS are elements, which are not positions at all — " +
      "they are how the surface TURNS. There are exactly three ways to split " +
      "four dimensions into two planes that share no coordinate, and Aleph's " +
      "is the pair the Hopf flow has been running in since chapter V. Bodies " +
      "outside the seven get no letter, because the alphabet has none for them.",
  },
  crystal: {
    label: "Crystal",
    note:
      "There are 32 crystallographic point groups and the Sefer Yetzirah counts " +
      "32 paths of wisdom — ten sefirot and twenty-two letters — so each path " +
      "carries one group, from the identity alone at Kether to the cubic " +
      "holohedry at Tav. Every standing node grows the shard of its own path: a " +
      "node on a lettered body takes that letter's group, and one on a body the " +
      "alphabet has no letter for falls to triclinic, which is the system with " +
      "no symmetry to claim — the identity for a conjunction, the inversion for " +
      "an opposition, because an opposition IS an inversion. The deeper fact is " +
      "in the aspects: a lattice may only carry 1-, 2-, 3-, 4- and 6-fold axes, " +
      "and those are exactly the harmonics of the conjunction, opposition, " +
      "trine, square and sextile. The five aspects that crystallize are the five " +
      "this app already calls major. The quintile is 5-fold and the quincunx " +
      "12-fold, and no lattice in nature permits either.",
  },
  stars: {
    label: "Fixed stars",
    note:
      "A star is a single longitude, so it takes the same shape a natal body " +
      "does — a thread on each axis. Only stars already contacting this chart " +
      "are drawn: the whole catalogue would be a fog.",
  },
};

// Canvas falls back per-glyph, so the job of this stack is only to reach a face
// that HAS the Hebrew block before landing on a box. No webfont: a 22-letter
// alphabet is not worth a network round trip on a panel that computes offline.
const HEBREW_FONT = '"Noto Sans Hebrew", "Arial Hebrew", "Times New Roman", system-ui, serif';

/** The two extra circles of the T⁴ surface. "—" is not a body: it zeroes that
 *  radius, and with both off the hyper-torus is the donut exactly. */
const NO_BODY = "";

/** The fastest beat still heard AS a beat rather than as a rough low tone.
 *  Above this two drones stop pulsing and start being an interval — so it is
 *  also the point past which a natal line has nothing to say about right now. */
const AUDIBLE_BEAT_HZ = 8;

/** How many standing nodes may grow a shard at once.
 *
 *  Measured, not guessed: a Sun–Moon year puts dozens of crossings inside the
 *  horizon and they arrive in a clump, because the Moon sweeps the whole natal
 *  comb every month. At a dozen shards the habits are distinguishable — you can
 *  see a splinter is not a rosette — and past that they overlap into one smudge
 *  that says a crossing is near and nothing about which group it carries. The
 *  nearest in time win, which is the same rule the crossing dots use. */
const MAX_SHARDS = 12;

/** How many crossings a single scrub jump may ring. A fast drag over a twelve-
 *  year window can span dozens; ringing them all is noise, not information. */
const MAX_RINGS_PER_STEP = 3;

export const TorusPanel: React.FC = () => {
  const birth = useStore((s) => s.birth);
  const chart = useStore((s) => s.chart);
  const setMargin = useStore((s) => s.setMargin);

  const [bodyA, setBodyA] = useState("Sun");
  const [bodyB, setBodyB] = useState("Moon");
  const [days, setDays] = useState(365);
  const [embedding, setEmbedding] = useState<Surface>("donut");
  // The second couple. Off by default — with neither of them the hyper-torus's
  // extra radii are zero and the surface is the donut, so nothing is paid for
  // until something is asked for.
  const [bodyC, setBodyC] = useState<string>(NO_BODY);
  const [bodyD, setBodyD] = useState<string>(NO_BODY);
  const [minors, setMinors] = useState(false);
  const [flowOn, setFlowOn] = useState(false);
  // Which mother is turning. Aleph is the one that was already here.
  const [mother, setMother] = useState<Mother>("Aleph");
  // Whose table the seven doubles come from, and whether the three moderns are
  // allowed onto the mothers. Both are the reader's call: see lib/hebrew.
  const [scheme, setScheme] = useState<Attribution>("yetzirah");
  const [modernOuters, setModernOuters] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [traj, setTraj] = useState<PairTrajectory | null>(null);
  const [defs, setDefs] = useState<AspectAngleDef[]>([]);
  const [tIdx, setTIdx] = useState(0);
  const [selJd, setSelJd] = useState<number | null>(null);
  const [sounding, setSounding] = useState(false);
  const [audioErr, setAudioErr] = useState<string | null>(null);
  // The teaching layers. Off by default and switched on ONE AT A TIME by
  // intent: the surface is already dense with aspect circles and a trajectory,
  // and a reader who turns everything on at once learns nothing. Each toggle
  // says what appeared and why it is that shape.
  const [layers, setLayers] = useState<Record<LayerId, boolean>>({
    signs: false, dignity: false, natal: false, houses: false, hebrew: false,
    crystal: false, stars: false,
  });
  // The lattice. Separate from the shards on purpose: one is a reading OF the
  // chart and the other bends the whole space the chart is drawn in, and a
  // reader should be able to have either without the other.
  const [lattice, setLattice] = useState(false);
  const [stars, setStars] = useState<FixedStarHit[] | null>(null);
  const [starsBusy, setStarsBusy] = useState(false);
  const voiceRef = useRef<TorusVoice | null>(null);
  const lastJdRef = useRef<number | null>(null);

  // ── Cast: sample the pair through time, centred on today ──────────────────
  useEffect(() => {
    let stale = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const [aspectDefs, t] = await Promise.all([
          localAspectDefs(),
          localPairTrajectory(
            birth, bodyA, bodyB,
            new Date(Date.now() - (days / 2) * 86400000), days,
            bodyC || null, bodyD || null
          ),
        ]);
        if (stale) return;
        setDefs(aspectDefs);
        setTraj(t);
        // land the time cursor on today (the window is centred there)
        const jdNow = nowJd();
        let best = 0;
        t.samples.forEach((s, i) => {
          if (Math.abs(s.jd - jdNow) < Math.abs(t.samples[best].jd - jdNow)) best = i;
        });
        setTIdx(best);
        setSelJd(null);
        trackEvent("torus_cast");
      } catch (e) {
        if (!stale) { setErr(String(e)); setTraj(null); }
      } finally {
        if (!stale) setLoading(false);
      }
    })();
    return () => { stale = true; };
  }, [birth, bodyA, bodyB, bodyC, bodyD, days]);

  const activeDefs = useMemo(
    () => defs.filter((d) => minors || MAJORS.has(d.name)),
    [defs, minors]
  );

  const events = useMemo(
    () => (traj ? findAspectEvents(traj.samples, activeDefs) : []),
    [traj, activeDefs]
  );

  const wind = useMemo(() => (traj ? windings(traj.samples) : null), [traj]);

  const colorOf = useMemo(() => {
    const m = new Map(defs.map((d) => [d.name, d.color ?? "#c9a84c"]));
    return (name: string) => m.get(name) ?? "#c9a84c";
  }, [defs]);

  // Every natal body that has a longitude — the field the transiting pair
  // sweeps across. Angles included: the Ascendant and Midheaven are longitudes
  // like any other here, and a transit to them is as real as one to a planet.
  const natalPos = useMemo(
    () => (chart?.planets ?? []).map((p) => ({ id: p.id, longitude: p.longitude })),
    [chart],
  );
  // Natal lines are tinted per BODY, not per aspect: the aspect palette already
  // owns the diagonals, and reusing it here would make two different kinds of
  // circle look like the same kind of fact.
  const bodyTint = useMemo(() => {
    const pal = ["#ffd76e", "#c8e0ff", "#ff9f7a", "#9fe8c0", "#e0a8ff",
                 "#7ec4d8", "#f0b8d0", "#b8d870", "#d8b088", "#a0b8f0"];
    const m = new Map(natalPos.map((p, i) => [p.id, pal[i % pal.length]]));
    return (id: string) => m.get(id) ?? "#ffd76e";
  }, [natalPos]);

  // ── The scene ref: everything the render loop needs, without re-binding ───
  const sceneRef = useRef({
    traj, activeDefs, events, embedding, tIdx, selJd,
    colorOf, bodyA, bodyB,
    ly: layers, ch: chart, st: stars, natalPos, bodyTint, scheme, modernOuters,
    lat: lattice,
  });
  const dirtyRef = useRef(true);
  useEffect(() => {
    sceneRef.current = {
      traj, activeDefs, events, embedding, tIdx, selJd, colorOf, bodyA, bodyB,
      ly: layers, ch: chart, st: stars, natalPos, bodyTint, scheme, modernOuters,
      lat: lattice,
    };
    dirtyRef.current = true;
  }, [traj, activeDefs, events, embedding, tIdx, selJd, colorOf, bodyA, bodyB,
      layers, chart, stars, natalPos, bodyTint, scheme, modernOuters, lattice]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const rotRef = useRef({ x: -28, y: 36 });
  const autoSpinRef = useRef(true); // gentle spin until the reader takes the wheel
  // The mother's turn. `angle` is the isoclinic parameter — the SAME angle in
  // both planes of the pair — which for Aleph is exactly the Hopf angle this
  // ref used to be named after (lib/torus4 proves the two agree to 1e-12).
  const flowRef = useRef<{ angle: number; playing: boolean; mother: Mother }>({
    angle: 0, playing: false, mother: "Aleph",
  });
  const dragRef = useRef<{ px: number; py: number } | null>(null);

  useEffect(() => {
    // The donut has no fourth dimension to be turned in, so the flow simply has
    // nowhere to act there — the control is hidden rather than made to lie.
    flowRef.current.playing = flowOn && embedding !== "donut";
    flowRef.current.mother = mother;
    dirtyRef.current = true;
  }, [flowOn, embedding, mother]);

  // ── Size the canvas to its box, in device pixels ──────────────────────────
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const fit = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = wrap.clientWidth;
      // The panel stays MOUNTED but display:none while another Depths tab is
      // showing — that is what lets its audio survive a tab switch and blend
      // with the field's instead of being cut. A hidden box measures 0, and
      // resizing the canvas to nothing on every switch is pure churn: bail and
      // let the observer fire again when the box comes back.
      if (w === 0) return;
      const h = Math.min(Math.max(Math.round(w * 0.78), 300), 520);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.height = `${h}px`;
      dirtyRef.current = true;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  // ── The render loop — draws only while dirty or animating ─────────────────
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const frame = (ts: number) => {
      const dt = Math.min((ts - last) / 1000, 0.1);
      last = ts;
      if (autoSpinRef.current) {
        rotRef.current.y += dt * 5;
        dirtyRef.current = true;
      }
      if (flowRef.current.playing) {
        flowRef.current.angle = (flowRef.current.angle + dt * 14) % 360;
        dirtyRef.current = true;
      }
      if (dirtyRef.current) {
        dirtyRef.current = false;
        drawScene();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const drawScene = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const {
      traj: t, activeDefs: ds, events: evs, embedding: kind, tIdx: ti,
      selJd: sel, colorOf: col, bodyA, bodyB, ly, ch, st, natalPos, bodyTint,
      scheme: sch, modernOuters: modern, lat,
    } = sceneRef.current;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const cam: Camera = {
      rotXDeg: rotRef.current.x,
      rotYDeg: rotRef.current.y,
      dist: 7,
      scale: Math.min(w, h) / 5.6,
    };
    // The mother's turn, isoclinic: the same angle in both planes of her pair.
    const spin: Spin = kind === "donut"
      ? { mother: "Aleph", alpha: 0, beta: 0 }
      : { mother: flowRef.current.mother, alpha: flowRef.current.angle };
    const cx = w / 2;
    const cy = h / 2;

    // The SLICE. T⁴ has four free angles and this canvas draws a 2-surface, so
    // everything that is a shape on T² — the wireframe, the aspect circles, the
    // natal lattice — is drawn at the third and fourth bodies' CURRENT
    // longitudes. Scrubbing time therefore does two things at once: it walks
    // the cursor along the curve, and it slides the whole surface sideways
    // through the other two circles. The trajectory itself is exempt; it is a
    // curve in the full T⁴ and uses each sample's own c and d.
    const at = t?.samples[Math.max(0, Math.min(ti, t.samples.length - 1))];
    const sliceC = at?.lonC ?? 0;
    const sliceD = at?.lonD ?? 0;

    // The cell. Nothing about it is chosen: its three interaxial angles ARE the
    // three pairwise separations of three real longitudes — the two transiting
    // bodies and, as the third axis, either the third circle when the reader has
    // asked for one or body A's own natal degree, which is always there. So the
    // crystal is triclinic exactly when those three are in no relation, and
    // visibly straightens as they come into aspect.
    let cell: Matrix4 | null = null;
    if (lat && at) {
      const third = at.lonC ?? t?.natal?.lonA ?? at.lonA;
      cell = triclinicMatrix(cellFromLongitudes(at.lonA, at.lonB, third));
    }

    const PAt = (th: number, ph: number, c: number, d: number) => {
      const s4 = embed4(kind, { a: th, b: ph, c, d }, spin, undefined, cell);
      const pr = project(s4, cam);
      return { x: pr.x, y: pr.y, depth: pr.depth, w: s4.w };
    };
    const P = (th: number, ph: number) => PAt(th, ph, sliceC, sliceD);
    const shade = (depth: number) => Math.max(0, Math.min(1, (depth + 2.8) / 5.6));

    // Phasing by the fourth coordinate, but ONLY where a coordinate was really
    // lost. Stereographic projection of the Clifford torus is invertible — w is
    // recoverable from where the point landed, and is already visible as size —
    // so dimming by it there would be saying the same thing twice. The nested
    // hyper-torus is not on a sphere, so its w genuinely does not survive the
    // divide, and fading is the only way it can be seen at all.
    const wMax = HYPER_RADII.R3 + HYPER_RADII.R4;
    const phase = (pw: number) => (kind === "hyper" ? phaseAlpha(pw, wMax) : 1);

    const segs: Seg[] = [];
    // `floor` is how much of a line survives on the FAR side of the surface.
    // The wireframe wants a deep recession (0.35) so the torus reads as a solid
    // shape. A meaning layer does not: its far half is carrying just as much
    // information as its near half, and at 0.35 a natal line already dimmed by
    // its base alpha landed at 0.19 — a line you have to know is there.
    const pushPath = (
      pts: Array<[number, number]>, color: string, width: number, alpha: number,
      floor = 0.35,
    ) => {
      let prev = P(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) {
        const cur = P(pts[i][0], pts[i][1]);
        const depth = (prev.depth + cur.depth) / 2;
        segs.push({
          x1: cx + prev.x, y1: cy + prev.y, x2: cx + cur.x, y2: cy + cur.y,
          depth, color, width, alpha: alpha * (floor + (1 - floor) * shade(depth)),
        });
        prev = cur;
      }
    };

    // Shared between the natal LINES (which brighten near a crossing) and the
    // natal MARKS (which appear near one) — computed once, because they are two
    // views of a single fact and must not disagree about when it happens.
    let crossingsRef: ReturnType<typeof natalCrossings> = [];
    let horizonRef = 0;
    let nowRef = 0;

    // One great circle at a fixed longitude on one axis. Every layer below is
    // built out of this, because on a product of two circles a single
    // longitude IS a circle — see lib/torusLayers for the rule.
    const circleAt = (lon: number, axis: "theta" | "phi", steps = 48) => {
      const pts: Array<[number, number]> = [];
      for (let i = 0; i <= steps; i++) {
        const a = (i / steps) * 360;
        pts.push(axis === "theta" ? [lon, a] : [a, lon]);
      }
      return pts;
    };
    // Layer lines keep a high depth floor: the weight already separates the
    // important line from the ordinary one, and dimming by depth on top of that
    // was compounding two reductions into invisibility.
    const LAYER_FLOOR = 0.62;
    const pushAxisLines = (lines: AxisLine[], baseAlpha: number, baseWidth: number) => {
      for (const l of lines) {
        pushPath(circleAt(l.lon, l.axis), l.color, baseWidth * (0.7 + 0.3 * l.weight),
                 baseAlpha * (0.62 + 0.38 * l.weight), LAYER_FLOOR);
      }
    };

    // Wireframe — the θ grid lines sit on sign cusps of body A (every 30°).
    // Unnamed and uncoloured unless the Signs layer says otherwise; this is the
    // structure the surface has always had, just not the statement.
    if (!ly.signs) {
      for (let g = 0; g < 360; g += 30) {
        pushPath(circleAt(g, "theta"), "#cfd8ff", 0.7, 0.10);
        pushPath(circleAt(g, "phi"), "#cfd8ff", 0.7, 0.07);
      }
    } else {
      const tint = (el: string) => ELEMENT_COLORS[el] ?? "#cfd8ff";
      // Brighter than the anonymous wireframe they replace (0.10) by enough to
      // actually read as a statement — measured against the aspect circles,
      // which are the figure this is the ground for. θ over φ so the two axes
      // stay tellable apart on a surface where both are the same shape.
      pushAxisLines(signLines("theta", tint), 0.85, 1.2);
      pushAxisLines(signLines("phi", tint), 0.62, 1.2);
    }

    // Dignity — a per-body property, so a stripe field along ONE axis each.
    // Drawn as a band of closely-spaced circles through every sign arc rather
    // than as line-per-cusp: the point is the TERRAIN the pair travels, and a
    // terrain needs area, not edges.
    if (ly.dignity) {
      const shadeFor = (strength: number): [string, number] =>
        strength > 0
          ? ["#ffd76e", 0.13 + 0.34 * strength]     // dignified: warm, present
          : strength < 0
            ? ["#5b86c4", 0.13 + 0.30 * -strength]  // debilitated: cold, sunken
            : ["#8892a8", 0.06];                    // neutral: quiet, not absent
      for (let d = 0; d < 360; d += 4) {
        const sa = DIGNITY_STRENGTH[dignityAt(bodyA, d)] ?? 0;
        const [ca, aa] = shadeFor(sa);
        pushPath(circleAt(d, "theta", 40), ca, 4.4, aa, LAYER_FLOOR);
        const sb = DIGNITY_STRENGTH[dignityAt(bodyB, d)] ?? 0;
        const [cb, ab] = shadeFor(sb);
        pushPath(circleAt(d, "phi", 40), cb, 4.4, ab, LAYER_FLOOR);
      }
    }

    // Houses — the same construction, an unequal partition.
    if (ly.houses && ch?.houses?.length) {
      pushAxisLines(houseLines(ch.houses, "theta", "#e0a878"), 0.8, 1.3);
      pushAxisLines(houseLines(ch.houses, "phi", "#e0a878"), 0.6, 1.3);
    }

    // Fixed stars — single longitudes, so threads. Thin: a background the
    // chart moves against, not part of the chart.
    if (ly.stars && st?.length) {
      pushAxisLines(starLines(st, "#b8cdf0"), 0.8, 0.95);
    }

    // The natal field — the layer that is the same object as the SOUND.
    //
    // Fourteen bodies draw 56 circles, and at a brightness where each one is
    // legible they become a CAGE: the trajectory and the aspect circles vanish
    // behind their own context. Turning the opacity back down only returned it
    // to the state where you had to know a line was there.
    //
    // So the sweep does the selecting. The field sits low, and a line the pair
    // is ABOUT TO CROSS comes up — which is the same horizon the crossing marks
    // use, and means scrubbing lights the lines you are travelling toward. The
    // cage becomes context, and the instrument points at what is about to sound.
    // A line is HOT when its beat is slow enough to hear as a beat.
    //
    // A time horizon was the wrong measure and the data said so: fifteen days
    // of Moon is 195° of sky, so nearly every parallel qualified and the cage
    // came back. What scales correctly across a body moving 1°/day and one
    // moving 13° is not time but ORB — and under the bedrock map orb IS the
    // beat rate. Two drones a degree apart beat slowly; twenty degrees apart
    // they are not beating at all, they are an interval.
    //
    // So the visual threshold is an ACOUSTIC one, and the same number in both
    // places: a line lights when the drone that will meet it is within audible
    // beating distance. Because the map is exponential this is self-scaling in
    // the other direction too — 8 Hz is 18° down at 110 Hz and 4.7° up at
    // 440 Hz, which is exactly how much orb a beat that fast is worth there.
    // The crossings serve two layers now — the natal lines brighten toward them
    // and the crystal grows a shard on each — so they are found once. Two views
    // of one fact must not disagree about when it happens.
    if ((ly.natal || ly.crystal) && t && t.samples.length) {
      const cur = t.samples[Math.max(0, Math.min(ti, t.samples.length - 1))];
      nowRef = cur.jd;
      horizonRef = Math.max(3, (t.samples[t.samples.length - 1].jd - t.samples[0].jd) / 24);
      crossingsRef = natalCrossings(t.samples, natalPos);
      for (const l of ly.natal ? natalLines(natalPos, bodyTint) : []) {
        const transiting = l.axis === "theta" ? cur.lonA : cur.lonB;
        const beat = beatHz(droneHz(transiting), droneHz(l.lon));
        const heat = Math.max(0, 1 - beat / AUDIBLE_BEAT_HZ);
        pushPath(circleAt(l.lon, l.axis), l.color,
                 (0.85 + 1.5 * heat) * (0.7 + 0.3 * l.weight),
                 (0.22 + 0.78 * heat) * (0.62 + 0.38 * l.weight),
                 LAYER_FLOOR);
      }
    }

    // Aspect circles — the fixed diagonals. On the Clifford projection these
    // are true round circles (Villarceau / Hopf fibers), pairwise linked.
    for (const d of ds) {
      for (const target of aspectTargets(d.angle)) {
        pushPath(aspectCirclePath(target, 96), col(d.name), 1.3, 0.5);
      }
    }

    // The trajectory itself — the pair's year (or twelve) of actual motion.
    if (t) {
      const sampleAt = (i: number) => {
        const sm = t.samples[i];
        return PAt(sm.lonA, sm.lonB, sm.lonC ?? sliceC, sm.lonD ?? sliceD);
      };
      let prev = sampleAt(0);
      for (let i = 1; i < t.samples.length; i++) {
        const cur = sampleAt(i);
        const depth = (prev.depth + cur.depth) / 2;
        segs.push({
          x1: cx + prev.x, y1: cy + prev.y, x2: cx + cur.x, y2: cy + cur.y,
          depth, color: "#f0e6c8", width: 1.9,
          alpha: (0.28 + 0.6 * shade(depth)) * phase((prev.w + cur.w) / 2),
        });
        prev = cur;
      }
    }

    segs.sort((a, b) => a.depth - b.depth);
    for (const s of segs) {
      ctx.globalAlpha = s.alpha;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width * (w / 640);
      ctx.beginPath();
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Markers, nearest-last so the close ones sit on top.
    const dots: Dot[] = [];

    // The nodal points the sweep actually REACHES.
    //
    // The lattice of natal lines has 4n² intersections, and marking them all
    // buried the surface in 784 dots that each meant "a crossing could happen
    // here" — which is true of every point of every line, and so says nothing.
    // Measured: it read as gold static. The lattice is already visible where
    // the lines cross; what earns a dot is where THIS pair, in THIS window,
    // arrives on a natal degree — the instant a transiting drone slides into a
    // natal one and the beat between them falls to zero.
    // Marked within a HORIZON of the time cursor, not across the whole window.
    // A fast body sweeps the whole comb repeatedly — the Moon meets all fourteen
    // natal degrees, and their oppositions, every month — so a year of Sun–Moon
    // produced about 390 marks and read as static again. The horizon makes the
    // dots mean "about to happen", and scrubbing walks them along the
    // trajectory, which is the sweep the instrument is for.
    if (ly.natal && crossingsRef.length) {
      for (const c of crossingsRef) {
        const dt = Math.abs(c.jd - nowRef);
        if (dt > horizonRef) continue;
        const near = 1 - dt / horizonRef;       // 1 at the cursor, 0 at the edge
        const pr = P(c.lonA, c.lonB);
        dots.push({
          x: cx + pr.x, y: cy + pr.y, depth: pr.depth,
          // The octave lock is real but quieter than the unison; drawn smaller
          // so the two are not read as the same event.
          r: (c.opposition ? 1.8 : 2.8) * (0.5 + 0.5 * near),
          color: bodyTint(c.natal),
        });
      }
    }
    if (t) {
      for (const e of evs) {
        const pr = P(e.lonA, e.lonB);
        dots.push({
          x: cx + pr.x, y: cy + pr.y, depth: pr.depth,
          r: sel !== null && Math.abs(e.jd - sel) < 1e-6 ? 6.5 : 3.4,
          color: col(e.name), ring: sel !== null && Math.abs(e.jd - sel) < 1e-6,
        });
      }
      if (t.natal) {
        const pr = P(t.natal.lonA, t.natal.lonB);
        dots.push({ x: cx + pr.x, y: cy + pr.y, depth: pr.depth, r: 5, color: "#ffd76e", label: "✦ natal" });
      }
      const cur = t.samples[Math.max(0, Math.min(ti, t.samples.length - 1))];
      if (cur) {
        const pr = P(cur.lonA, cur.lonB);
        dots.push({
          x: cx + pr.x, y: cy + pr.y, depth: pr.depth, r: 5.5,
          color: "#ffffff", label: isoDay(cur.jd),
        });
      }
    }
    dots.sort((a, b) => a.depth - b.depth);
    const px = w / 640;
    for (const d of dots) {
      ctx.globalAlpha = 0.45 + 0.55 * shade(d.depth);
      ctx.fillStyle = d.color;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r * px, 0, Math.PI * 2);
      ctx.fill();
      if (d.ring) {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.4 * px;
        ctx.beginPath();
        ctx.arc(d.x, d.y, (d.r + 3) * px, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (d.label) {
        ctx.font = `${Math.round(12 * px)}px system-ui, sans-serif`;
        ctx.fillStyle = "#e8e2d0";
        ctx.fillText(d.label, d.x + 9 * px, d.y - 6 * px);
      }
    }
    ctx.globalAlpha = 1;

    // ── The crystal ─────────────────────────────────────────────────────────
    //
    // A standing node is the instant a transiting drone slides onto a natal one
    // and the beat between them falls to zero — which is what a standing wave's
    // node IS, and the reason the word is not a metaphor here. Each grows the
    // habit of its own path: the orbit of a small asymmetric motif under that
    // path's point group, so the SHAPE names the group before any symbol does.
    // A splinter is 1, a splinter with a partner through the centre is -1, and a
    // twelve-fold rosette is 6/mmm.
    if (ly.crystal && crossingsRef.length) {
      ctx.lineJoin = "round";
      const shown = crossingsRef
        .map((c) => ({ c, dt: Math.abs(c.jd - nowRef) }))
        .filter((x) => x.dt <= horizonRef)
        .sort((a, b) => a.dt - b.dt)
        .slice(0, MAX_SHARDS);
      for (const { c, dt } of shown) {
        const near = 1 - dt / horizonRef;
        const pr = P(c.lonA, c.lonB);
        const cr = crystalForNode(c.natal, c.opposition, sch, modern);
        // A habit has to be big enough to count its own vertices — a 6px
        // rosette and a 6px splinter are the same grey dot.
        const r = (10 + 9 * near) * px * (0.75 + 0.45 * shade(pr.depth));
        ctx.globalAlpha = (0.35 + 0.6 * near) * phase(pr.w);
        ctx.strokeStyle = bodyTint(c.natal);
        ctx.lineWidth = 1.35 * px;
        ctx.beginPath();
        shardOutline(cr.group).forEach(([ox, oy], i) => {
          // Screen-space, so the habit faces the reader however the surface is
          // turned — the same billboarding the glyphs get, and free for the
          // same reason: this renderer draws in two dimensions already.
          const X = cx + pr.x + ox * r;
          const Y = cy + pr.y - oy * r;
          if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
        });
        ctx.closePath();
        ctx.stroke();

        // The letter at the centre of its own habit — but only for the nodes
        // near the cursor. Every shard carrying a glyph turns the surface back
        // into the fog the crossing marks were built to avoid.
        if (cr.letter && near > 0.55) {
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.font = `${Math.round(11 * px)}px ${HEBREW_FONT}`;
          ctx.globalAlpha = (0.35 + 0.6 * near) * phase(pr.w);
          ctx.fillStyle = bodyTint(c.natal);
          ctx.fillText(cr.letter.glyph, cx + pr.x, cy + pr.y);
          ctx.textAlign = "start";
          ctx.textBaseline = "alphabetic";
        }
      }
      ctx.globalAlpha = 1;
    }

    // ── The letters ─────────────────────────────────────────────────────────
    //
    // Drawn last and unsorted against the rest, because they are LABELS: a
    // glyph that disappears behind a wireframe line is a glyph the reader
    // cannot use. Among themselves they still sort by depth, so the far side of
    // the surface reads as the far side.
    //
    // No billboarding code is needed and none should be added. The spec is
    // right that glyphs must not warp with the surface — but this renderer is
    // canvas-2D, and fillText already draws in screen space at a projected
    // point, which IS billboarding. In a WebGL build this would be a vertex
    // shader; here it is the default, and the whole 22-glyph pass costs one
    // sort and one loop.
    if (ly.hebrew) {
      const tint = (el: string) => ELEMENT_COLORS[el] ?? "#cfd8ff";
      const marks: GlyphMark[] = [
        ...signLetterMarks("theta", tint),
        ...signLetterMarks("phi", tint),
        ...natalLetterMarks(natalPos, bodyTint, sch, modern),
      ];
      const placed = marks
        .map((m) => ({ m, p: P(m.theta, m.phi) }))
        .sort((a, b) => a.p.depth - b.p.depth);

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const { m, p } of placed) {
        ctx.globalAlpha = (0.4 + 0.6 * shade(p.depth)) * phase(p.w);
        ctx.font = `${Math.round(m.size * 17 * px)}px ${HEBREW_FONT}`;
        // A dark stroke under the fill. Without it a letter crossing a bright
        // aspect circle loses its counters and stops being a letter — these
        // glyphs are read, not merely spotted, and several differ by one stroke.
        ctx.lineWidth = 3.2 * px;
        ctx.strokeStyle = "rgba(4, 6, 16, 0.85)";
        ctx.strokeText(m.glyph, cx + p.x, cy + p.y);
        ctx.fillStyle = m.color;
        ctx.fillText(m.glyph, cx + p.x, cy + p.y);
      }

      // The tile the pair is standing in, on the cursor. Unlike the doubles —
      // which are fixed to their bodies and so never change — this is the one
      // pair of letters that MOVES, and its gematria is the only quantity on
      // the surface that no rotation can alter.
      if (at) {
        const tile = tileWord(at.lonA, at.lonB);
        const pr = P(at.lonA, at.lonB);
        ctx.globalAlpha = 0.95 * phase(pr.w);
        ctx.font = `${Math.round(21 * px)}px ${HEBREW_FONT}`;
        ctx.lineWidth = 3.6 * px;
        ctx.strokeStyle = "rgba(4, 6, 16, 0.9)";
        // BELOW the cursor: the date label already sits above it, and the two
        // were landing on each other — measured on a screenshot, not reasoned about.
        const ty = cy + pr.y + 24 * px;
        ctx.strokeText(tile.word, cx + pr.x, ty);
        ctx.fillStyle = "#f4ecd4";
        ctx.fillText(tile.word, cx + pr.x, ty);
      }
      ctx.textAlign = "start";
      ctx.textBaseline = "alphabetic";
      ctx.globalAlpha = 1;
    }
  }, []);

  // ── Pointer: drag to rotate ───────────────────────────────────────────────
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    dragRef.current = { px: e.clientX, py: e.clientY };
    autoSpinRef.current = false;
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.px;
    const dy = e.clientY - dragRef.current.py;
    dragRef.current = { px: e.clientX, py: e.clientY };
    rotRef.current.y += dx * 0.45;
    rotRef.current.x = Math.max(-89, Math.min(89, rotRef.current.x + dy * 0.45));
    dirtyRef.current = true;
  };
  const onPointerUp = () => { dragRef.current = null; };

  // ── Readouts ──────────────────────────────────────────────────────────────
  const gA = BODY_GLYPHS[bodyA] ?? bodyA;
  const gB = BODY_GLYPHS[bodyB] ?? bodyB;
  // The doubles are fixed to their bodies, so these do not move; the tile does.
  const doubleA = letterForBody(bodyA, scheme, modernOuters);
  const doubleB = letterForBody(bodyB, scheme, modernOuters);
  const cur = traj?.samples[Math.max(0, Math.min(tIdx, traj.samples.length - 1))];
  const curDelta = cur ? Math.abs(wrap180(cur.lonA - cur.lonB)) : null;
  const curNear = curDelta !== null && activeDefs.length
    ? nearestAspect(curDelta, activeDefs)
    : null;
  const natalNear = traj?.natal && activeDefs.length
    ? nearestAspect(traj.natal.lonA - traj.natal.lonB, activeDefs)
    : null;

  // ── Sound: the same geometry, heard ───────────────────────────────────────
  // The interval between the two drones IS the separation, because the
  // resonarium's bedrock map is one octave per 180° — so every exact aspect is
  // an exact multiple of 200 cents, and the aspect table is the whole-tone
  // scale. Scrubbing sweeps it; a crossing rings.

  // The persisted field. Derived once per profile and kept — re-deriving it
  // after an ephemeris change re-deals it, which is why this goes through
  // soundtrackStore rather than calling personalSoundtrack here.
  const soundtrack = useMemo(
    () => (chart ? getSoundtrack(birth, chart) : null),
    [birth, chart]
  );
  const seedKeys = useMemo(
    () => new Set(soundtrack?.seed_keys ?? []),
    [soundtrack]
  );

  // Lilith is selectable on the torus but has NO canonical seed key: it is
  // outside the chart contract the whole field is hashed from, and adding it
  // would re-deal every existing seed. So it sounds its transiting drone like
  // any other body — that map is a property of angles, not of the seed — but
  // it gets no natal reference tone, because it genuinely has none.
  const natalHzA = soundtrack && traj?.natal
    ? natalDroneHz(bodyA, soundtrack.spec.bedrock_hz, seedKeys) : null;
  const natalHzB = soundtrack && traj?.natal
    ? natalDroneHz(bodyB, soundtrack.spec.bedrock_hz, seedKeys) : null;
  const offSeed = [bodyA, bodyB].filter((b) => !participatesInSeed(b));

  const curCents = cur ? centsBetween(cur.lonA, cur.lonB) : null;
  const curBeat = cur ? beatHz(droneHz(cur.lonA), droneHz(cur.lonB)) : null;

  const stopSound = useCallback(() => {
    setSounding(false);
    lastJdRef.current = null;
    const v = voiceRef.current;
    voiceRef.current = null;
    void v?.stop();
  }, []);

  // Autoplay policy: the context is constructed inside this handler and never
  // anywhere else. There is no path to sound that is not a button press.
  // ── The three mothers ─────────────────────────────────────────────────────
  const motherLetter = MOTHERS.find((l) => l.name === mother) ?? MOTHERS[0];

  /** What a mother's turn IS: her plane pair, and what the surface does in it. */
  const motherNote = useCallback((m: Mother): string => {
    const [p1, p2] = MOTHER_PLANE_PAIRS[m];
    const head =
      `${m} — ${MOTHER_ELEMENTS[m]}. Four dimensions have no axis to turn about, ` +
      `only planes, and the six of them fall into exactly three pairs that share ` +
      `no coordinate. This mother owns ${p1} and ${p2}, turned at the same rate. ` +
      `Because they share nothing, it is one motion rather than two in sequence.`;
    return m === "Aleph"
      ? `${head} On the Clifford torus the xy plane carries ${bodyA}'s longitude and ` +
        `zw carries ${bodyB}'s, so this turn is the Hopf flow already here: the ` +
        `surface slides along its own aspect circles and never tilts. Air is the ` +
        `balance between fire and water, and this is the one turn that leaves the ` +
        `torus where it found it.`
      : `${head} It mixes the two bodies' planes together, which no rotation in this ` +
        `panel has done before — the surface leaves the pose it is always drawn in, ` +
        `and passes through the projection pole four times per turn, folding inside ` +
        `out each time. That passage is the one thing four dimensions can do that ` +
        `three cannot.`;
  }, [bodyA, bodyB]);

  const selectMother = useCallback((m: Mother) => {
    setMother(m);
    trackEvent("torus_mother", { mother: m });
    const l = MOTHERS.find((x) => x.name === m) ?? MOTHERS[0];
    setMargin({
      title: `${l.glyph} ${m}`,
      subtitle: "one of the three mothers",
      body: [motherNote(m)],
    });
  }, [motherNote, setMargin]);

  /** Switch a teaching layer, and say what appeared. The sentence is the point:
   *  a legend that only names things teaches nothing the label did not. */
  const toggleLayer = useCallback((id: LayerId) => {
    setLayers((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      if (next[id]) {
        trackEvent("torus_layer_on", { layer: id });
        setMargin({
          title: LAYER_COPY[id].label,
          subtitle: "a layer of the torus",
          body: [LAYER_COPY[id].note],
        });
      }
      return next;
    });
    // Stars are the one layer with data we do not already hold. Fetched once,
    // on demand, and only the ones already contacting this chart.
    if (id === "stars" && !layers.stars && stars === null && !starsBusy && birth) {
      setStarsBusy(true);
      fetchFixedStars(birth, 1.5)
        .then((r) => setStars(r.hits))
        // A missing star layer is a layer that stays off, not an error banner
        // over a working instrument.
        .catch(() => setStars([]))
        .finally(() => setStarsBusy(false));
    }
  }, [layers.stars, stars, starsBusy, birth, setMargin]);

  const startSound = useCallback(async () => {
    if (!soundtrack) return;
    setAudioErr(null);
    try {
      const v = await TorusVoice.start(soundtrack.spec);
      if (!v) { setAudioErr("This device has no Web Audio."); return; }
      voiceRef.current = v;
      lastJdRef.current = cur?.jd ?? null;
      setSounding(true);
    } catch (e) {
      setAudioErr(String(e));
    }
  }, [soundtrack, cur?.jd]);

  // Follow the trajectory: drones track the scrub, crossings ring as they pass.
  useEffect(() => {
    const v = voiceRef.current;
    if (!v || !sounding || !cur) return;
    v.setPair(droneHz(cur.lonA), droneHz(cur.lonB));
    v.setNatal(natalHzA, natalHzB);
    const prev = lastJdRef.current;
    lastJdRef.current = cur.jd;
    if (prev === null || prev === cur.jd) return;
    const lo = Math.min(prev, cur.jd);
    const hi = Math.max(prev, cur.jd);
    const crossed = events.filter((e) => e.jd > lo && e.jd <= hi);
    for (const e of crossed.slice(-MAX_RINGS_PER_STEP)) v.ring(e.angle);
  }, [sounding, cur, events, natalHzA, natalHzB]);

  // Never outlive the tab. Leaving chapter V releases the audio session.
  useEffect(() => () => { void voiceRef.current?.stop(); voiceRef.current = null; }, []);

  const selectEvent = (e: AspectEvent) => {
    setSelJd(e.jd);
    if (traj) {
      let best = 0;
      traj.samples.forEach((s, i) => {
        if (Math.abs(s.jd - e.jd) < Math.abs(traj.samples[best].jd - e.jd)) best = i;
      });
      setTIdx(best);
    }
    // Land on the crossing and sound it — the jump itself may not span the
    // instant, so the bell is struck here rather than left to the scrub watcher.
    if (sounding) {
      lastJdRef.current = e.jd;
      voiceRef.current?.ring(e.angle);
    }
    const sign = e.target >= 0 ? "+" : "−";
    setMargin({
      title: `${gA} ${ASPECT_GLYPHS[e.name] ?? ""} ${gB} · ${e.name}`,
      subtitle: `${isoDay(e.jd)} · exact at ${e.angle}°`,
      chips: [
        `${bodyA} ${e.lonA.toFixed(2)}°`,
        `${bodyB} ${e.lonB.toFixed(2)}°`,
        `Δ sweeping ${Math.abs(e.relSpeed).toFixed(2)}°/day`,
      ],
      body: [
        `On the torus this instant is a geometric fact: the pair's trajectory crosses the ${e.name.toLowerCase()} circle λ(${bodyA}) − λ(${bodyB}) = ${sign}${e.angle}°. Every point of that circle holds the aspect; the crossing is the moment your sky passes through it.`,
        `In phase language: with z = e^{iλ}, the relative phase w = z(${bodyA})·z̄(${bodyB}) lands exactly on a root of unity here. The slower the crossing, the longer the aspect's weather lasts.`,
      ],
    });
    trackEvent("torus_event_open");
  };

  return (
    <div>
      <div className="arc-draw-controls">
        <label>Around the ring
          <select value={bodyA} onChange={(e) => setBodyA(e.target.value)}>
            {TORUS_BODIES.map((b) => (
              <option key={b} value={b} disabled={b === bodyB}>{BODY_GLYPHS[b]} {b}</option>
            ))}
          </select>
        </label>
        <label>Around the tube
          <select value={bodyB} onChange={(e) => setBodyB(e.target.value)}>
            {TORUS_BODIES.map((b) => (
              <option key={b} value={b} disabled={b === bodyA}>{BODY_GLYPHS[b]} {b}</option>
            ))}
          </select>
        </label>
        <label>Window
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {WINDOWS.map((wd) => (
              <option key={wd.days} value={wd.days}>{wd.label}</option>
            ))}
          </select>
        </label>
        <label>Surface
          <select value={embedding} onChange={(e) => setEmbedding(e.target.value as Surface)}>
            <option value="donut">Torus (donut)</option>
            <option value="clifford">Clifford (4D, projected)</option>
            <option value="hyper">Hyper-torus (T⁴, projected)</option>
          </select>
        </label>
        {embedding === "hyper" && (
          <>
            <label>Third circle
              <select value={bodyC} onChange={(e) => setBodyC(e.target.value)}>
                <option value={NO_BODY}>— none —</option>
                {TORUS_BODIES.map((b) => (
                  <option key={b} value={b} disabled={b === bodyA || b === bodyB || b === bodyD}>
                    {BODY_GLYPHS[b]} {b}
                  </option>
                ))}
              </select>
            </label>
            <label>Fourth circle
              <select value={bodyD} onChange={(e) => setBodyD(e.target.value)}>
                <option value={NO_BODY}>— none —</option>
                {TORUS_BODIES.map((b) => (
                  <option key={b} value={b} disabled={b === bodyA || b === bodyB || b === bodyC}>
                    {BODY_GLYPHS[b]} {b}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        <label style={{ display: "inline-flex", alignItems: "center", gap: "0.4em" }}>
          <input type="checkbox" checked={minors} onChange={(e) => setMinors(e.target.checked)} />
          minor aspects
        </label>
        {embedding !== "donut" && (
          <span className="torus-mothers" role="radiogroup" aria-label="Which mother turns the surface">
            <button
              className="arc-draw-btn"
              onClick={() => setFlowOn((v) => !v)}
              aria-pressed={flowOn}
            >
              {flowOn ? "◼" : "▶"} {motherLetter.glyph} flow
            </button>
            {MOTHERS.map((m) => (
              <span
                key={m.name}
                className={`chip ${mother === m.name ? "active" : ""}`}
                role="radio"
                aria-checked={mother === m.name}
                aria-label={`${m.name}, the ${MOTHER_ELEMENTS[m.name]} rotation`}
                title={motherNote(m.name as Mother)}
                onClick={() => selectMother(m.name as Mother)}
              >
                {m.glyph} {m.name}
              </span>
            ))}
          </span>
        )}
        {audioSupported() && soundtrack && (
          <button
            className="arc-draw-btn"
            onClick={() => (sounding ? stopSound() : void startSound())}
            aria-pressed={sounding}
          >
            {sounding ? "◼ Stop sound" : "♪ Sound the pair"}
          </button>
        )}
      </div>

      {/* The teaching rail. Switched on one at a time by intent — the surface
          already carries aspect circles and a trajectory, and a reader who
          turns everything on at once learns nothing. */}
      <div className="torus-layers">
        <span className="torus-layers-lead">Layers</span>
        {(Object.keys(LAYER_COPY) as LayerId[]).map((id) => (
          <span
            key={id}
            className={`chip ${layers[id] ? "active" : ""}`}
            role="switch"
            aria-checked={layers[id]}
            aria-label={LAYER_COPY[id].label}
            title={LAYER_COPY[id].note}
            onClick={() => toggleLayer(id)}
          >
            {layers[id] ? "◉" : "◯"} {LAYER_COPY[id].label}
            {id === "stars" && starsBusy ? " …" : ""}
          </span>
        ))}
      </div>
      {layers.natal && (
        <p className="arc-ondevice">
          ✦ Each crossing of a natal line is a zero-beat — sound the pair and
          scrub to hear one arrive.
        </p>
      )}
      {layers.crystal && (
        <div className="torus-hebrew-rail">
          <label style={{ display: "inline-flex", alignItems: "center", gap: "0.4em" }}>
            <input
              type="checkbox"
              checked={lattice}
              onChange={(e) => setLattice(e.target.checked)}
            />
            triclinic lattice
          </label>
          <p className="arc-ondevice">
            ✧ The shards are a reading of the chart; the lattice bends the space
            the chart is drawn in, which is why they switch separately. Its cell
            is not invented — the three interaxial angles ARE three pairwise
            separations of real longitudes, so the cell is triclinic exactly when
            those bodies stand in no relation, and straightens as they come into
            aspect. A cubic cell is the identity matrix, which is what the switch
            returns to when it is off.
          </p>
        </div>
      )}
      {layers.hebrew && (
        <div className="torus-hebrew-rail">
          <label>Doubles from
            <select
              value={scheme}
              onChange={(e) => setScheme(e.target.value as Attribution)}
            >
              {(Object.keys(ATTRIBUTION_LABEL) as Attribution[]).map((k) => (
                <option key={k} value={k}>{ATTRIBUTION_LABEL[k]}</option>
              ))}
            </select>
          </label>
          <label style={{ display: "inline-flex", alignItems: "center", gap: "0.4em" }}>
            <input
              type="checkbox"
              checked={modernOuters}
              onChange={(e) => setModernOuters(e.target.checked)}
            />
            moderns on the mothers
          </label>
          <p className="arc-ondevice">
            ✡ The two tables disagree about every one of the seven planets, which
            is why both are here — a reader arriving from a tarot deck and a
            reader arriving from the Sefer Yetzirah are looking for different
            letters over the same Sun. Uranus, Neptune and Pluto have no ancient
            letter at all; the moderns place them on the three mothers, and that
            attribution is younger than the planets. The Nodes, Chiron, Lilith
            and the angles stay unlettered, because the alphabet has none for
            them and a borrowed glyph would be a lie about its own tradition.
          </p>
        </div>
      )}

      {err && <p className="arc-error">{err}</p>}
      <p className="arc-ondevice">☾ computed on your device — drag to turn the torus</p>

      <div ref={wrapRef} style={{ width: "100%" }}>
        <canvas
          ref={canvasRef}
          style={{ width: "100%", display: "block", touchAction: "none", cursor: "grab" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          aria-label={
            `Torus of ${bodyA} and ${bodyB}: the pair's trajectory with aspect circles` +
            (embedding === "hyper" && (bodyC || bodyD)
              ? `, on a hyper-torus sliced by ${[bodyC, bodyD].filter(Boolean).join(" and ")}`
              : "") +
            (layers.hebrew
              ? ", lettered with the twelve elementals on each axis and the doubles over the natal bodies"
              : "")
          }
        />
      </div>

      {loading && <p className="arc-empty">Winding {gA}·{gB} around the torus…</p>}

      {traj && cur && (
        <>
          <div className="arc-draw-controls" style={{ marginTop: "0.5rem" }}>
            <input
              type="range" min={0} max={traj.samples.length - 1} value={tIdx}
              style={{ flex: 1, minWidth: "10rem" }}
              onChange={(e) => { setSelJd(null); setTIdx(Number(e.target.value)); }}
              aria-label="Scrub time along the trajectory"
            />
          </div>
          <p className="arc-themes">
            <b>{isoDay(cur.jd)}</b> · {gA} {cur.lonA.toFixed(1)}° · {gB} {cur.lonB.toFixed(1)}°
            · Δ {curDelta!.toFixed(1)}°
            {curNear && <> · nearest {curNear.def.name.toLowerCase()} orb {curNear.orb.toFixed(1)}°</>}
            {wind && (
              <> · the curve winds {gA} {Math.abs(wind.turnsA).toFixed(1)} × {gB} {Math.abs(wind.turnsB).toFixed(1)} turns</>
            )}
          </p>

          {curCents !== null && (
            <p className="arc-themes">
              {sounding && (
                <span
                  className={prefersReducedMotion() ? undefined : "torus-sound-pulse"}
                  aria-hidden="true"
                >◉{" "}</span>
              )}
              interval {curCents >= 0 ? "+" : "−"}{Math.abs(curCents).toFixed(0)}¢
              {curBeat !== null && <> · beat {curBeat.toFixed(1)} Hz</>}
              {" — "}the bedrock map is one octave per 180°, so an exact aspect is
              an exact multiple of 200¢: the major aspects are the whole-tone scale.
              {offSeed.length > 0 && (
                <> {offSeed.join(" and ")} sounds, but carries no natal tone — it is
                outside the canonical chart the field is sealed from.</>
              )}
            </p>
          )}
          {layers.hebrew && (() => {
            const tile = tileWord(cur.lonA, cur.lonB);
            const unlettered = [
              !doubleA ? bodyA : null,
              !doubleB ? bodyB : null,
            ].filter(Boolean) as string[];
            return (
              <p className="arc-themes">
                ✡ tile <b lang="he" style={{ fontSize: "1.25em" }}>{tile.word}</b>
                {" — "}{tile.theta.name} ({tile.theta.value}) over {tile.phi.name} ({tile.phi.value}),
                gematria <b>{tile.value}</b>. The two bodies are somewhere in 144
                tiles, and this number is the only thing on the surface that no
                rotation can alter — turn a mother, change the projection, fold
                the whole thing inside out, and the tile still sums to what it sums to.
                {doubleA && (
                  <> {gA} {bodyA} carries <b lang="he">{doubleA.letter.glyph}</b> {doubleA.letter.name},
                  path {doubleA.letter.path} ({doubleA.letter.joins}){doubleA.traditional ? "" : ", a modern attribution"}.</>
                )}
                {doubleB && (
                  <> {gB} {bodyB} carries <b lang="he">{doubleB.letter.glyph}</b> {doubleB.letter.name},
                  path {doubleB.letter.path} ({doubleB.letter.joins}){doubleB.traditional ? "" : ", a modern attribution"}.</>
                )}
                {unlettered.length > 0 && (
                  <> {unlettered.join(" and ")} {unlettered.length > 1 ? "have" : "has"} no
                  letter — there are seven doubles because there were seven planets, and
                  this is not one of them.</>
                )}
              </p>
            );
          })()}
          {layers.crystal && curNear && (() => {
            const orb = (curNear.def as { defaultOrb?: number }).defaultOrb ?? 6;
            const cr = crystalForAspect(curNear.def.angle, curNear.orb, orb);
            const n = harmonicOf(curNear.def.angle);
            return (
              <p className="arc-themes">
                ✧ nearest aspect is the {curNear.def.name.toLowerCase()}, the{" "}
                <b>{n}</b>{n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"} harmonic
                {cr ? (
                  <> — <b>{cr.group.hm}</b> ({cr.group.schoenflies}), {cr.group.system},
                  order {cr.group.order}, path {cr.group.path} ({pathName(cr.group.path)}).
                  {" "}At exact orb an aspect carries its system's full symmetry and loses
                  operations as the orb widens, the way strain takes them from a real
                  crystal: {(cr.retained * 100).toFixed(0)}% of the way to exact here.</>
                ) : (
                  <> — and <b>no crystal at all</b>. A lattice may carry 1-, 2-, 3-, 4-
                  and 6-fold axes and no others, so a {n}-fold aspect has no cell that
                  can repeat. That is not a gap in the table: the five aspects that
                  crystallize are exactly the five this app already calls major, and
                  every minor is forbidden by the same theorem. A 5-fold arrangement
                  of matter is a quasicrystal, which nobody believed was possible
                  until 1982.</>
                )}
              </p>
            );
          })()}
          {embedding === "hyper" && (bodyC || bodyD) && cur && (
            <p className="arc-themes">
              ✧ third and fourth circles:
              {bodyC && <> {BODY_GLYPHS[bodyC] ?? ""} {bodyC} {(cur.lonC ?? 0).toFixed(1)}°</>}
              {bodyC && bodyD && " ·"}
              {bodyD && <> {BODY_GLYPHS[bodyD] ?? ""} {bodyD} {(cur.lonD ?? 0).toFixed(1)}°</>}
              {" — "}these two are not drawn as curves; they choose WHICH torus you
              are looking at. Scrubbing walks the cursor along the pair and slides
              the whole surface sideways through the other two circles at once.
              With both set to none the extra radii go to zero and this is the
              donut again, exactly.
            </p>
          )}
          {audioErr && <p className="arc-error">{audioErr}</p>}
          {traj.natal && natalNear && (
            <p className="arc-themes">
              ✦ natal point: {gA} {traj.natal.lonA.toFixed(1)}° · {gB} {traj.natal.lonB.toFixed(1)}°
              — {natalNear.orb.toFixed(1)}° from the {natalNear.def.name.toLowerCase()} circle.
              The natal chart is a fixed point on this surface; its orbs are literal distances to the aspect circles.
            </p>
          )}

          <p className="arc-themes" style={{ marginTop: "0.6rem" }}>
            <b>{events.length}</b> exact aspects in this window — each an intersection of the curve with an aspect circle.
          </p>
          {events.map((e) => (
            <div
              key={`${e.jd}-${e.name}-${e.target}`}
              className="arc-day mg-sel"
              onClick={() => selectEvent(e)}
            >
              <div className="arc-day-head">
                <span className="arc-day-date">{isoDay(e.jd)}</span>
                <span className="arc-day-transit" style={{ color: colorOf(e.name) }}>
                  {gA} {ASPECT_GLYPHS[e.name] ?? ""} {gB} · {e.name} ({e.angle}°)
                </span>
              </div>
              <p className="arc-day-action">
                {bodyA} {e.lonA.toFixed(1)}° · {bodyB} {e.lonB.toFixed(1)}° · Δ sweeping {Math.abs(e.relSpeed).toFixed(2)}°/day
              </p>
            </div>
          ))}
          {events.length === 0 && !loading && (
            <p className="arc-empty">No exact aspects in this window — widen it, or add the minors.</p>
          )}
        </>
      )}
    </div>
  );
};
