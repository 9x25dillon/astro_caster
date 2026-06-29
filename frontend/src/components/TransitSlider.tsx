// components/TransitSlider.tsx — scrub a date to drive the transit overlay.
import React, { useEffect, useRef } from "react";
import { useStore } from "../store/useStore";

// Range spans ±50 years around "now" expressed as days from epoch midpoint.
const DAY = 86_400_000;

export const TransitSlider: React.FC = () => {
  const chart = useStore((s) => s.chart);
  const transit = useStore((s) => s.transit);
  const transitIso = useStore((s) => s.transitIso);
  const setTransitIso = useStore((s) => s.setTransitIso);
  const loadTransit = useStore((s) => s.loadTransit);
  const toggleLayer = useStore((s) => s.toggleLayer);
  const layers = useStore((s) => s.layers);

  const debounce = useRef<number | undefined>(undefined);

  const now = Date.now();
  const min = now - 50 * 365 * DAY;
  const max = now + 50 * 365 * DAY;
  const value = new Date(transitIso).getTime();

  // Debounced fetch as the user scrubs so we don't spam the backend.
  useEffect(() => {
    if (!chart || !layers.transits) return;
    window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => {
      loadTransit(new Date(value).toISOString());
    }, 250);
    return () => window.clearTimeout(debounce.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transitIso, layers.transits, chart]);

  if (!chart) {
    return (
      <div className="panel timeline">
        <span className="muted">Timeline appears once a chart is cast.</span>
      </div>
    );
  }

  const label = new Date(transitIso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const step = (days: number) =>
    setTransitIso(new Date(value + days * DAY).toISOString().slice(0, 16));

  return (
    <div className="panel timeline">
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span
          className={`chip ${layers.transits ? "active" : ""}`}
          onClick={() => toggleLayer("transits")}
        >
          {layers.transits ? "◉" : "○"} Transits
        </span>
        <button className="ghost" style={{ width: "auto" }} onClick={() => step(-365)}>‹ yr</button>
        <button className="ghost" style={{ width: "auto" }} onClick={() => step(-30)}>‹ mo</button>
        <input
          type="range"
          min={min}
          max={max}
          step={DAY}
          value={value}
          onChange={(e) => setTransitIso(new Date(Number(e.target.value)).toISOString().slice(0, 16))}
          style={{ flex: 1, minWidth: 180 }}
        />
        <button className="ghost" style={{ width: "auto" }} onClick={() => step(30)}>mo ›</button>
        <button className="ghost" style={{ width: "auto" }} onClick={() => step(365)}>yr ›</button>
        <input
          type="datetime-local"
          value={transitIso}
          onChange={(e) => setTransitIso(e.target.value)}
          style={{ width: 210 }}
        />
        <span style={{ color: "var(--gold-soft)", fontFamily: "var(--display)", fontSize: 16 }}>
          {label}
        </span>
      </div>
      {layers.transits && transit && (
        <div style={{ marginTop: 8, fontSize: 13, color: "var(--sepia)" }}>
          {transit.aspects_to_natal.slice(0, 6).map((a, i) => (
            <span key={i} style={{ marginRight: 12 }}>
              <span style={{ color: a.color }}>{a.type}</span> {a.p1.replace("t:", "")}→{a.p2}{" "}
              <span className="muted">({a.orb}°)</span>
            </span>
          ))}
          {transit.aspects_to_natal.length === 0 && (
            <span className="muted">No tight transiting aspects at this moment.</span>
          )}
        </div>
      )}
    </div>
  );
};
