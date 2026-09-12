import { useId, useState } from "react";
import { useStore } from "../store/useStore";

/** Semantic HTML + inline SVG: chart longitudes, never simulated ephemerides.
 * React state drives native buttons; the decorative rotor alone is animated.
 * CSS container queries let this instrument travel between shell and panels.
 */
export function CelestialIndex() {
  const chart = useStore((s) => s.chart);
  const isCurrentSky = useStore((s) => s.isCurrentSky);
  const select = useStore((s) => s.select);
  const [bodyId, setBodyId] = useState("sun");
  const labelId = useId();
  const bodies = chart?.planets.filter((p) => ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn"].includes(p.id.toLowerCase())) ?? [];
  const body = bodies.find((p) => p.id.toLowerCase() === bodyId) ?? bodies[0];
  const longitude = body ? ((body.longitude % 360) + 360) % 360 : 0;
  return (
    <section className="celestial-index" aria-labelledby={labelId}>
      <div className="celestial-index-inner">
        <div className="index-seal" aria-hidden="true">
          <svg viewBox="0 0 160 160" fill="none">
            <circle cx="80" cy="80" r="74" />
            <circle cx="80" cy="80" r="61" />
            <g className="index-lattice">
              <path d="M80 19 133 111H27ZM80 141 27 49H133Z" />
              <circle cx="80" cy="80" r="36" />
            </g>
            {Array.from({ length: 60 }, (_, i) => (
              <path key={i} d={`M80 6V${i % 5 === 0 ? 17 : 10}`} transform={`rotate(${i * 6} 80 80)`} />
            ))}
            {body && <g transform={`rotate(${longitude} 80 80)`} className="index-pointer"><path d="M80 80V23" /><circle cx="80" cy="23" r="4" /></g>}
            <circle cx="80" cy="80" r="4" className="index-axis" />
          </svg>
        </div>
        <div className="index-title">
          <p className="instrument-label">Instrument № 01 · {isCurrentSky ? "Current sky" : "Natal sky"}</p>
          <h2 id={labelId}>Celestial Index</h2>
          <p className="index-motto">As above, so below.</p>
        </div>
        <div className="index-reading">
          <div className="index-bodies" role="group" aria-label="Inspect celestial body">
            {bodies.map((p) => (
              <button key={p.id} type="button" aria-label={`Inspect ${p.id}`} aria-pressed={body?.id === p.id}
                onClick={() => { setBodyId(p.id.toLowerCase()); select({ type: "planet", id: p.id }); }}>
                <span aria-hidden="true">{p.glyph}</span>
              </button>
            ))}
          </div>
          <p className="index-coordinate" aria-live="polite" aria-atomic="true">
            {body ? <><span>{body.id} / {body.sign}</span><strong>{String(body.degree).padStart(2, "0")}° {String(body.minute).padStart(2, "0")}′ <small>{body.retrograde ? "℞ Retrograde" : "Direct"}</small></strong></> : <span>Awaiting chart coordinates…</span>}
          </p>
        </div>
        <div className="index-colophon"><span aria-hidden="true">✧</span><span>Longitude<br />{body ? `${longitude.toFixed(2)}°` : "—"}</span><span className="instrument-label">Zodiac reference</span></div>
      </div>
    </section>
  );
}
