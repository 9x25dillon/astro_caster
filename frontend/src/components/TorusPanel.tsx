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
  embed,
  findAspectEvents,
  jdToDate,
  nearestAspect,
  project,
  windings,
  wrap180,
  type AspectAngleDef,
  type AspectEvent,
  type Camera,
  type Embedding,
} from "../lib/torus";

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

export const TorusPanel: React.FC = () => {
  const birth = useStore((s) => s.birth);
  const setMargin = useStore((s) => s.setMargin);

  const [bodyA, setBodyA] = useState("Sun");
  const [bodyB, setBodyB] = useState("Moon");
  const [days, setDays] = useState(365);
  const [embedding, setEmbedding] = useState<Embedding>("donut");
  const [minors, setMinors] = useState(false);
  const [hopfOn, setHopfOn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [traj, setTraj] = useState<PairTrajectory | null>(null);
  const [defs, setDefs] = useState<AspectAngleDef[]>([]);
  const [tIdx, setTIdx] = useState(0);
  const [selJd, setSelJd] = useState<number | null>(null);

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
            new Date(Date.now() - (days / 2) * 86400000), days
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
  }, [birth, bodyA, bodyB, days]);

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

  // ── The scene ref: everything the render loop needs, without re-binding ───
  const sceneRef = useRef({
    traj, activeDefs, events, embedding, tIdx, selJd,
    colorOf, bodyA, bodyB,
  });
  const dirtyRef = useRef(true);
  useEffect(() => {
    sceneRef.current = { traj, activeDefs, events, embedding, tIdx, selJd, colorOf, bodyA, bodyB };
    dirtyRef.current = true;
  }, [traj, activeDefs, events, embedding, tIdx, selJd, colorOf, bodyA, bodyB]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const rotRef = useRef({ x: -28, y: 36 });
  const autoSpinRef = useRef(true); // gentle spin until the reader takes the wheel
  const hopfRef = useRef({ angle: 0, playing: false });
  const dragRef = useRef<{ px: number; py: number } | null>(null);

  useEffect(() => {
    hopfRef.current.playing = hopfOn && embedding === "clifford";
    dirtyRef.current = true;
  }, [hopfOn, embedding]);

  // ── Size the canvas to its box, in device pixels ──────────────────────────
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const fit = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = wrap.clientWidth;
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
      if (hopfRef.current.playing) {
        hopfRef.current.angle = (hopfRef.current.angle + dt * 14) % 360;
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
    const { traj: t, activeDefs: ds, events: evs, embedding: kind, tIdx: ti, selJd: sel, colorOf: col } =
      sceneRef.current;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const cam: Camera = {
      rotXDeg: rotRef.current.x,
      rotYDeg: rotRef.current.y,
      dist: 7,
      scale: Math.min(w, h) / 5.6,
    };
    const hopf = kind === "clifford" ? hopfRef.current.angle : 0;
    const cx = w / 2;
    const cy = h / 2;
    const P = (th: number, ph: number) => project(embed(kind, th, ph, hopf), cam);
    const shade = (depth: number) => Math.max(0, Math.min(1, (depth + 2.8) / 5.6));

    const segs: Seg[] = [];
    const pushPath = (
      pts: Array<[number, number]>, color: string, width: number, alpha: number
    ) => {
      let prev = P(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) {
        const cur = P(pts[i][0], pts[i][1]);
        const depth = (prev.depth + cur.depth) / 2;
        segs.push({
          x1: cx + prev.x, y1: cy + prev.y, x2: cx + cur.x, y2: cy + cur.y,
          depth, color, width, alpha: alpha * (0.35 + 0.65 * shade(depth)),
        });
        prev = cur;
      }
    };

    // Wireframe — the θ grid lines sit on sign cusps of body A (every 30°).
    for (let g = 0; g < 360; g += 30) {
      const mer: Array<[number, number]> = [];
      const par: Array<[number, number]> = [];
      for (let i = 0; i <= 48; i++) {
        const a = (i / 48) * 360;
        mer.push([g, a]);
        par.push([a, g]);
      }
      pushPath(mer, "#cfd8ff", 0.7, 0.10);
      pushPath(par, "#cfd8ff", 0.7, 0.07);
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
      let prev = P(t.samples[0].lonA, t.samples[0].lonB);
      for (let i = 1; i < t.samples.length; i++) {
        const cur = P(t.samples[i].lonA, t.samples[i].lonB);
        const depth = (prev.depth + cur.depth) / 2;
        segs.push({
          x1: cx + prev.x, y1: cy + prev.y, x2: cx + cur.x, y2: cy + cur.y,
          depth, color: "#f0e6c8", width: 1.9,
          alpha: 0.28 + 0.6 * shade(depth),
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
  const cur = traj?.samples[Math.max(0, Math.min(tIdx, traj.samples.length - 1))];
  const curDelta = cur ? Math.abs(wrap180(cur.lonA - cur.lonB)) : null;
  const curNear = curDelta !== null && activeDefs.length
    ? nearestAspect(curDelta, activeDefs)
    : null;
  const natalNear = traj?.natal && activeDefs.length
    ? nearestAspect(traj.natal.lonA - traj.natal.lonB, activeDefs)
    : null;

  const selectEvent = (e: AspectEvent) => {
    setSelJd(e.jd);
    if (traj) {
      let best = 0;
      traj.samples.forEach((s, i) => {
        if (Math.abs(s.jd - e.jd) < Math.abs(traj.samples[best].jd - e.jd)) best = i;
      });
      setTIdx(best);
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
          <select value={embedding} onChange={(e) => setEmbedding(e.target.value as Embedding)}>
            <option value="donut">Torus (donut)</option>
            <option value="clifford">Clifford (4D, projected)</option>
          </select>
        </label>
        <label style={{ display: "inline-flex", alignItems: "center", gap: "0.4em" }}>
          <input type="checkbox" checked={minors} onChange={(e) => setMinors(e.target.checked)} />
          minor aspects
        </label>
        {embedding === "clifford" && (
          <button className="arc-draw-btn" onClick={() => setHopfOn((v) => !v)}>
            {hopfOn ? "◼ Hopf flow" : "▶ Hopf flow"}
          </button>
        )}
      </div>

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
          aria-label={`Torus of ${bodyA} and ${bodyB}: the pair's trajectory with aspect circles`}
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
