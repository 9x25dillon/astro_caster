// TomeMeter.tsx — R-3: ✦ Generate My Tome (wireframes fig. 4). The spine is
// the app's long-game scoreboard: sessions, courses, and journal pages render
// as gilt segments of a book's edge, and compiling binds what exists today
// through the print-CSS path. Missing chapters are listed honestly.
import React, { useEffect, useState } from "react";
import { useStore } from "../store/useStore";
import { compileTome, loadManifest, type TomeManifest } from "../lib/tomeCompile";
import { trackEvent } from "../api/client";

export const TomeMeter: React.FC = () => {
  const chart = useStore((s) => s.chart);
  const birth = useStore((s) => s.birth);
  const [manifest, setManifest] = useState<TomeManifest | null>(null);
  const [msg, setMsg] = useState("");
  const [compiling, setCompiling] = useState(false);

  useEffect(() => {
    let stale = false;
    loadManifest(!!chart).then((m) => { if (!stale) setManifest(m); });
    return () => { stale = true; };
  }, [chart]);

  async function compile() {
    if (compiling) return;
    setCompiling(true); setMsg("");
    try {
      const ok = await compileTome(birth, chart);
      setMsg(ok ? "" : "Popup blocked — allow popups for this site to print the tome.");
      if (ok) trackEvent("tome_compiled", { bound: manifest?.bound ?? 0 });
    } finally {
      setCompiling(false);
    }
  }

  return (
    <div className="lib-surface lib-tome">
      <h2 className="lib-title">✦ Generate My Tome</h2>
      <p className="shelf-sub">
        Every reading thickens the book. The spine below fills as the shelf
        grows — compile it any time and the observatory binds what it holds
        today into one printed volume, on your device.
      </p>

      {manifest && (
        <>
          <div className="tome-spine" role="img"
               aria-label={`Tome spine — ${manifest.bound} of ${manifest.total} chapters carry material`}>
            {manifest.chapters.map((c) => (
              <div
                key={c.numeral}
                className={`tome-seg ${c.count > 0 ? "bound" : ""}`}
                style={{ flexGrow: 1 + Math.min(c.count, 6) }}
                title={`${c.numeral} · ${c.name} — ${c.detail}`}
              >
                <span className="tome-seg-numeral">{c.numeral}</span>
                {c.count > 0 && <span className="tome-seg-count">{c.count}</span>}
              </div>
            ))}
          </div>

          <div className="tome-actions">
            <button className="arc-draw-btn tome-compile" onClick={compile}
                    disabled={compiling || manifest.bound === 0}>
              {compiling ? "Binding…" : "⎙ Compile the tome"}
            </button>
            <span className="muted" style={{ fontSize: 12 }}>
              {manifest.bound} of {manifest.total} chapters carry material
            </span>
            {msg && <span className="shelf-msg">{msg}</span>}
          </div>

          <ul className="tome-waiting">
            {manifest.chapters.filter((c) => c.count === 0).map((c) => (
              <li key={c.numeral}>
                <b>{c.numeral} · {c.name}</b> — {c.detail}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
};
