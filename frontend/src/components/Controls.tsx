// components/Controls.tsx — left rail: birth data form, layers, radar.
import React, { useState } from "react";
import { useStore } from "../store/useStore";
import { ElementModalityRadar } from "./ElementModalityRadar";
// Lazy: LocationPicker pulls in leaflet (~150 kB chunk) — load it on first
// "pick on map", not at boot (the map is a rarely-opened affordance).
const LocationPicker = React.lazy(() =>
  import("./LocationPicker").then((m) => ({ default: m.LocationPicker }))
);
import { ProfileManager } from "./ProfileManager";
import type { BirthInput, LayerState } from "../types";

const HOUSE_SYSTEMS: Record<string, string> = {
  P: "Placidus",
  K: "Koch",
  O: "Porphyry",
  R: "Regiomontanus",
  C: "Campanus",
  E: "Equal",
  W: "Whole Sign",
  B: "Alcabitius",
};

const num = (v: string) => (v === "" ? 0 : Number(v));

export const Controls: React.FC<{
  onOpenGlossary: () => void;
  onOpenSoul: () => void;
  onOpenOracle: () => void;
  onOpenForecast: () => void;
  onNewChart: () => void;
}> = ({ onOpenGlossary, onOpenSoul, onOpenOracle, onOpenForecast, onNewChart }) => {
  const [showMap, setShowMap] = useState(false);
  const birth = useStore((s) => s.birth);
  const setBirth = useStore((s) => s.setBirth);
  const generate = useStore((s) => s.generate);
  const loading = useStore((s) => s.loading);
  const error = useStore((s) => s.error);
  const layers = useStore((s) => s.layers);
  const toggleLayer = useStore((s) => s.toggleLayer);
  const chart = useStore((s) => s.chart);

  const field = (key: keyof BirthInput, label: string, props: object = {}) => (
    <label className="field" style={{ marginBottom: 0 }}>
      <span>{label}</span>
      <input
        value={(birth[key] as number | string) ?? ""}
        onChange={(e) => setBirth({ [key]: num(e.target.value) } as Partial<BirthInput>)}
        {...props}
      />
    </label>
  );

  const layerKeys: (keyof LayerState)[] = [
    "zodiac",
    "houses",
    "planets",
    "aspects",
    "transits",
    "minorAspects",
  ];

  return (
    <div className="panel controls">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <h2 className="section" style={{ margin: 0 }}>Birth Data</h2>
        <button className="ghost" style={{ fontSize: 11, padding: "3px 8px", width: "auto" }} onClick={onNewChart}>
          ✦ New
        </button>
      </div>
      {birth.label && <p className="muted" style={{ marginTop: 2 }}>{birth.label}</p>}

      <div className="row">
        {field("year", "Year", { type: "number" })}
        {field("month", "Month", { type: "number", min: 1, max: 12 })}
        {field("day", "Day", { type: "number", min: 1, max: 31 })}
      </div>
      <div style={{ height: 8 }} />
      <div className="row">
        {field("hour", "Hour", { type: "number", min: 0, max: 23 })}
        {field("minute", "Min", { type: "number", min: 0, max: 59 })}
        {field("tz_offset", "TZ ±h", { type: "number", step: 0.25 })}
      </div>
      <div style={{ height: 8 }} />
      <div className="row">
        {field("lat", "Latitude", { type: "number", step: 0.0001 })}
        {field("lng", "Longitude", { type: "number", step: 0.0001 })}
      </div>
      <div style={{ marginTop: 6 }}>
        <button
          className="ghost"
          onClick={() => setShowMap((v) => !v)}
          style={{ fontSize: 12, padding: "4px 10px", width: "auto" }}
        >
          {showMap ? "▲ hide map" : "⊕ pick on map"}
        </button>
      </div>
      {showMap && (
        <div style={{ marginTop: 8 }}>
          <React.Suspense fallback={<p className="dim" style={{ fontSize: 12 }}>summoning map…</p>}>
            <LocationPicker
              lat={birth.lat}
              lng={birth.lng}
              onChange={(lat, lng) => setBirth({ lat, lng })}
            />
          </React.Suspense>
        </div>
      )}
      <div style={{ height: 8 }} />
      <div className="row">
        <label className="field" style={{ marginBottom: 0 }}>
          <span>House system</span>
          <select
            value={birth.house_system}
            onChange={(e) => setBirth({ house_system: e.target.value })}
          >
            {Object.entries(HOUSE_SYSTEMS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>Zodiac</span>
          <select
            value={birth.zodiac}
            onChange={(e) => setBirth({ zodiac: e.target.value as "tropical" | "sidereal" })}
          >
            <option value="tropical">Tropical</option>
            <option value="sidereal">Sidereal</option>
          </select>
        </label>
      </div>

      <div style={{ height: 12 }} />
      <button className="primary" onClick={() => generate()} disabled={loading}>
        {loading ? "Calculating…" : "✶ Cast Chart"}
      </button>
      {error && <p className="error" style={{ marginTop: 8 }}>{error}</p>}

      <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
        {chart && (
          <button className="ghost" onClick={onOpenSoul} style={{ fontSize: 11, padding: "4px 9px", width: "auto" }}>
            ☽ Soul Profile
          </button>
        )}
        <button className="ghost" onClick={onOpenOracle} style={{ fontSize: 11, padding: "4px 9px", width: "auto" }}>
          ⊙ Oracle
        </button>
        <button className="ghost" onClick={onOpenGlossary} style={{ fontSize: 11, padding: "4px 9px", width: "auto" }}>
          ⊕ Glossary
        </button>
        <button className="ghost" onClick={onOpenForecast} style={{ fontSize: 11, padding: "4px 9px", width: "auto" }}>
          ☌ Forecast
        </button>
      </div>

      <h2 className="section" style={{ marginTop: 18 }}>Layers</h2>
      <div className="layer-toggles">
        {layerKeys.map((k) => (
          <span
            key={k}
            className={`chip ${layers[k] ? "active" : ""}`}
            onClick={() => toggleLayer(k)}
          >
            {layers[k] ? "◉" : "○"} {k}
          </span>
        ))}
      </div>

      {chart && (
        <>
          <h2 className="section" style={{ marginTop: 18 }}>Balance</h2>
          <ElementModalityRadar elements={chart.elements} modalities={chart.modalities} />
        </>
      )}

      <ProfileManager onLoad={() => {}} />
    </div>
  );
};
