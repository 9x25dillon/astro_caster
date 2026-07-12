// PredictiveModal.tsx — secondary progressions, solar returns, eclipse timeline.
// Track R (R-2): a chapter surface (III · Timing), not a modal — no overlay,
// no ✕; Esc and the dial navigate home via the App shell.
import React, { useState } from "react";
import { useStore } from "../store/useStore";
import {
  fetchProgressed, fetchSolarReturn, fetchEclipses, trackEvent, localToday,
  localProgressed, localSolarReturn, localEclipses, isOfflineError,
  type ProgressedChart, type SolarReturnChart, type EclipseTimeline,
} from "../api/client";

type Tab = "progressions" | "solar" | "eclipses";
// Browser-local calendar date — toISOString() is UTC and shows the wrong
// default date for users within tz-offset hours of midnight.
const today = localToday;

export const PredictiveModal: React.FC = () => {
  const birth = useStore((s) => s.birth);
  const [tab, setTab] = useState<Tab>("progressions");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [onDevice, setOnDevice] = useState(false);

  const [target, setTarget] = useState(today());
  const [year, setYear] = useState(new Date().getFullYear());
  const [prog, setProg] = useState<ProgressedChart | null>(null);
  const [sr, setSr] = useState<SolarReturnChart | null>(null);
  const [ecl, setEcl] = useState<EclipseTimeline | null>(null);

  async function run<T>(fn: () => Promise<T>, set: (v: T) => void, ev: string, local?: () => Promise<T>) {
    setLoading(true); setErr(null); setOnDevice(false);
    try { set(await fn()); trackEvent(ev); }
    catch (e) {
      // Backend unreachable → compute on-device via @astra/core (full body set).
      if (local && isOfflineError(String(e))) {
        try { set(await local()); setOnDevice(true); trackEvent(ev + "_local"); }
        catch (e2) { setErr(String(e2)); }
      } else setErr(String(e));
    }
    finally { setLoading(false); }
  }

  return (
    <div className="arcana-modal">
        <div className="arcana-header">
          <div>
            <h2 className="arcana-title">◷ Predictive Timing</h2>
            <p className="arcana-sub">Symbolic timing mirrors — progressions, returns, eclipses.
              Not fixed prediction.</p>
          </div>
        </div>

        <div className="arcana-tabs">
          {([["progressions", "Progressions"], ["solar", "Solar Return"], ["eclipses", "Eclipses"]] as [Tab, string][])
            .map(([id, label]) => (
              <button key={id} className={`arcana-tab ${tab === id ? "is-active" : ""}`}
                      onClick={() => setTab(id)}>{label}</button>
            ))}
        </div>

        <div className="arcana-body">
          {err && <p className="arc-error">{err}</p>}
          {onDevice && <p className="arc-ondevice">☾ offline — computed on your device</p>}

          {tab === "progressions" && (
            <div>
              <div className="arc-draw-controls">
                <label>Progress to date
                  <input type="date" value={target} onChange={(e) => setTarget(e.target.value)} />
                </label>
                <button className="arc-draw-btn" disabled={loading}
                        onClick={() => run(() => fetchProgressed(birth, target), setProg, "progressed_run", () => localProgressed(birth, target))}>
                  {loading ? "…" : "Progress"}
                </button>
              </div>
              {prog && (
                <div>
                  <p className="arc-themes"><b>Age {prog.age_years}</b> · progressed moment {prog.progressed_iso.slice(0, 10)}</p>
                  <div className="arc-link-grid">
                    {prog.planets.map((p) => (
                      <div key={p.id} className="arc-link-card">
                        <div className="arc-link-body">{p.id}</div>
                        <span className="arc-chip">{p.degree}° {p.sign}</span>
                      </div>
                    ))}
                  </div>
                  <p className="arc-themes" style={{ marginTop: 12 }}>
                    <b>Progressed → natal aspects:</b> {prog.aspects_to_natal.length}
                  </p>
                </div>
              )}
            </div>
          )}

          {tab === "solar" && (
            <div>
              <div className="arc-draw-controls">
                <label>Return year
                  <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} />
                </label>
                <button className="arc-draw-btn" disabled={loading}
                        onClick={() => run(() => fetchSolarReturn(birth, year), setSr, "solar_return_run", () => localSolarReturn(birth, year))}>
                  {loading ? "…" : "Cast return"}
                </button>
              </div>
              {sr && (
                <div>
                  <p className="arc-themes"><b>{sr.year} solar return</b> · exact {sr.return_iso.replace("T", " ").slice(0, 16)} UTC</p>
                  <div className="arc-link-grid">
                    {sr.planets.filter((p) => !["Descendant", "Imum Coeli"].includes(p.id)).map((p) => (
                      <div key={p.id} className="arc-link-card">
                        <div className="arc-link-body">{p.id}</div>
                        <span className="arc-chip">{p.degree}° {p.sign} · H{p.house}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === "eclipses" && (
            <div>
              <div className="arc-draw-controls">
                <button className="arc-draw-btn" disabled={loading}
                        onClick={() => run(() => fetchEclipses(birth, today(), 8), setEcl, "eclipses_run", () => localEclipses(birth, today(), 8))}>
                  {loading ? "…" : "Next 8 eclipses"}
                </button>
              </div>
              {ecl?.eclipses.map((e) => (
                <div key={e.date + e.kind} className="arc-day">
                  <div className="arc-day-head">
                    <span className="arc-day-date">{e.date}</span>
                    <span className="arc-day-transit">
                      {e.kind === "solar" ? "☉ Solar" : "☽ Lunar"} · {e.nature} · {e.degree}° {e.sign}
                    </span>
                  </div>
                  {e.activations.length > 0 && (
                    <p className="arc-day-action">
                      activates: {e.activations.map((c) => `${c.natal_body} (${c.aspect}, ${c.orb}°)`).join(", ")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
    </div>
  );
};
