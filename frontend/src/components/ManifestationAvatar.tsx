// ManifestationAvatar.tsx — procedural SVG avatar built from chart data.
import React, { useMemo } from "react";
import type { ChartResponse } from "../types";
import type { SoulProfile } from "../lib/archetypes";

const SIZE = 260;
const CX = SIZE / 2;
const CY = SIZE / 2;
const PLANET_R = 96;
const INNER_R = 50;
const OUTER_R = 118;

const PLANET_GLYPHS: Record<string, string> = {
  Sun: "☉", Moon: "☽", Mercury: "☿", Venus: "♀", Mars: "♂",
  Jupiter: "♃", Saturn: "♄", Uranus: "♅", Neptune: "♆", Pluto: "♇",
  Chiron: "⚷",
};
const SKIP = new Set(["Ascendant", "Midheaven", "Descendant", "Imum Coeli", "South Node", "Part of Fortune", "Lilith"]);

const ELEM_DOT_COLORS: Record<string, string> = {
  Fire: "#e8b84b", Earth: "#8faa5a", Air: "#7ab4d4", Water: "#4a7fb8",
};

// Longitude → SVG polar angle (0° lon = top, clockwise)
function lonAngle(lon: number): number {
  return (lon * Math.PI) / 180 - Math.PI / 2;
}

function xy(r: number, a: number): [number, number] {
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
}

function arcPath(r: number, a0: number, a1: number): string {
  const [x1, y1] = xy(r, a0);
  const [x2, y2] = xy(r, a1);
  const large = Math.abs(a1 - a0) > Math.PI ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

// ── Modality form inscribed at radius r ──────────────────────────────────────

const ModalityForm: React.FC<{ modality: string; r: number; color: string }> = ({ modality, r, color }) => {
  if (modality === "Cardinal") {
    // Diamond pointing at 4 cardinal directions
    const pts = [0, 90, 180, 270]
      .map((d) => { const a = lonAngle(d + 90); return `${CX + r * Math.cos(a)},${CY + r * Math.sin(a)}`; })
      .join(" ");
    return <polygon points={pts} fill="none" stroke={color} strokeWidth="1" opacity="0.22" />;
  }
  if (modality === "Fixed") {
    // Square at 45° offset
    const pts = [45, 135, 225, 315]
      .map((d) => { const a = lonAngle(d + 90); return `${CX + r * Math.cos(a)},${CY + r * Math.sin(a)}`; })
      .join(" ");
    return <polygon points={pts} fill="none" stroke={color} strokeWidth="1" opacity="0.22" />;
  }
  // Mutable: three flowing arcs (triskelion)
  const arms = [0, 120, 240].map((deg) => {
    const a0 = lonAngle(deg);
    const amid = lonAngle(deg + 60);
    const a1 = lonAngle(deg + 120);
    const [sx, sy] = xy(r * 0.28, a0);
    const [cx1, cy1] = xy(r * 0.85, amid);
    const [ex, ey] = xy(r * 0.28, a1);
    return `M ${sx} ${sy} Q ${cx1} ${cy1} ${ex} ${ey}`;
  });
  return (
    <g opacity="0.22">
      {arms.map((d, i) => <path key={i} d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" />)}
    </g>
  );
};

// ── Main avatar ───────────────────────────────────────────────────────────────

interface Props {
  chart: ChartResponse;
  profile: SoulProfile;
  size?: number;
}

export const ManifestationAvatar: React.FC<Props> = ({ chart, profile, size = SIZE }) => {
  const [c1, c2] = profile.elementColors;
  const id = `av-${profile.dominantElement}`;

  const visiblePlanets = useMemo(
    () => chart.planets.filter((p) => !SKIP.has(p.id) && PLANET_GLYPHS[p.id]),
    [chart]
  );

  const webLines = useMemo(
    () =>
      chart.aspects
        .filter((a) => a.orb < 4.5 && !SKIP.has(a.p1) && !SKIP.has(a.p2))
        .map((a) => {
          const p1 = visiblePlanets.find((p) => p.id === a.p1);
          const p2 = visiblePlanets.find((p) => p.id === a.p2);
          if (!p1 || !p2) return null;
          const [x1, y1] = xy(PLANET_R, lonAngle(p1.longitude));
          const [x2, y2] = xy(PLANET_R, lonAngle(p2.longitude));
          return { x1, y1, x2, y2, color: a.color, key: `${a.p1}-${a.p2}-${a.type}` };
        })
        .filter(Boolean),
    [chart, visiblePlanets]
  );

  const northNode = chart.planets.find((p) => p.id === "North Node");
  const nodeAngle = northNode ? lonAngle(northNode.longitude) : null;

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      width={size}
      height={size}
      style={{ display: "block", overflow: "visible" }}
    >
      <defs>
        <radialGradient id={`${id}-aura`} cx="50%" cy="50%">
          <stop offset="0%"   stopColor={c2} stopOpacity="0.0" />
          <stop offset="50%"  stopColor={c2} stopOpacity="0.06" />
          <stop offset="85%"  stopColor={c1} stopOpacity="0.18" />
          <stop offset="100%" stopColor={c1} stopOpacity="0.0" />
        </radialGradient>
        <radialGradient id={`${id}-core`} cx="50%" cy="50%">
          <stop offset="0%"   stopColor={c1} stopOpacity="0.12" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        <filter id={`${id}-glow`} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id={`${id}-softglow`} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="8" />
        </filter>
      </defs>

      {/* Soft outer aura */}
      <circle cx={CX} cy={CY} r={OUTER_R + 10} fill={`url(#${id}-aura)`} />

      {/* Concentric atmosphere rings */}
      {[OUTER_R, OUTER_R - 12, OUTER_R - 24].map((r, i) => (
        <circle key={r} cx={CX} cy={CY} r={r} fill="none"
          stroke={c1} strokeWidth="0.5" opacity={0.12 + i * 0.06} />
      ))}

      {/* North Node manifestation arc */}
      {nodeAngle !== null && (
        <>
          <path
            d={arcPath(OUTER_R, nodeAngle - 0.42, nodeAngle + 0.42)}
            fill="none" stroke={c1} strokeWidth="6"
            strokeLinecap="round" opacity="0.15"
            filter={`url(#${id}-softglow)`}
          />
          <path
            d={arcPath(OUTER_R, nodeAngle - 0.38, nodeAngle + 0.38)}
            fill="none" stroke={c1} strokeWidth="3"
            strokeLinecap="round" opacity="0.65"
            filter={`url(#${id}-glow)`}
            className="avatar-manifest-arc"
          />
          {/* Arrow at the tip */}
          {(() => {
            const [tx, ty] = xy(OUTER_R + 6, nodeAngle);
            return <circle cx={tx} cy={ty} r="3" fill={c1} opacity="0.8" filter={`url(#${id}-glow)`} />;
          })()}
        </>
      )}

      {/* Aspect web */}
      {webLines.map((l) => l && (
        <line key={l.key}
          x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
          stroke={l.color} strokeWidth="0.7" opacity="0.25"
        />
      ))}

      {/* Modality form */}
      <ModalityForm modality={profile.dominantModality} r={72} color={c2} />

      {/* Planet ring */}
      <circle cx={CX} cy={CY} r={PLANET_R} fill="none" stroke={c2} strokeWidth="0.4" opacity="0.18" />

      {/* Planet dots */}
      {visiblePlanets.map((p) => {
        const a = lonAngle(p.longitude);
        const [px, py] = xy(PLANET_R, a);
        const dc = ELEM_DOT_COLORS[p.element] ?? c1;
        return (
          <g key={p.id}>
            <circle cx={px} cy={py} r={p.retrograde ? 4 : 3}
              fill={dc} opacity={0.75}
              filter={`url(#${id}-glow)`}
            />
            {p.retrograde && (
              <circle cx={px} cy={py} r={6} fill="none" stroke={dc} strokeWidth="0.6" opacity="0.4" />
            )}
          </g>
        );
      })}

      {/* Inner sanctum */}
      <circle cx={CX} cy={CY} r={INNER_R + 6} fill={`url(#${id}-core)`} />
      <circle cx={CX} cy={CY} r={INNER_R + 2} fill="rgba(11,11,15,0.75)" />
      <circle cx={CX} cy={CY} r={INNER_R} fill="none"
        stroke={c1} strokeWidth="1" opacity="0.55"
        filter={`url(#${id}-glow)`}
      />

      {/* Dominant planet glyph */}
      <text
        x={CX} y={CY + 15}
        textAnchor="middle"
        fontSize="40"
        fill={c1}
        fontFamily="EB Garamond, Garamond, serif"
        filter={`url(#${id}-glow)`}
        opacity="0.9"
        className="avatar-glyph"
      >
        {profile.dominantGlyph}
      </text>
    </svg>
  );
};
