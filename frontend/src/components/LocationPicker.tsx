// LocationPicker.tsx — click-on-map or city-search lat/lng selector.
import React, { useCallback, useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface Props {
  lat: number;
  lng: number;
  onChange: (lat: number, lng: number) => void;
}

function makeIcon() {
  return L.divIcon({
    className: "",
    html: `<div style="width:12px;height:12px;background:#c9a84c;border:2px solid #e0c578;border-radius:50%;box-shadow:0 0 10px rgba(201,168,76,0.7);"></div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });
}

function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}

export const LocationPicker: React.FC<Props> = ({ lat, lng, onChange }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const placeMarker = useCallback((newLat: number, newLng: number) => {
    const map = mapRef.current;
    if (!map) return;
    if (markerRef.current) {
      markerRef.current.setLatLng([newLat, newLng]);
    } else {
      markerRef.current = L.marker([newLat, newLng], { icon: makeIcon() }).addTo(map);
    }
  }, []);

  // Init map once on mount.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const initLat = lat || 40;
    const initLng = lng || 0;
    const map = L.map(containerRef.current, {
      center: [initLat, initLng],
      zoom: lat ? 6 : 2,
      attributionControl: false,
      zoomControl: true,
    });
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 19,
    }).addTo(map);
    L.control.attribution({ position: "bottomright", prefix: false })
      .addAttribution('<a href="https://carto.com/attributions" style="color:#555">© CARTO</a>')
      .addTo(map);
    map.on("click", (e: L.LeafletMouseEvent) => {
      onChange(round4(e.latlng.lat), round4(e.latlng.lng));
    });
    mapRef.current = map;
    if (lat && lng) placeMarker(lat, lng);
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep marker in sync when lat/lng change.
  useEffect(() => {
    if (!mapRef.current || (!lat && !lng)) return;
    placeMarker(lat, lng);
  }, [lat, lng, placeMarker]);

  const search = async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setNotFound(false);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`,
        { headers: { "Accept-Language": "en" } }
      );
      const data = await res.json();
      if (data[0]) {
        const newLat = round4(parseFloat(data[0].lat));
        const newLng = round4(parseFloat(data[0].lon));
        onChange(newLat, newLng);
        mapRef.current?.flyTo([newLat, newLng], 8);
      } else {
        setNotFound(true);
      }
    } catch {
      setNotFound(true);
    } finally {
      setSearching(false);
    }
  };

  const geolocate = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      const newLat = round4(pos.coords.latitude);
      const newLng = round4(pos.coords.longitude);
      onChange(newLat, newLng);
      mapRef.current?.flyTo([newLat, newLng], 8);
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
      {notFound && (
        <p style={{ fontSize: 11, color: "var(--danger)", margin: "0 0 6px" }}>
          Place not found — try a different name.
        </p>
      )}
      <div
        ref={containerRef}
        style={{
          height: 180,
          borderRadius: 8,
          border: "1px solid var(--rule)",
          overflow: "hidden",
        }}
      />
      <p style={{ fontSize: 11, color: "var(--ink)", margin: "5px 0 0" }}>
        Click the map or search to set coordinates · ⊕ uses your device location
      </p>
    </div>
  );
};
