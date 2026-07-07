// AdvancedModal.tsx — harmonic charts, midpoint trees, fixed-star contacts.
import React, { useEffect, useRef, useState } from "react";
import { useStore } from "../store/useStore";
import {
  fetchHarmonic, fetchMidpointTree, fetchFixedStars, trackEvent,
  localHarmonic, localMidpointTree, localFixedStars, isOfflineError,
  type HarmonicChart, type MidpointTree, type FixedStarResponse,
} from "../api/client";

type Tab = "harmonics" | "midpoints" | "stars";

export const AdvancedModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const birth = useStore((s) => s.birth);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<Tab>("harmonics");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [onDevice, setOnDevice] = useState(false);

  const [n, setN] = useState(5);
  const [harm, setHarm] = useState<HarmonicChart | null>(null);
  const [mid, setMid] = useState<MidpointTree | null>(null);
  const [stars, setStars] = useState<FixedStarResponse | null>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  async function run<T>(fn: () => Promise<T>, set: (v: T) => void, ev: string, local?: () => Promise<T>) {
    setLoading(true); setErr(null); setOnDevice(false);
    try { set(await fn()); trackEvent(ev); }
    catch (e) {
      // Backend unreachable → compute on-device via @astra/core (reduced body set).
      if (local && isOfflineError(String(e))) {
        try { set(await local()); setOnDevice(true); trackEvent(ev + "_local"); }
        catch (e2) { setErr(String(e2)); }
      } else setErr(String(e));
    }
    finally { setLoading(false); }
  }

  return (
    <div className="modal-overlay" ref={overlayRef}
         onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}>
      <div className="arcana-modal">
        <div className="arcana-header">
          <div>
            <h2 className="arcana-title">✴ Advanced Techniques</h2>
            <p className="arcana-sub">Harmonics, midpoint trees, and fixed-star contacts — symbolic lenses.</p>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="arcana-tabs">
          {([["harmonics", "Harmonics"], ["midpoints", "Midpoint Tree"], ["stars", "Fixed Stars"]] as [Tab, string][])
            .map(([id, label]) => (
              <button key={id} className={`arcana-tab ${tab === id ? "is-active" : ""}`}
                      onClick={() => setTab(id)}>{label}</button>
            ))}
        </div>

        <div className="arcana-body">
          {err && <p className="arc-error">{err}</p>}
          {onDevice && <p className="arc-ondevice">☾ offline — computed on your device (reduced body set)</p>}

          {tab === "harmonics" && (
            <div>
              <div className="arc-draw-controls">
                <label>Harmonic (N)
                  <input type="number" min={1} max={64} value={n} onChange={(e) => setN(Number(e.target.value))} />
                </label>
                <button className="arc-draw-btn" disabled={loading}
                        onClick={() => run(() => fetchHarmonic(birth, n), setHarm, "harmonic_run", () => localHarmonic(birth, n))}>
                  {loading ? "…" : "Compute"}
                </button>
              </div>
              {harm && (
                <div>
                  <p className="arc-themes"><b>{harm.harmonic}th harmonic</b> · {harm.aspects.length} harmonic conjunctions</p>
                  <div className="arc-link-grid">
                    {harm.positions.map((p) => (
                      <div key={p.id} className="arc-link-card">
                        <div className="arc-link-body">{p.glyph} {p.id}</div>
                        <span className="arc-chip">{p.degree}°{String(p.minute).padStart(2, "0")} {p.sign}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === "midpoints" && (
            <div>
              <div className="arc-draw-controls">
                <button className="arc-draw-btn" disabled={loading}
                        onClick={() => run(() => fetchMidpointTree(birth, 1.0), setMid, "midpoint_run", () => localMidpointTree(birth, 1.0))}>
                  {loading ? "…" : "Build tree (orb 1°)"}
                </button>
              </div>
              {mid?.entries.map((e) => (
                <div key={e.pair} className="arc-day">
                  <div className="arc-day-head">
                    <span className="arc-day-date">{e.pair}</span>
                    <span className="arc-day-transit">= {e.degree}° {e.sign}</span>
                  </div>
                  <p className="arc-day-action">
                    {e.contacts.map((c) => `${c.body} (${c.aspect}, ${c.orb}°)`).join(", ")}
                  </p>
                </div>
              ))}
              {mid && mid.entries.length === 0 && <p className="arc-empty">No midpoint contacts within orb.</p>}
            </div>
          )}

          {tab === "stars" && (
            <div>
              <div className="arc-draw-controls">
                <button className="arc-draw-btn" disabled={loading}
                        onClick={() => run(() => fetchFixedStars(birth, 1.5), setStars, "fixed_stars_run", () => localFixedStars(birth, 1.5))}>
                  {loading ? "…" : "Find star contacts (orb 1.5°)"}
                </button>
              </div>
              {stars?.hits.map((h, i) => (
                <div key={i} className="arc-day">
                  <div className="arc-day-head">
                    <span className="arc-day-date">{h.natal_body}</span>
                    <span className="arc-day-transit">conj <b>{h.star}</b> {h.degree}° {h.sign} · orb {h.orb}°</span>
                  </div>
                  <p className="arc-day-lesson">{h.nature}</p>
                </div>
              ))}
              {stars && stars.hits.length === 0 && <p className="arc-empty">No fixed-star conjunctions within orb.</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
