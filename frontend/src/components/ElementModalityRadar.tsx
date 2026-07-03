// components/ElementModalityRadar.tsx
// Two small D3 radar/polar charts for elemental and modal balance, with
// alchemical axis marks: element triangles and the tria prima.
import React from "react";
import { ELEMENT_COLORS } from "../lib/astro";
import { MODALITY_PRINCIPLE } from "../lib/alchemy";

interface RadarProps {
  title: string;
  data: Record<string, number>;
  color: string;
  size?: number;
}

/** ~9px alchemical mark for an axis key, drawn inline so it nests cleanly
 *  inside the radar SVG (the standalone AlchemySigil renders its own svg). */
const SigilMark: React.FC<{ k: string; x: number; y: number }> = ({ k, x, y }) => {
  const stroke = ELEMENT_COLORS[k] ?? "var(--amethyst-soft)";
  const common = { stroke, strokeWidth: 0.9, fill: "none", strokeLinejoin: "round" as const };
  const principle = MODALITY_PRINCIPLE[k]?.name;
  return (
    <g transform={`translate(${x} ${y})`} opacity={0.9}>
      {principle && <title>{`${principle} — ${MODALITY_PRINCIPLE[k].gloss}`}</title>}
      {(k === "Fire" || k === "Air") && <path d="M0 -4 L4 3.5 L-4 3.5 Z" {...common} />}
      {k === "Air" && <line x1={-2.6} y1={1.2} x2={2.6} y2={1.2} {...common} />}
      {(k === "Water" || k === "Earth") && <path d="M0 4 L-4 -3.5 L4 -3.5 Z" {...common} />}
      {k === "Earth" && <line x1={-2.6} y1={-1.2} x2={2.6} y2={-1.2} {...common} />}
      {k === "Cardinal" && ( /* Sulphur — triangle over cross */
        <>
          <path d="M0 -4.5 L3 0 L-3 0 Z" {...common} />
          <line x1={0} y1={0} x2={0} y2={4.5} {...common} />
          <line x1={-2.2} y1={2.4} x2={2.2} y2={2.4} {...common} />
        </>
      )}
      {k === "Fixed" && ( /* Salt — barred circle */
        <>
          <circle r={3.4} {...common} />
          <line x1={-3.4} y1={0} x2={3.4} y2={0} {...common} />
        </>
      )}
      {k === "Mutable" && ( /* Mercury — crescent, circle, cross */
        <>
          <path d="M-2.4 -4.6 A2.9 2.9 0 0 0 2.4 -4.6" {...common} />
          <circle cy={-0.6} r={2.3} {...common} />
          <line x1={0} y1={1.7} x2={0} y2={4.6} {...common} />
          <line x1={-1.8} y1={3.2} x2={1.8} y2={3.2} {...common} />
        </>
      )}
    </g>
  );
};

const Radar: React.FC<RadarProps> = ({ title, data, color, size = 160 }) => {
  const keys = Object.keys(data);
  const max = Math.max(1, ...Object.values(data));
  const R = size / 2 - 26;
  const cx = size / 2;
  const cy = size / 2;
  const n = keys.length;

  const point = (i: number, value: number): [number, number] => {
    const ang = (i / n) * 2 * Math.PI - Math.PI / 2;
    const rr = (value / max) * R;
    return [cx + rr * Math.cos(ang), cy + rr * Math.sin(ang)];
  };
  const axisPoint = (i: number): [number, number] => {
    const ang = (i / n) * 2 * Math.PI - Math.PI / 2;
    return [cx + R * Math.cos(ang), cy + R * Math.sin(ang)];
  };

  const poly = keys.map((k, i) => point(i, data[k]).join(",")).join(" ");

  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 12, color: "var(--ink)", letterSpacing: "0.08em", marginBottom: 2 }}>
        {title}
      </div>
      <svg width={size} height={size}>
        {/* concentric guide rings */}
        {[0.33, 0.66, 1].map((f) => (
          <circle key={f} cx={cx} cy={cy} r={R * f} fill="none" stroke="var(--rule)" strokeWidth={0.5} />
        ))}
        {/* axes + sigil marks + labels */}
        {keys.map((k, i) => {
          const [x, y] = axisPoint(i);
          const ang = (i / n) * 2 * Math.PI - Math.PI / 2;
          const lx = cx + (R + 14) * Math.cos(ang);
          const ly = cy + (R + 14) * Math.sin(ang);
          return (
            <g key={k}>
              <line x1={cx} y1={cy} x2={x} y2={y} stroke="var(--rule)" strokeWidth={0.5} />
              <SigilMark k={k} x={lx} y={ly - 8} />
              <text x={lx} y={ly + 5} fontSize={10} fill="var(--sepia)" textAnchor="middle" dominantBaseline="central">
                {k} {data[k]}
              </text>
            </g>
          );
        })}
        <polygon points={poly} fill={color} fillOpacity={0.25} stroke={color} strokeWidth={1.5} />
        {keys.map((k, i) => {
          const [x, y] = point(i, data[k]);
          return <circle key={k} cx={x} cy={y} r={2.5} fill={color} />;
        })}
      </svg>
    </div>
  );
};

export const ElementModalityRadar: React.FC<{
  elements: Record<string, number>;
  modalities: Record<string, number>;
}> = ({ elements, modalities }) => {
  // Order elements consistently for a stable shape.
  const ordered = (obj: Record<string, number>, order: string[]) =>
    Object.fromEntries(order.filter((k) => k in obj).map((k) => [k, obj[k]]));
  return (
    <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
      <Radar
        title="ELEMENTS"
        data={ordered(elements, ["Fire", "Earth", "Air", "Water"])}
        color={ELEMENT_COLORS.Air}
      />
      <Radar
        title="MODALITIES"
        data={ordered(modalities, ["Cardinal", "Fixed", "Mutable"])}
        color="#b87333"
      />
    </div>
  );
};
