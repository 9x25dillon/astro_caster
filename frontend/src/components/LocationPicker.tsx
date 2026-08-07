// LocationPicker.tsx — click-on-map or city-search lat/lng selector.
//
// GAZ-4: this component used to make the app's only two per-device external
// calls — CARTO basemap tiles and OSM Nominatim geocoding. Both are gone. The
// map is a vendored Natural Earth outline (WorldMap.tsx) and search resolves
// against a vendored GeoNames extract (lib/gazetteer.ts), so a birthplace —
// the most sensitive thing this app is told — never leaves the device.
//
// `⊕ use my location` is unchanged: navigator.geolocation is a device API and
// touches no network.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { WorldMap } from "./WorldMap";
import { loadGazetteer, type City, type Gazetteer } from "../lib/gazetteer";

interface Props {
  lat: number;
  lng: number;
  onChange: (lat: number, lng: number) => void;
}

function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}

/** "Ulm · BW, DE" — enough to tell same-named cities apart. */
function placeLabel(c: City) {
  return [c.admin1, c.country].filter(Boolean).join(", ");
}

export const LocationPicker: React.FC<Props> = ({ lat, lng, onChange }) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<City[]>([]);
  const [searching, setSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [attribution, setAttribution] = useState("");
  const gazRef = useRef<Gazetteer | null>(null);

  // Warm the gazetteer as soon as the picker mounts: the visitor has already
  // signalled intent by opening it, and this is the only slow step.
  useEffect(() => {
    let live = true;
    loadGazetteer()
      .then((g) => {
        if (!live) return;
        gazRef.current = g;
        setAttribution(g.attribution);
      })
      .catch(() => { /* search reports it honestly when used */ });
    return () => { live = false; };
  }, []);

  const search = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setNotFound(false);
    try {
      const gaz = gazRef.current ?? (await loadGazetteer());
      gazRef.current = gaz;
      const hits = gaz.search(q);
      setResults(hits);
      setNotFound(hits.length === 0);
    } catch {
      setResults([]);
      setNotFound(true);
    } finally {
      setSearching(false);
    }
  }, [query]);

  const choose = (c: City) => {
    onChange(round4(c.lat), round4(c.lng));
    setResults([]);
    setQuery(c.name);
  };

  const geolocate = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      onChange(round4(pos.coords.latitude), round4(pos.coords.longitude));
      setResults([]);
    });
  };

  return (
    <div>
      <div className="row" style={{ marginBottom: 6 }}>
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setNotFound(false); }}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="City or place name…"
          style={{ fontSize: 13 }}
        />
        <button
          className="ghost"
          onClick={search}
          disabled={searching}
          style={{ width: "auto", padding: "6px 11px", flexShrink: 0, fontSize: 13 }}
        >
          {searching ? "…" : "Find"}
        </button>
        <button
          className="ghost"
          onClick={geolocate}
          title="Use my location"
          style={{ width: "auto", padding: "6px 10px", flexShrink: 0, fontSize: 14 }}
        >
          ⊕
        </button>
      </div>

      {results.length > 0 && (
        <ul
          style={{
            listStyle: "none", margin: "0 0 6px", padding: 0,
            border: "1px solid var(--rule)", borderRadius: 6, overflow: "hidden",
          }}
        >
          {results.map((c, i) => (
            <li key={`${c.name}-${c.country}-${c.admin1}-${i}`}>
              <button
                className="ghost"
                onClick={() => choose(c)}
                style={{
                  width: "100%", textAlign: "left", padding: "5px 9px",
                  fontSize: 12, border: "none", borderRadius: 0,
                  display: "flex", justifyContent: "space-between", gap: 8,
                }}
              >
                <span>{c.name}</span>
                <span style={{ color: "var(--ink)", opacity: 0.7 }}>{placeLabel(c)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {notFound && (
        // Honest copy: the offline gazetteer covers cities of 5,000+, so a very
        // small birthplace genuinely may be absent. Say that, and point at the
        // path that always works, rather than implying the name was wrong.
        <p style={{ fontSize: 11, color: "var(--danger)", margin: "0 0 6px" }}>
          Not in the offline gazetteer (it covers towns of ~5,000+). Try a nearby
          larger town, or click the map to place it directly.
        </p>
      )}

      <WorldMap lat={lat} lng={lng} onPick={onChange} />

      <p style={{ fontSize: 11, color: "var(--ink)", margin: "5px 0 0" }}>
        Click the map or search to set coordinates · ⊕ uses your device location
      </p>
      <p style={{ fontSize: 10, color: "var(--ink)", opacity: 0.65, margin: "3px 0 0" }}>
        Places {attribution || "© GeoNames (CC BY 4.0)"} · outline Natural Earth
        (public domain) · both stored on your device, searched offline
      </p>
    </div>
  );
};
