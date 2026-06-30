// components/ChartWheel.tsx
// Layered D3 rendering of the natal (and optional transit) chart.
//
// Layers, outer -> inner:
//   1. Zodiac ring   (12 signs, element-tinted, glyphs)
//   2. House ring    (12 cusps from Placidus etc., numerals, Asc/MC emphasis)
//   3. Transit ring  (optional outer wheel of transiting bodies)
//   4. Planet layer  (natal glyphs with degree ticks + retrograde pulse)
//   5. Aspect layer  (chords inside the inner circle, coloured by aspect family)
//
// Orientation: Ascendant fixed at 9 o'clock (left), longitude increasing CCW.
import React, { useMemo } from "react";
import { useStore } from "../store/useStore";
import {
  lonToAngle, polar, SIGN_GLYPHS, SIGN_NAMES, ELEMENT_OF_SIGN_INDEX, ELEMENT_COLORS,
  POINT_IDS, glyphText, PLANET_INFLUENCE, SIGN_INFLUENCE, SIGN_MODALITIES,
  HOUSE_INFLUENCE, ASPECT_INFLUENCE, ASPECT_SYMBOL, formatPos, ORDINAL,
} from "../lib/astro";
import type { Aspect, PlanetData } from "../types";

interface Props {
  size?: number;
}

// Anti-collision: spread glyphs that fall within `minGap` degrees of each other
// along the ring so they don't overlap. Operates on screen angle, not longitude.
function spreadGlyphs(
  bodies: { id: string; lon: number }[],
  ascendant: number,
  minGap = 7
): Record<string, number> {
  const items = bodies
    .map((b) => ({ id: b.id, a: ((180 - (((b.lon - ascendant) % 360) + 360) % 360) + 360) % 360 }))
    .sort((x, y) => x.a - y.a);
  for (let iter = 0; iter < 24; iter++) {
    let moved = false;
    for (let i = 0; i < items.length; i++) {
      const next = items[(i + 1) % items.length];
      let gap = (next.a - items[i].a + 360) % 360;
      if (gap < minGap) {
        const push = (minGap - gap) / 2;
        items[i].a = (items[i].a - push + 360) % 360;
        next.a = (next.a + push) % 360;
        moved = true;
      }
    }
    if (!moved) break;
  }
  const out: Record<string, number> = {};
  items.forEach((it) => (out[it.id] = (it.a * Math.PI) / 180));
  return out;
}

export const ChartWheel: React.FC<Props> = ({ size = 720 }) => {
  const chart = useStore((s) => s.chart);
  const transit = useStore((s) => s.transit);
  const layers = useStore((s) => s.layers);
  const selection = useStore((s) => s.selection);
  const hovered = useStore((s) => s.hovered);
  const select = useStore((s) => s.select);
  const hover = useStore((s) => s.hover);
  const isSupporter = useStore((s) => s.isSupporter);

  // Only planet/aspect focus should dim the aspect web; sign/house hover must not.
  const focusSel = selection ?? hovered;
  const aspectFocus = focusSel?.type === "planet" || focusSel?.type === "aspect";
  const planetFocus = focusSel?.type === "planet";

  const R = size / 2;
  const rZodiacOuter  = R * 0.97;
  const rZodiacInner  = R * 0.87;  // slightly narrower zodiac band
  const rTransitOuter = rZodiacInner;
  const rTransit      = R * 0.81;  // transit planet glyph radius (own ring)
  const rTransitInner = R * 0.75;  // separator between transit ring and house ring
  const rHouseOuter   = rTransitInner;
  const rHouseInner   = R * 0.67;
  const rPlanet       = R * 0.59;
  const rAspect       = R * 0.51;

  const asc = chart?.angles.ascendant ?? 0;

  const planetAngles = useMemo(() => {
    if (!chart) return {};
    const drawable = chart.planets.filter(
      (p) => p.id !== "Descendant" && p.id !== "Imum Coeli"
    );
    return spreadGlyphs(drawable.map((p) => ({ id: p.id, lon: p.longitude })), asc);
  }, [chart, asc]);

  const transitAngles = useMemo(() => {
    if (!transit) return {};
    return spreadGlyphs(
      transit.transiting.map((p) => ({ id: p.id, lon: p.longitude })),
      asc,
      6
    );
  }, [transit, asc]);

  if (!chart) {
    return (
      <div className="panel" style={{ width: size, textAlign: "center", color: "var(--ink)" }}>
        <p style={{ fontStyle: "italic" }}>The observatory awaits a chart…</p>
      </div>
    );
  }

  const planetById: Record<string, PlanetData> = Object.fromEntries(
    chart.planets.map((p) => [p.id, p])
  );

  const aspectActive = (a: Aspect): boolean => {
    const sel = selection ?? hovered;
    if (!sel) return false;
    if (sel.type === "planet") return a.p1 === sel.id || a.p2 === sel.id;
    if (sel.type === "aspect") return aspectKey(a) === sel.id;
    return false;
  };

  const aspectKey = (a: Aspect) => `${a.p1}|${a.p2}|${a.type}`;

  const visibleAspects = chart.aspects.filter((a) => {
    const minorSet = new Set(["Quincunx", "Semisextile", "Sesquiquadrate", "Semisquare", "Quintile"]);
    if (!layers.minorAspects && minorSet.has(a.type)) return false;
    if (POINT_IDS.has(a.p1) || POINT_IDS.has(a.p2)) return false;
    return true;
  });

  return (
    <svg
      width={size}
      height={size}
      viewBox={`${-R} ${-R} ${size} ${size}`}
      style={{ overflow: "visible" }}
      role="img"
      aria-label="Natal chart wheel"
      onClick={() => select(null)}
    >
      <defs>
        <radialGradient id="discGrad" cx="50%" cy="45%" r="65%">
          <stop offset="0%" stopColor="#17171f" />
          <stop offset="100%" stopColor="#09090d" />
        </radialGradient>

        {/* Golden corona that bleeds just past the outer rim */}
        <radialGradient id="coronaGrad" cx="50%" cy="50%" r="50%">
          <stop offset="74%" stopColor="rgba(0,0,0,0)" />
          <stop offset="90%" stopColor="rgba(201,168,76,0.06)" />
          <stop offset="100%" stopColor="rgba(201,168,76,0.14)" />
        </radialGradient>

        {/* Planet hover / selection highlight */}
        <filter id="glow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Ascendant / angle axis ambient glow */}
        <filter id="axisGlow" x="-120%" y="-120%" width="340%" height="340%">
          <feGaussianBlur stdDeviation="9" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Outer rim aurora */}
        <filter id="rimGlow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="12" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Center glyph soft glow */}
        <filter id="centerGlow" x="-150%" y="-150%" width="400%" height="400%">
          <feGaussianBlur stdDeviation="7" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Backdrop disc */}
      <circle r={rZodiacOuter} fill="url(#discGrad)" stroke="var(--rule)" strokeWidth={0.5} />

      {/* Corona gradient — golden bleed at outer edge */}
      <circle r={rZodiacOuter} fill="url(#coronaGrad)" />

      {/* Outer rim aurora ring — animates via CSS */}
      <circle
        className="wheel-rim-glow"
        r={rZodiacOuter}
        fill="none"
        stroke="rgba(201,168,76,0.32)"
        strokeWidth={1.5}
        filter="url(#rimGlow)"
      />

      {/* Asc-Desc and MC-IC axis glows — drawn under the rings */}
      {([0, 9] as const).map((houseIdx) => {
        const h = chart.houses[houseIdx];
        const a = lonToAngle(h.longitude, asc);
        const [x0, y0] = polar(rZodiacOuter * 0.985, a);
        const [x1, y1] = polar(rZodiacOuter * 0.985, a + Math.PI);
        const isAsc = houseIdx === 0;
        return (
          <line
            key={`axis-glow-${houseIdx}`}
            className="axis-glow"
            x1={x0} y1={y0} x2={x1} y2={y1}
            stroke={isAsc ? "rgba(201,168,76,0.6)" : "rgba(184,115,51,0.4)"}
            strokeWidth={isAsc ? 1.5 : 1}
            filter="url(#axisGlow)"
          />
        );
      })}

      {/* ---- Layer 1: Zodiac ring ---- */}
      {layers.zodiac &&
        Array.from({ length: 12 }).map((_, i) => {
          const startA = lonToAngle(i * 30, asc);
          const endA = lonToAngle(i * 30 + 30, asc);
          const [x0, y0] = polar(rZodiacOuter, startA);
          const [x1, y1] = polar(rZodiacOuter, endA);
          const [xi0, yi0] = polar(rZodiacInner, startA);
          const [xi1, yi1] = polar(rZodiacInner, endA);
          const elem = ELEMENT_OF_SIGN_INDEX(i);
          const midA = lonToAngle(i * 30 + 15, asc);
          const [gx, gy] = polar((rZodiacOuter + rZodiacInner) / 2, midA);
          return (
            <g
              key={`sign-${i}`}
              onMouseEnter={() => hover({ type: "sign", id: String(i) })}
              onMouseLeave={() => hover(null)}
              style={{ cursor: "help" }}
            >
              <path
                className="sign-ring"
                d={`M ${x0} ${y0} A ${rZodiacOuter} ${rZodiacOuter} 0 0 0 ${x1} ${y1} L ${xi1} ${yi1} A ${rZodiacInner} ${rZodiacInner} 0 0 1 ${xi0} ${yi0} Z`}
                fill={ELEMENT_COLORS[elem]}
                fillOpacity={0.1}
                stroke="var(--rule)"
                strokeWidth={0.75}
              />
              <text
                className="sign-glyph"
                x={gx}
                y={gy}
                dominantBaseline="central"
                textAnchor="middle"
              >
                {glyphText(SIGN_GLYPHS[i])}
              </text>
            </g>
          );
        })}

      {/* ---- Layer 2: House ring + cusps ---- */}
      {layers.houses && (
        <>
          <circle r={rHouseInner} fill="none" stroke="var(--rule)" strokeWidth={1} />
          {chart.houses.map((h, i) => {
            const a = lonToAngle(h.longitude, asc);
            const [x0, y0] = polar(rHouseInner, a);
            const [x1, y1] = polar(rHouseOuter, a);
            const isAngle = i === 0 || i === 3 || i === 6 || i === 9;
            const next = chart.houses[(i + 1) % 12].longitude;
            const span = (next - h.longitude + 360) % 360;
            const midLon = (h.longitude + span / 2) % 360;
            const [lx, ly] = polar((rHouseInner + rHouseOuter) / 2, lonToAngle(midLon, asc));
            // Transparent wedge over the house band → an easy hover/click target.
            const sA = lonToAngle(h.longitude, asc);
            const eA = lonToAngle(next, asc);
            const [wx0, wy0] = polar(rHouseOuter, sA);
            const [wx1, wy1] = polar(rHouseOuter, eA);
            const [wxi1, wyi1] = polar(rHouseInner, eA);
            const [wxi0, wyi0] = polar(rHouseInner, sA);
            const laf = span > 180 ? 1 : 0;
            return (
              <g key={`house-${i}`}>
                <path
                  className="house-wedge"
                  d={`M ${wx0} ${wy0} A ${rHouseOuter} ${rHouseOuter} 0 ${laf} 0 ${wx1} ${wy1} L ${wxi1} ${wyi1} A ${rHouseInner} ${rHouseInner} 0 ${laf} 1 ${wxi0} ${wyi0} Z`}
                  fill="transparent"
                  onMouseEnter={() => hover({ type: "house", id: String(h.index) })}
                  onMouseLeave={() => hover(null)}
                  onClick={(e) => { e.stopPropagation(); select({ type: "house", id: String(h.index) }); }}
                  style={{ cursor: "pointer" }}
                />
                <line
                  x1={x0}
                  y1={y0}
                  x2={x1}
                  y2={y1}
                  stroke={isAngle ? "var(--gold)" : "var(--rule)"}
                  strokeWidth={isAngle ? 1.8 : 0.6}
                  strokeDasharray={isAngle ? undefined : "2 3"}
                  onClick={(e) => {
                    e.stopPropagation();
                    select({ type: "house", id: String(h.index) });
                  }}
                  style={{ cursor: "pointer" }}
                />
                <text className="house-label" x={lx} y={ly} dominantBaseline="central" textAnchor="middle">
                  {h.index}
                </text>
              </g>
            );
          })}
        </>
      )}

      {/* ── Transit ring band (between house ring and zodiac) ── */}
      {layers.transits && transit && (
        <>
          {/* Annular band drawn as a thick stroked circle — perfectly seamless
              (the previous arc-hack left a hairline at 12 o'clock). */}
          <circle
            r={(rTransitOuter + rTransitInner) / 2}
            fill="none"
            stroke="rgba(46,134,193,0.06)"
            strokeWidth={rTransitOuter - rTransitInner}
          />
          {/* Separator ring — divides natal from transiting sky */}
          <circle r={rTransitInner} fill="none" stroke="rgba(46,134,193,0.28)" strokeWidth={1} />
          <circle r={rTransitOuter} fill="none" stroke="rgba(46,134,193,0.15)" strokeWidth={0.5} />
        </>
      )}

      {/* ── Transit ring labels (near Asc, 9 o'clock) ── */}
      {layers.transits && transit && (() => {
        const ascA = lonToAngle(asc, asc); // always points left (π)
        const labelA = ascA + 0.18; // slightly above the axis
        const [nx, ny] = polar((rTransitInner + rHouseOuter) / 2, labelA);
        const [tx, ty] = polar((rTransitOuter + rTransitInner) / 2, labelA);
        const transitDate = new Date(transit.transit_iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
        return (
          <>
            <text x={nx} y={ny} textAnchor="middle" dominantBaseline="central"
              fontSize={8} fill="rgba(201,168,76,0.45)" style={{ pointerEvents: "none" }}>
              natal
            </text>
            <text x={tx} y={ty} textAnchor="middle" dominantBaseline="central"
              fontSize={7.5} fill="rgba(126,184,212,0.55)" style={{ pointerEvents: "none" }}>
              sky {transitDate}
            </text>
          </>
        );
      })()}

      {/* Subtle inner boundary for the aspect disc */}
      <circle r={rAspect} fill="none" stroke="rgba(201,168,76,0.07)" strokeWidth={1.5} />

      {/* ---- Layer 5: Aspect chords ---- */}
      {layers.aspects &&
        visibleAspects.map((a) => {
          const p1 = planetById[a.p1];
          const p2 = planetById[a.p2];
          if (!p1 || !p2) return null;
          const [x1, y1] = polar(rAspect, lonToAngle(p1.longitude, asc));
          const [x2, y2] = polar(rAspect, lonToAngle(p2.longitude, asc));
          const active = aspectActive(a);
          const dim = aspectFocus && !active;
          const key = aspectKey(a);
          return (
            <g
              key={key}
              className={`aspect-chord ${active ? "is-active" : ""} ${dim ? "is-dim" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                select({ type: "aspect", id: key });
              }}
              onMouseEnter={() => hover({ type: "aspect", id: key })}
              onMouseLeave={() => hover(null)}
              style={{ cursor: "pointer" }}
            >
              {/* Invisible wide hit-line so the thin chord is easy to hover. */}
              <line className="aspect-hit" x1={x1} y1={y1} x2={x2} y2={y2} />
              <line
                className="aspect-line"
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={a.color}
                strokeWidth={active ? 2.4 : 1 + (8 - a.orb) / 8}
                strokeOpacity={dim ? 0.08 : active ? 0.95 : 0.5 - a.orb / 24}
                strokeDasharray={a.harmony === "challenging" ? undefined : a.type === "Sextile" ? "4 3" : undefined}
                filter={active ? "url(#glow)" : undefined}
              />
            </g>
          );
        })}

      {/* ---- Transit-to-natal aspect chords ---- */}
      {/* p1 = "t:PlanetName" (transiting), p2 = "PlanetName" (natal) */}
      {layers.transits && layers.aspects && transit &&
        transit.aspects_to_natal.map((a) => {
          const transId = a.p1.startsWith("t:") ? a.p1.slice(2) : a.p1;
          const natal_p  = planetById[a.p2];
          const trans_p  = transit.transiting.find((t) => t.id === transId);
          if (!natal_p || !trans_p) return null;
          const sel = selection ?? hovered;
          // Highlight when the hovered/selected planet matches either end of the chord.
          const active = sel?.type === "planet" && (sel.id === a.p2 || sel.id === transId);
          const dim    = planetFocus && !active;
          const [x1, y1] = polar(rAspect,  lonToAngle(natal_p.longitude, asc));
          const [x2, y2] = polar(rTransit, transitAngles[trans_p.id] ?? lonToAngle(trans_p.longitude, asc));
          const taKey = `${a.p1}|${a.p2}|${a.type}`;
          const taHov = hovered?.type === "transit_aspect" && hovered.id === taKey;
          return (
            <g
              key={`ta-${a.p1}-${a.p2}-${a.type}`}
              onMouseEnter={() => hover({ type: "transit_aspect", id: taKey })}
              onMouseLeave={() => hover(null)}
              style={{ cursor: "pointer" }}
            >
              {/* Invisible wide hit-line so the thin dashed chord is easy to hover. */}
              <line className="aspect-hit" x1={x1} y1={y1} x2={x2} y2={y2} />
              <line
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={a.color}
                strokeWidth={active || taHov ? 2.0 : 1.2}
                strokeOpacity={dim ? 0.06 : active || taHov ? 0.85 : 0.45}
                strokeDasharray="3 4"
                filter={active || taHov ? "url(#glow)" : undefined}
              />
            </g>
          );
        })}

      {/* ---- Layer 4: Natal planets + points ---- */}
      {layers.planets &&
        chart.planets
          .filter((p) => p.id !== "Descendant" && p.id !== "Imum Coeli")
          .map((p) => {
            const ringAngle = planetAngles[p.id] ?? lonToAngle(p.longitude, asc);
            const trueAngle = lonToAngle(p.longitude, asc);
            const isPoint = POINT_IDS.has(p.id) || p.id === "Ascendant" || p.id === "Midheaven";
            const r = isPoint ? rPlanet * 1.08 : rPlanet;
            const [gx, gy] = polar(r, ringAngle);
            const [tx, ty] = polar(rHouseInner, trueAngle);
            const sel = selection?.type === "planet" && selection.id === p.id;
            const hov = hovered?.type === "planet" && hovered.id === p.id;
            return (
              <g
                key={p.id}
                className="planet-node"
                onClick={(e) => {
                  e.stopPropagation();
                  select({ type: "planet", id: p.id });
                }}
                onMouseEnter={() => hover({ type: "planet", id: p.id })}
                onMouseLeave={() => hover(null)}
              >
                <line x1={tx} y1={ty} x2={gx} y2={gy} stroke="var(--rule)" strokeWidth={0.6} />
                {sel && (
                  <circle cx={gx} cy={gy} r={22} fill="var(--gold)" fillOpacity={0.22} filter="url(#glow)" />
                )}
                {hov && !sel && (
                  <circle cx={gx} cy={gy} r={17} fill="var(--gold)" fillOpacity={0.14} filter="url(#glow)" />
                )}
                {p.retrograde && (
                  <circle className="retro-ring" cx={gx} cy={gy} r={13} fill="none" stroke="var(--copper)" strokeWidth={1.2} />
                )}
                <text
                  className="planet-glyph"
                  x={gx}
                  y={gy}
                  dominantBaseline="central"
                  textAnchor="middle"
                  fontSize={isPoint && p.glyph.length > 1 ? 11 : 17}
                  fill={sel ? "var(--gold-soft)" : hov ? "var(--sepia)" : undefined}
                >
                  {p.glyph.length > 1 ? p.glyph : glyphText(p.glyph)}
                </text>
              </g>
            );
          })}

      {/* ---- Layer 3: Transit ring (bi-wheel outer ring) ---- */}
      {layers.transits && transit &&
        transit.transiting.map((p) => {
          const a = transitAngles[p.id] ?? lonToAngle(p.longitude, asc);
          const [gx, gy] = polar(rTransit, a);
          // Tick mark from separator to glyph position, like natal tick but outward
          const [tx, ty] = polar(rTransitInner, lonToAngle(p.longitude, asc));
          return (
            <g key={`t-${p.id}`} className="planet-node" opacity={0.9}>
              <line x1={tx} y1={ty} x2={gx} y2={gy} stroke="rgba(46,134,193,0.3)" strokeWidth={0.6} />
              {p.retrograde && (
                <circle cx={gx} cy={gy} r={10} fill="none"
                  stroke="rgba(184,115,51,0.6)" strokeWidth={0.8} />
              )}
              <text
                className="planet-glyph"
                x={gx} y={gy}
                dominantBaseline="central"
                textAnchor="middle"
                fontSize={13}
                fill="rgba(126,184,212,0.92)"
              >
                {p.glyph.length > 1 ? p.glyph : glyphText(p.glyph)}
              </text>
            </g>
          );
        })}

      {/* ---- Unified influence popover (planet · sign · house · aspect) ---- */}
      {hovered && (() => {
        // Build a descriptor for whatever is hovered. Returns null if not popable.
        type Pop = {
          ax: number; ay: number; accent: string; glyph: string; title: string;
          rx?: boolean; subtitle?: string; blurb: string;
          personal?: string; hasPersonal?: boolean;
        };
        const skip = (id: string) => POINT_IDS.has(id);
        let pop: Pop | null = null;

        if (hovered.type === "planet" && planetById[hovered.id]) {
          const p = planetById[hovered.id];
          const blurb = PLANET_INFLUENCE[p.id];
          if (blurb) {
            const ring = planetAngles[p.id] ?? lonToAngle(p.longitude, asc);
            const isPoint = POINT_IDS.has(p.id) || p.id === "Ascendant" || p.id === "Midheaven";
            const [ax, ay] = polar(isPoint ? rPlanet * 1.08 : rPlanet, ring);
            pop = {
              ax, ay, accent: "var(--gold)",
              glyph: p.glyph.length > 1 ? p.glyph : glyphText(p.glyph),
              title: p.id, rx: p.retrograde,
              subtitle: `${formatPos(p)} · ${ORDINAL(p.house)} house${!isPoint && p.dignity !== "Neutral" ? ` · ${p.dignity}` : ""}`,
              blurb,
            };
          }
        } else if (hovered.type === "sign") {
          const i = Number(hovered.id);
          const name = SIGN_NAMES[i];
          const elem = ELEMENT_OF_SIGN_INDEX(i);
          const [ax, ay] = polar((rZodiacOuter + rZodiacInner) / 2, lonToAngle(i * 30 + 15, asc));
          const here = chart.planets.filter(
            (p) => p.sign === name && p.id !== "Descendant" && p.id !== "Imum Coeli" && !skip(p.id)
          );
          pop = {
            ax, ay, accent: ELEMENT_COLORS[elem], glyph: glyphText(SIGN_GLYPHS[i]),
            title: name, subtitle: `${elem} · ${SIGN_MODALITIES[i % 3]}`,
            blurb: SIGN_INFLUENCE[name], hasPersonal: true,
            personal: here.length ? `Your ${here.map((p) => p.id).join(", ")} here.` : "No planets in this sign.",
          };
        } else if (hovered.type === "house") {
          const idx = Number(hovered.id);
          const h = chart.houses[idx - 1];
          if (h) {
            const next = chart.houses[idx % 12].longitude;
            const span = (next - h.longitude + 360) % 360;
            const [ax, ay] = polar((rHouseInner + rHouseOuter) / 2, lonToAngle((h.longitude + span / 2) % 360, asc));
            const tenants = chart.planets.filter((p) => p.house === idx && !skip(p.id));
            pop = {
              ax, ay, accent: "var(--gold)", glyph: "⌂", title: `${ORDINAL(idx)} House`,
              subtitle: `cusp ${h.degree}°${String(h.minute).padStart(2, "0")}' ${h.sign}`,
              blurb: HOUSE_INFLUENCE[idx], hasPersonal: true,
              personal: tenants.length
                ? `Tenants: ${tenants.map((p) => p.id).join(", ")}.`
                : "An empty house — its themes play out through its ruler.",
            };
          }
        } else if (hovered.type === "aspect") {
          const a = chart.aspects.find((x) => aspectKey(x) === hovered.id);
          const p1 = a && planetById[a.p1];
          const p2 = a && planetById[a.p2];
          if (a && p1 && p2) {
            const [x1, y1] = polar(rAspect, lonToAngle(p1.longitude, asc));
            const [x2, y2] = polar(rAspect, lonToAngle(p2.longitude, asc));
            pop = {
              ax: (x1 + x2) / 2, ay: (y1 + y2) / 2, accent: a.color,
              glyph: ASPECT_SYMBOL[a.type] ?? "∠", title: a.type,
              subtitle: `${a.p1} – ${a.p2}`,
              blurb: ASPECT_INFLUENCE[a.type] ?? "", hasPersonal: true,
              personal: `Orb ${a.orb}° · ${a.applying ? "applying" : "separating"}.`,
            };
          }
        } else if (hovered.type === "transit_aspect" && transit) {
          // Transit-to-natal chord: p1 = "t:<Transiting>", p2 = "<Natal>".
          const a = transit.aspects_to_natal.find((x) => `${x.p1}|${x.p2}|${x.type}` === hovered.id);
          const transId = a?.p1.startsWith("t:") ? a.p1.slice(2) : a?.p1;
          const natal_p = a && planetById[a.p2];
          const trans_p = a && transit.transiting.find((t) => t.id === transId);
          if (a && natal_p && trans_p && transId) {
            const [x1, y1] = polar(rAspect, lonToAngle(natal_p.longitude, asc));
            const [x2, y2] = polar(rTransit, transitAngles[trans_p.id] ?? lonToAngle(trans_p.longitude, asc));
            pop = {
              ax: (x1 + x2) / 2, ay: (y1 + y2) / 2, accent: a.color,
              glyph: ASPECT_SYMBOL[a.type] ?? "∠",
              title: `${transId} ${ASPECT_SYMBOL[a.type] ?? ""} ${a.p2}`.trim(),
              subtitle: `transiting ${transId} – natal ${a.p2}`,
              blurb: ASPECT_INFLUENCE[a.type] ?? "", hasPersonal: true,
              personal: `Orb ${a.orb}° · ${a.applying ? "applying" : "separating"}.`,
            };
          }
        }

        if (!pop) return null;
        const W = 216, H = 184;
        // Flip to whichever side keeps the card on-canvas, then clamp vertically.
        const px = pop.ax < 0 ? pop.ax + 24 : pop.ax - W - 24;
        const py = Math.max(-R + 8, Math.min(R - H - 8, pop.ay - H / 2));
        return (
          <foreignObject
            key={`${hovered.type}-${hovered.id}`}
            x={px} y={py} width={W} height={H}
            style={{ pointerEvents: "none", overflow: "visible" }}
          >
            <div className="wheel-popover" style={{ borderColor: pop.accent }}>
              <div className="wheel-popover-head">
                <span className="wheel-popover-glyph" style={{ color: pop.accent }}>{pop.glyph}</span>
                <span className="wheel-popover-name">{pop.title}</span>
                {pop.rx && <span className="wheel-popover-rx">℞</span>}
              </div>
              {pop.subtitle && <div className="wheel-popover-pos">{pop.subtitle}</div>}
              <div className="wheel-popover-blurb">{pop.blurb}</div>
              {pop.hasPersonal && (
                isSupporter
                  ? <div className="wheel-popover-personal">{pop.personal}</div>
                  : <div className="wheel-popover-personal locked">✦ supporter · your chart insight</div>
              )}
            </div>
          </foreignObject>
        );
      })()}

      {/* Cosmic heartbeat — ring of light emanating from center periodically */}
      <circle className="heartbeat" cx={0} cy={0} fill="none" stroke="rgba(201,168,76,0.45)" strokeWidth={1.5} />

      {/* Center caduceus — glows softly */}
      <text
        x={0}
        y={0}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={26}
        fill="rgba(201,168,76,0.22)"
        filter="url(#centerGlow)"
        style={{ pointerEvents: "none" }}
      >
        ☤
      </text>
      <text
        x={0}
        y={0}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={26}
        fill="rgba(201,168,76,0.55)"
        style={{ pointerEvents: "none" }}
      >
        ☤
      </text>
    </svg>
  );
};
