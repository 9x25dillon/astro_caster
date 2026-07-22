// RelationshipModal.tsx — synastry, composite, Davison, synastry-tarot.
// Person A is the loaded chart; Person B is entered here.
// Track R (R-2): a chapter surface (IV · Relations), not a modal — no overlay,
// no ✕; Esc and the dial navigate home via the App shell.
import React, { useState } from "react";
import { useStore } from "../store/useStore";
import {
  fetchSynastry, fetchComposite, fetchDavison, fetchSynastryTarot, trackEvent,
  localSynastry, localComposite, localDavison, localSynastryTarot, isOfflineError,
  type SynastryResponse, type CompositeChart, type DavisonChart, type SynastryTarotResponse,
} from "../api/client";
import type { BirthInput } from "../types";
import { shelveReading } from "../lib/shelveDoc";
import type { DocChapter } from "../lib/bookshelf";

type Tab = "synastry" | "composite" | "davison" | "tarot";

const NUM = (v: string) => (v === "" ? 0 : Number(v));

const BirthFields: React.FC<{ b: BirthInput; on: (b: BirthInput) => void }> = ({ b, on }) => (
  <div className="rel-birth">
    <label>Y<input type="number" value={b.year} onChange={(e) => on({ ...b, year: NUM(e.target.value) })} /></label>
    <label>M<input type="number" value={b.month} onChange={(e) => on({ ...b, month: NUM(e.target.value) })} /></label>
    <label>D<input type="number" value={b.day} onChange={(e) => on({ ...b, day: NUM(e.target.value) })} /></label>
    <label>h<input type="number" value={b.hour} onChange={(e) => on({ ...b, hour: NUM(e.target.value) })} /></label>
    <label>m<input type="number" value={b.minute} onChange={(e) => on({ ...b, minute: NUM(e.target.value) })} /></label>
    <label>lat<input type="number" value={b.lat} onChange={(e) => on({ ...b, lat: NUM(e.target.value) })} /></label>
    <label>lng<input type="number" value={b.lng} onChange={(e) => on({ ...b, lng: NUM(e.target.value) })} /></label>
    <label>tz<input type="number" value={b.tz_offset} onChange={(e) => on({ ...b, tz_offset: NUM(e.target.value) })} /></label>
  </div>
);

export const RelationshipModal: React.FC = () => {
  const birth = useStore((s) => s.birth);
  const setMargin = useStore((s) => s.setMargin);   // R-2: publish selections to the margin glass
  const [tab, setTab] = useState<Tab>("synastry");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [onDevice, setOnDevice] = useState(false);

  // Person B defaults to a copy of the loaded chart — user edits to compare.
  const [personB, setPersonB] = useState<BirthInput>({ ...birth, label: "Person B" });
  const [houseMethod, setHouseMethod] = useState<"midpoint" | "derived">("midpoint");

  const [syn, setSyn] = useState<SynastryResponse | null>(null);
  const [comp, setComp] = useState<CompositeChart | null>(null);
  const [dav, setDav] = useState<DavisonChart | null>(null);
  const [tarot, setTarot] = useState<SynastryTarotResponse | null>(null);

  async function run<T>(
    fn: () => Promise<T>, set: (v: T) => void, ev: string, local?: () => Promise<T>,
    shelve?: { kind: string; chapter: DocChapter; title: string }
  ) {
    setLoading(true); setErr(null); setOnDevice(false);
    try {
      const r = await fn(); set(r); trackEvent(ev);
      if (shelve) void shelveReading({ ...shelve, result: r, birth: personB });
    }
    catch (e) {
      // Backend unreachable → compute on-device via @astra/core (full body set).
      if (local && isOfflineError(String(e))) {
        try {
          const r = await local(); set(r); setOnDevice(true); trackEvent(ev + "_local");
          if (shelve) void shelveReading({ ...shelve, result: r, birth: personB });
        }
        catch (e2) { setErr(String(e2)); }
      } else setErr(String(e));
    }
    finally { setLoading(false); }
  }

  const partner = () => personB.label || "Person B";

  return (
    <div className="arcana-modal">
        <div className="arcana-header">
          <div>
            <h2 className="arcana-title">⚭ Relationship Astrology</h2>
            <p className="arcana-sub">Person A is your loaded chart. Enter Person B below.
              Symbolic mirror, not prediction.</p>
          </div>
        </div>

        <div className="rel-personb">
          <span className="rel-label">Person B</span>
          <BirthFields b={personB} on={setPersonB} />
        </div>

        <div className="arcana-tabs">
          {([["synastry", "Synastry"], ["composite", "Composite"], ["davison", "Davison"], ["tarot", "Tarot Bond"]] as [Tab, string][])
            .map(([id, label]) => (
              <button key={id} className={`arcana-tab ${tab === id ? "is-active" : ""}`}
                      onClick={() => setTab(id)}>{label}</button>
            ))}
        </div>

        <div className="arcana-body">
          {err && <p className="arc-error">{err}</p>}
          {onDevice && <p className="arc-ondevice">☾ offline — computed on your device</p>}

          {tab === "synastry" && (
            <div>
              <div className="arc-draw-controls">
                <button className="arc-draw-btn" disabled={loading}
                        onClick={() => run(() => fetchSynastry(birth, personB), setSyn, "synastry_run", () => localSynastry(birth, personB), { kind: "synastry", chapter: "IV", title: `Synastry · ${partner()}` })}>
                  {loading ? "…" : "Compare charts"}
                </button>
              </div>
              {syn && (
                <div>
                  <p className="arc-themes"><b>{syn.inter_aspects.length} inter-aspects.</b> Tightest:</p>
                  <div className="arc-cards-row">
                    {syn.inter_aspects.slice(0, 6).sort((a, b) => a.orb - b.orb).map((a, i) => (
                      <div key={i} className="arc-drawn mg-sel"
                           onClick={() => setMargin({
                             title: `${a.p1.replace("t:", "")} ${a.type} ${a.p2}`,
                             subtitle: `synastry inter-aspect · orb ${a.orb}°`,
                             chips: [a.harmony],
                           })}>
                        <div className="arc-drawn-pos">{a.type}</div>
                        <span className="arc-chip">{a.p1.replace("t:", "")} – {a.p2}</span>
                        <p className="arc-drawn-meaning">orb {a.orb}° · {a.harmony}</p>
                      </div>
                    ))}
                  </div>
                  <p className="arc-themes" style={{ marginTop: 12 }}><b>House rulers:</b></p>
                  {syn.grid.rulers.slice(0, 8).map((r, i) => (
                    <p key={i} className="arc-drawn-journal">
                      {r.host_owner === "a" ? "A" : "B"} house {r.house} ({r.cusp_sign}, ruled by {r.ruler}) → other's house {r.lands_in_other_house}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "composite" && (
            <div>
              <div className="arc-draw-controls">
                <label className="arc-ai-toggle">
                  <input type="checkbox" checked={houseMethod === "derived"}
                         onChange={(e) => setHouseMethod(e.target.checked ? "derived" : "midpoint")} />
                  derived-MC houses
                </label>
                <button className="arc-draw-btn" disabled={loading}
                        onClick={() => run(() => fetchComposite(birth, personB, houseMethod), setComp, "composite_run", () => localComposite(birth, personB, houseMethod), { kind: "composite", chapter: "IV", title: `Composite · ${partner()}` })}>
                  {loading ? "…" : "Build composite"}
                </button>
              </div>
              {comp && (
                <div>
                  <p className="arc-themes">
                    <b>Composite</b> · {comp.meta.houses} houses · patterns: {comp.patterns.map((p) => p.type).join(", ") || "none"}
                  </p>
                  <div className="arc-link-grid">
                    {comp.planets.map((p) => (
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

          {tab === "davison" && (
            <div>
              <div className="arc-draw-controls">
                <button className="arc-draw-btn" disabled={loading}
                        onClick={() => run(() => fetchDavison(birth, personB), setDav, "davison_run", () => localDavison(birth, personB), { kind: "davison", chapter: "IV", title: `Davison · ${partner()}` })}>
                  {loading ? "…" : "Cast Davison"}
                </button>
              </div>
              {dav && (
                <div>
                  <p className="arc-themes"><b>Davison relationship chart</b> (real time/space midpoint)</p>
                  <div className="arc-link-grid">
                    {dav.planets.filter((p) => !["Descendant", "Imum Coeli"].includes(p.id)).map((p) => (
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

          {tab === "tarot" && (
            <div>
              <div className="arc-draw-controls">
                <button className="arc-draw-btn" disabled={loading}
                        onClick={() => run(() => fetchSynastryTarot(birth, personB), setTarot, "synastry_tarot_run", () => localSynastryTarot(birth, personB), { kind: "synastry_tarot", chapter: "IV", title: `Tarot Bond · ${partner()}` })}>
                  {loading ? "…" : "Draw relationship bond"}
                </button>
              </div>
              {tarot && (
                <div className="arc-reading">
                  <div className="arc-interp">
                    <div className="arc-interp-head">Bond card</div>
                    <span className="arc-chip" style={{ fontSize: 15 }}>✦ {tarot.spread.bond_card}</span>
                  </div>
                  <p className="arc-themes" style={{ marginTop: 12 }}>
                    <b>Shared themes:</b> {tarot.spread.shared_themes.join(", ") || "none"}
                  </p>
                  <p className="arc-themes">
                    <b>Complementary shadows:</b> {tarot.spread.complementary_shadows.join(" · ") || "none"}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
    </div>
  );
};
