// ConstellationPath.tsx — R-4: the learning path drawn like sky instead of
// listed like homework (wireframes fig. 2). Each lesson is a star on a
// connected line; a star stays LIT once you've kept a reflection for it
// (real journal data, not a progress bar). Clicking a star publishes the
// lesson into the margin glass — the same selection the old list made.
import React from "react";

export interface PathStar {
  order: number;
  stage: string;
  name: string;
  walked: boolean;
}

const W = 640;
const H = 96;

export const ConstellationPath: React.FC<{
  stars: PathStar[];
  onSelect: (order: number) => void;
}> = ({ stars, onSelect }) => {
  if (stars.length === 0) return null;
  const n = stars.length;
  const x = (i: number) => (n === 1 ? W / 2 : 44 + (i * (W - 88)) / (n - 1));
  // Deterministic vertical scatter — the same path always draws the same sky.
  const y = (i: number) => 40 + Math.sin(i * 2.13 + 0.7) * 16;

  return (
    <svg
      className="constellation-path"
      viewBox={`0 0 ${W} ${H}`}
      role="list"
      aria-label="Learning path — lessons as a constellation; lit stars carry a kept reflection"
    >
      <polyline
        className="cp-line"
        points={stars.map((_, i) => `${x(i)},${y(i)}`).join(" ")}
        fill="none"
      />
      {stars.map((s, i) => (
        <g
          key={s.order}
          className={`cp-star ${s.walked ? "walked" : ""}`}
          role="listitem"
          tabIndex={0}
          aria-label={`${s.stage} · ${s.name}${s.walked ? " (reflection kept)" : ""}`}
          onClick={() => onSelect(s.order)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(s.order); } }}
        >
          <title>{`${s.stage} · ${s.name}${s.walked ? " — reflection kept" : ""}`}</title>
          {/* Invisible hit disc — real pointer target (thumb law ≥44px), and
              it keeps the group's bbox center clickable for hit-testing. */}
          <circle className="cp-hit" cx={x(i)} cy={y(i)} r={22} fill="transparent" />
          {s.walked && <circle className="cp-halo" cx={x(i)} cy={y(i)} r={10} />}
          <circle className="cp-core" cx={x(i)} cy={y(i)} r={s.walked ? 5 : 3.5} />
          <text className="cp-label" x={x(i)} y={y(i) + 24} textAnchor="middle">
            {s.name.replace(/^The /, "")}
          </text>
        </g>
      ))}
    </svg>
  );
};
