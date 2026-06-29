// components/ElementModalityRadar.tsx
// Two small D3 radar/polar charts for elemental and modal balance.
import React from "react";
import { ELEMENT_COLORS } from "../lib/astro";

interface RadarProps {
  title: string;
  data: Record<string, number>;
  color: string;
  size?: number;
}

const Radar: React.FC<RadarProps> = ({ title, data, color, size = 160 }) => {
  const keys = Object.keys(data);
  const max = Math.max(1, ...Object.values(data));
  const R = size / 2 - 24;
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
        {/* axes + labels */}
        {keys.map((k, i) => {
          const [x, y] = axisPoint(i);
          const lx = cx + (R + 12) * Math.cos((i / n) * 2 * Math.PI - Math.PI / 2);
          const ly = cy + (R + 12) * Math.sin((i / n) * 2 * Math.PI - Math.PI / 2);
          return (
            <g key={k}>
              <line x1={cx} y1={cy} x2={x} y2={y} stroke="var(--rule)" strokeWidth={0.5} />
              <text x={lx} y={ly} fontSize={10} fill="var(--sepia)" textAnchor="middle" dominantBaseline="central">
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
