// WorldMap.tsx — the offline click-to-place map (GAZ-3).
//
// Replaces Leaflet + CARTO basemap tiles. Tiles were the second of the app's
// two external calls: every pan and zoom told a CDN which part of the world the
// visitor was examining, which for a BIRTHPLACE picker is the sensitive fact
// itself. This renders a vendored Natural Earth coastline instead, so the map
// costs zero requests and works with the network unplugged.
//
// Precision note, stated because the old map implied more than it delivered: a
// 110m Natural Earth outline is for COARSE placement. The numeric lat/lng
// fields stay authoritative and city search is the precise path.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { geoEquirectangular, geoPath, type GeoPermissibleObjects } from "d3-geo";

interface Props {
  lat: number;
  lng: number;
  onPick: (lat: number, lng: number) => void;
  height?: number;
}

// Equirectangular spans 360° x 180°, so the viewBox is the coordinate system:
// one unit is one degree and the SVG scales without touching the projection.
const W = 360;
const H = 180;

type Land = { type: "FeatureCollection"; features: GeoPermissibleObjects[] };

let landPromise: Promise<Land> | null = null;
function loadLand(): Promise<Land> {
  if (!landPromise) {
    landPromise = fetch("/gazetteer/land.json")
      .then((r) => {
        if (!r.ok) throw new Error(`land ${r.status}`);
        return r.json();
      })
      .catch((e) => {
        landPromise = null;
        throw e;
      });
  }
  return landPromise;
}

export const WorldMap: React.FC<Props> = ({ lat, lng, onPick, height = 180 }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [land, setLand] = useState<Land | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    loadLand()
      .then((d) => { if (live) setLand(d); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, []);

  // translate([W/2, H/2]) with scale W/2π puts 0°,0° at the centre and makes
  // the projection exactly fill the viewBox.
  const path = useMemo(() => {
    const projection = geoEquirectangular()
      .scale(W / (2 * Math.PI))
      .translate([W / 2, H / 2]);
    return geoPath(projection);
  }, []);

  const d = useMemo(() => {
    if (!land) return "";
    return land.features.map((f) => path(f)).filter(Boolean).join(" ");
  }, [land, path]);

  // Marker position is a direct degree mapping, matching the projection above.
  const mx = lng + 180;
  const my = 90 - lat;
  const placed = Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0);

  const pick = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    // Convert the click through the SVG's own coordinate space, so it stays
    // correct at any rendered size without reading layout boxes by hand.
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const p = pt.matrixTransform(ctm.inverse());
    const newLng = Math.max(-180, Math.min(180, p.x - 180));
    const newLat = Math.max(-90, Math.min(90, 90 - p.y));
    onPick(Math.round(newLat * 1000) / 1000, Math.round(newLng * 1000) / 1000);
  };

  return (
    <div
      style={{
        height,
        borderRadius: 8,
        border: "1px solid var(--rule)",
        overflow: "hidden",
        background: "#070710",
      }}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: "100%", height: "100%", display: "block", cursor: "crosshair" }}
        onClick={pick}
        role="img"
        aria-label="World map — click to set coordinates"
      >
        <rect x={0} y={0} width={W} height={H} fill="#070710" />
        {/* Equator and prime meridian: quiet orientation cues, not decoration. */}
        <g stroke="#c9a84c" strokeOpacity={0.14} strokeWidth={0.4}>
          <line x1={0} y1={H / 2} x2={W} y2={H / 2} />
          <line x1={W / 2} y1={0} x2={W / 2} y2={H} />
        </g>
        {d && <path d={d} fill="#1a1a2e" stroke="#3d3d5c" strokeWidth={0.3} />}
        {placed && (
          <g>
            <circle cx={mx} cy={my} r={4.5} fill="#c9a84c" fillOpacity={0.25} />
            <circle cx={mx} cy={my} r={1.8} fill="#c9a84c" stroke="#e0c578" strokeWidth={0.5} />
          </g>
        )}
      </svg>
      {failed && (
        <p style={{ fontSize: 10, color: "var(--danger)", margin: "2px 6px 0" }}>
          Map outline unavailable — coordinates and search still work.
        </p>
      )}
    </div>
  );
};
