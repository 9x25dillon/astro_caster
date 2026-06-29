// OracleModal.tsx — Life Path numerology + planetary sigil builder.
import React, { useMemo, useRef, useState } from "react";
import { useStore } from "../store/useStore";
import {
  computeLifePath, LIFE_PATH_DATA, getResonance,
} from "../lib/numerology";
import {
  buildChaosData, chaosToSVGPath,
  buildKameaData, kameaToSVGPath, kameaGridLines,
  KAMEA, planetToKamea, wordValue,
  type ChaosData, type KameaData,
} from "../lib/sigil";
import type { SoulProfile } from "../lib/archetypes";

// ── Life Path section ─────────────────────────────────────────────────────────

const LifePathSection: React.FC<{ profile: SoulProfile | null }> = ({ profile }) => {
  const birth = useStore((s) => s.birth);
  const isSupporter = useStore((s) => s.isSupporter);
  const openSupport = useStore((s) => s.openSupport);

  const lpNum = useMemo(() => computeLifePath(birth), [birth]);
  const data = LIFE_PATH_DATA[lpNum];
  const [c1] = profile?.elementColors ?? ["#c9a84c", "#b87333"];

  if (!data) return <p className="muted">Unable to compute life path.</p>;

  const resonance = profile ? getResonance(lpNum, profile.dominantElement) : null;

  return (
    <div>
      {/* Number display */}
      <div className="lp-header">
        <div className="lp-number-ring" style={{ borderColor: c1, boxShadow: `0 0 28px ${c1}28` }}>
          <span className="lp-number" style={{ color: c1 }}>{lpNum}</span>
        </div>
        <div className="lp-title-col">
          <div className="lp-name" style={{ color: c1 }}>{data.name}</div>
          <div className="lp-tagline">"{data.tagline}"</div>
          <div className="lp-keywords">
            {data.keywords.map((k) => (
              <span key={k} className="chip" style={{ fontSize: 11 }}>{k}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Frequency */}
      <div className="soul-section" style={{ marginTop: 16 }}>
        <h3 className="soul-section-label">Life Path Frequency</h3>
        <p className="soul-frequency-text">{data.frequency}</p>
      </div>

      {/* Gift + Shadow */}
      {isSupporter ? (
        <div className="lp-gift-shadow">
          <div className="lp-block" style={{ borderColor: `${c1}44` }}>
            <div className="lp-block-label" style={{ color: c1 }}>Your Gift</div>
            <p>{data.gift}</p>
          </div>
          <div className="lp-block" style={{ borderColor: "rgba(176,58,46,0.3)" }}>
            <div className="lp-block-label" style={{ color: "var(--copper)" }}>The Shadow</div>
            <p>{data.shadow}</p>
          </div>
        </div>
      ) : (
        <div className="soul-gate" style={{ marginTop: 12 }} onClick={() => openSupport(true)}>
          <div className="soul-gate-icon">☽</div>
          <div>
            <div style={{ color: "var(--gold-soft)" }}>Gift &amp; Shadow · Supporter Feature</div>
            <div className="muted" style={{ fontSize: 13 }}>
              Unlock the deeper reading of your life path's highest expression and core shadow work.
            </div>
          </div>
        </div>
      )}

      {/* Resonance with astro soul type */}
      {resonance && isSupporter && (
        <div className="soul-section" style={{ marginTop: 16 }}>
          <h3 className="soul-section-label">Resonance · Numerology × Astrology</h3>
          <div className="lp-resonance" style={{ borderColor: `${c1}44` }}>
            <span style={{ color: c1, fontSize: 11, display: "block", marginBottom: 6, letterSpacing: "0.06em" }}>
              LIFE PATH {lpNum} × {profile?.archetype?.toUpperCase()}
            </span>
            {resonance}
          </div>
        </div>
      )}

      <p className="muted" style={{ fontSize: 11, marginTop: 14 }}>
        Computed from {birth.day}/{birth.month}/{birth.year} · Pythagorean reduction
        {(lpNum === 11 || lpNum === 22 || lpNum === 33) ? " · Master Number preserved" : ""}
      </p>
    </div>
  );
};

// ── Sigil Builder section ─────────────────────────────────────────────────────

const SVG_SIZE = 300;
const CX = SVG_SIZE / 2;
const CY = SVG_SIZE / 2;
const CHAOS_R = 110;
const KAMEA_GRID = 200;

type SigilMethod = "chaos" | "kamea";

const SigilSection: React.FC<{ profile: SoulProfile | null }> = ({ profile }) => {
  const isSupporter = useStore((s) => s.isSupporter);
  const openSupport = useStore((s) => s.openSupport);
  const svgRef = useRef<SVGSVGElement>(null);

  const [text, setText] = useState("");
  const [method, setMethod] = useState<SigilMethod>("chaos");
  const [kameaPlanet, setKameaPlanet] = useState<string>(
    profile ? planetToKamea(profile.dominantPlanet) : "Saturn"
  );
  const [showGrid, setShowGrid] = useState(true);
  const [showLetters, setShowLetters] = useState(true);

  const [c1] = profile?.elementColors ?? ["#c9a84c", "#b87333"];

  const chaosData: ChaosData | null = useMemo(
    () => (text.trim().length >= 2 ? buildChaosData(text, CX, CY, CHAOS_R) : null),
    [text]
  );
  const kameaData: KameaData | null = useMemo(
    () => (text.trim().length >= 2 ? buildKameaData(text, kameaPlanet) : null),
    [text, kameaPlanet]
  );

  const gematValue = text ? wordValue(text) : 0;
  const square = KAMEA[kameaPlanet];

  const downloadSVG = () => {
    if (!svgRef.current) return;
    const serializer = new XMLSerializer();
    const src = serializer.serializeToString(svgRef.current);
    const blob = new Blob([src], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sigil-${text.slice(0, 20).replace(/\s+/g, "-").toLowerCase() || "oracle"}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isSupporter) {
    return (
      <div className="soul-gate" onClick={() => openSupport(true)}>
        <div className="soul-gate-icon" style={{ fontSize: 32 }}>⊕</div>
        <div>
          <div style={{ color: "var(--gold-soft)", marginBottom: 4 }}>Sigil Builder · Supporter Feature</div>
          <div className="muted" style={{ fontSize: 13 }}>
            Transform your intentions into sacred geometric sigils using the planetary magic squares.
            Support the observatory to unlock.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Intention input */}
      <label className="field">
        <span style={{ color: c1, letterSpacing: "0.06em" }}>YOUR INTENTION</span>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="I am aligned with my highest purpose…"
        />
      </label>

      {/* Method selector */}
      <div className="sigil-method-bar">
        <button
          className={`ghost ${method === "chaos" ? "active-method" : ""}`}
          onClick={() => setMethod("chaos")}
          style={{ flex: 1 }}
        >
          Chaos Magick
        </button>
        <button
          className={`ghost ${method === "kamea" ? "active-method" : ""}`}
          onClick={() => setMethod("kamea")}
          style={{ flex: 1 }}
        >
          Planetary Kamea
        </button>
      </div>

      {/* Kamea options */}
      {method === "kamea" && (
        <div className="row" style={{ marginBottom: 12, gap: 8 }}>
          <label className="field" style={{ marginBottom: 0 }}>
            <span>Planet / Square</span>
            <select value={kameaPlanet} onChange={(e) => setKameaPlanet(e.target.value)}>
              {Object.entries(KAMEA).map(([k, sq]) => (
                <option key={k} value={k}>{sq.glyph} {sq.planet} ({sq.size}×{sq.size})</option>
              ))}
            </select>
          </label>
          <label className="field" style={{ marginBottom: 0 }}>
            <span>Gematria value</span>
            <input value={gematValue || "—"} readOnly style={{ color: "var(--sepia)", cursor: "default" }} />
          </label>
        </div>
      )}

      {/* Chaos options */}
      {method === "chaos" && chaosData && (
        <div style={{ display: "flex", gap: 14, marginBottom: 10 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--ink)", cursor: "pointer" }}>
            <input type="checkbox" checked={showLetters} onChange={(e) => setShowLetters(e.target.checked)} />
            show letters
          </label>
        </div>
      )}
      {method === "kamea" && kameaData && (
        <div style={{ display: "flex", gap: 14, marginBottom: 10 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--ink)", cursor: "pointer" }}>
            <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />
            show grid
          </label>
        </div>
      )}

      {/* SVG canvas */}
      <div className="sigil-canvas-wrap">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
          width={SVG_SIZE}
          height={SVG_SIZE}
          style={{ display: "block", background: "#0b0b0f", borderRadius: 8 }}
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <filter id="sigil-glow" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {/* Outer circle */}
          <circle cx={CX} cy={CY} r={128} fill="none" stroke={c1} strokeWidth="0.6" opacity="0.2" />
          <circle cx={CX} cy={CY} r={120} fill="none" stroke={c1} strokeWidth="0.3" opacity="0.1" />

          {text.trim().length >= 2 ? (
            <>
              {method === "chaos" && chaosData && (
                <ChaosLayer data={chaosData} color={c1} showLetters={showLetters} />
              )}
              {method === "kamea" && kameaData && (
                <KameaLayer
                  data={kameaData}
                  color={c1}
                  showGrid={showGrid}
                  cx={CX} cy={CY}
                  gridSize={KAMEA_GRID}
                />
              )}
            </>
          ) : (
            <text x={CX} y={CY + 5} textAnchor="middle" fontSize="13"
              fill="rgba(154,143,120,0.4)" fontFamily="EB Garamond, serif">
              enter an intention above
            </text>
          )}
        </svg>
      </div>

      {text.trim().length >= 2 && (
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button className="ghost" onClick={downloadSVG} style={{ fontSize: 12, padding: "5px 12px", width: "auto" }}>
            ↓ Download SVG
          </button>
          {method === "kamea" && kameaData && (
            <span className="muted" style={{ fontSize: 11, alignSelf: "center" }}>
              {square?.planet} square · {kameaData.sequence.length} nodes
            </span>
          )}
          {method === "chaos" && chaosData && (
            <span className="muted" style={{ fontSize: 11, alignSelf: "center" }}>
              {chaosData.letters.length} letters · {chaosData.sequence.length} nodes
            </span>
          )}
        </div>
      )}

      <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>
        {method === "chaos"
          ? "Chaos method: vowels removed, unique consonants arranged in a circle, connected in the order they appear in your intention."
          : `Kamea method: each letter maps to a number (A=1…Z=26) reduced to the ${square?.planet} square range, then traced as a path through the ${square?.size}×${square?.size} magic square (sum=${square?.sum}).`}
      </p>
    </div>
  );
};

// ── Chaos SVG layer ───────────────────────────────────────────────────────────

const ChaosLayer: React.FC<{ data: ChaosData; color: string; showLetters: boolean }> = ({ data, color, showLetters }) => {
  const { letters, sequence, cx, cy, radius } = data;
  if (letters.length < 2) return null;
  const angleStep = (2 * Math.PI) / letters.length;
  const posAngle = (i: number) => i * angleStep - Math.PI / 2;
  const ptXY = (i: number): [number, number] => [
    cx + radius * Math.cos(posAngle(i)),
    cy + radius * Math.sin(posAngle(i)),
  ];

  const path = chaosToSVGPath(data);
  const startPt = ptXY(sequence[0]);
  const endPt = ptXY(sequence[sequence.length - 1]);

  return (
    <>
      {/* Letter positions (faint) — fade in with a gentle stagger */}
      {showLetters && letters.map((l, i) => {
        const [x, y] = ptXY(i);
        return (
          <g key={l} className="sigil-letter-in" style={{ animationDelay: `${i * 0.04}s` }}>
            <circle cx={x} cy={y} r={11} fill="rgba(11,11,15,0.8)" stroke={color} strokeWidth="0.4" opacity="0.3" />
            <text x={x} y={y + 5} textAnchor="middle" fontSize="11"
              fill={color} opacity="0.45" fontFamily="EB Garamond, serif">{l}</text>
          </g>
        );
      })}
      {/* Sigil path — traces itself on. Keyed on the path so it redraws on change. */}
      <path
        key={path}
        className="sigil-path-draw"
        d={path}
        pathLength={1}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        opacity="0.7"
        strokeLinejoin="round"
        filter="url(#sigil-glow)"
      />
      {/* Start dot (filled) */}
      <circle key={`s-${path}`} className="sigil-mark-in" style={{ animationDelay: "0.1s" }}
        cx={startPt[0]} cy={startPt[1]} r={5} fill={color} opacity="0.85" filter="url(#sigil-glow)" />
      {/* End mark (open ring) — appears as the trace completes */}
      <circle key={`e-${path}`} className="sigil-mark-in" style={{ animationDelay: "1.5s" }}
        cx={endPt[0]} cy={endPt[1]} r={6} fill="none" stroke={color} strokeWidth="1.5" opacity="0.7" />
      <circle key={`e2-${path}`} className="sigil-mark-in" style={{ animationDelay: "1.62s" }}
        cx={endPt[0]} cy={endPt[1]} r={2} fill={color} opacity="0.5" />
    </>
  );
};

// ── Kamea SVG layer ───────────────────────────────────────────────────────────

const KameaLayer: React.FC<{
  data: KameaData; color: string; showGrid: boolean;
  cx: number; cy: number; gridSize: number;
}> = ({ data, color, showGrid, cx, cy, gridSize }) => {
  const { square, positions } = data;
  const n = square.size;
  const cellSize = gridSize / n;
  const left = cx - gridSize / 2;
  const top = cy - gridSize / 2;

  const toXY = ([r, c]: [number, number]): [number, number] => [
    left + (c + 0.5) * cellSize,
    top + (r + 0.5) * cellSize,
  ];

  const path = kameaToSVGPath(data, cx, cy, gridSize);
  const gridLines = kameaGridLines(cx, cy, gridSize, n);
  const startXY = toXY(positions[0]);
  const endXY = toXY(positions[positions.length - 1]);

  return (
    <>
      {/* Grid + numbers — fade in together as the stage for the trace.
          Wrapped in one group so each element keeps its own faint opacity. */}
      {showGrid && (
        <g className="sigil-letter-in">
          {gridLines.map((l, i) => (
            <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
              stroke={color} strokeWidth="0.4" opacity="0.15" />
          ))}
          {square.grid.map((row, r) =>
            row.map((val, c) => (
              <text key={`${r}-${c}`}
                x={left + (c + 0.5) * cellSize}
                y={top + (r + 0.5) * cellSize + 4}
                textAnchor="middle" fontSize={Math.max(8, 14 - n)}
                fill={color} opacity="0.25" fontFamily="EB Garamond, serif"
              >{val}</text>
            ))
          )}
        </g>
      )}
      {/* Sigil path — traces itself through the magic square. */}
      <path
        key={path}
        className="sigil-path-draw"
        d={path}
        pathLength={1}
        fill="none"
        stroke={color}
        strokeWidth="2"
        opacity="0.75"
        strokeLinejoin="round"
        strokeLinecap="round"
        filter="url(#sigil-glow)"
      />
      {/* Start */}
      <circle key={`s-${path}`} className="sigil-mark-in" style={{ animationDelay: "0.1s" }}
        cx={startXY[0]} cy={startXY[1]} r={5} fill={color} opacity="0.9" filter="url(#sigil-glow)" />
      {/* End — appears as the trace completes */}
      <circle key={`e-${path}`} className="sigil-mark-in" style={{ animationDelay: "1.5s" }}
        cx={endXY[0]} cy={endXY[1]} r={7} fill="none" stroke={color} strokeWidth="1.5" opacity="0.75" />
      <circle key={`e2-${path}`} className="sigil-mark-in" style={{ animationDelay: "1.62s" }}
        cx={endXY[0]} cy={endXY[1]} r={2.5} fill={color} opacity="0.6" />
    </>
  );
};

// ── Combined modal ────────────────────────────────────────────────────────────

type Tab = "lifepath" | "sigil";

export const OracleModal: React.FC<{ onClose: () => void; profile: SoulProfile | null }> = ({ onClose, profile }) => {
  const [tab, setTab] = useState<Tab>("lifepath");

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal oracle-modal">
        <button className="modal-close" onClick={onClose}>×</button>
        <h2 className="section" style={{ marginTop: 0 }}>⊙ The Oracle</h2>

        {/* Tabs */}
        <div className="oracle-tabs">
          <button className={`oracle-tab ${tab === "lifepath" ? "active" : ""}`} onClick={() => setTab("lifepath")}>
            Ⅰ Life Path
          </button>
          <button className={`oracle-tab ${tab === "sigil" ? "active" : ""}`} onClick={() => setTab("sigil")}>
            ⊕ Sigil Builder
          </button>
        </div>

        <div style={{ marginTop: 16 }}>
          {tab === "lifepath" && <LifePathSection profile={profile} />}
          {tab === "sigil" && <SigilSection profile={profile} />}
        </div>
      </div>
    </div>
  );
};
