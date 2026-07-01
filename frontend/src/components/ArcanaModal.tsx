// ArcanaModal.tsx — Astra Arcana: natal tarot observatory.
// Tabs: Natal signature · Draw spread · Transit cards · Classroom · Studio.
// Deterministic core works offline; AI enrichment is opt-in for supporters.
import React, { useEffect, useRef, useState } from "react";
import { useStore } from "../store/useStore";
import {
  fetchNatalArcana,
  fetchTarotReading,
  fetchArcanaForecast,
  fetchLearningPath,
  fetchDeckArt,
  downloadArcanaCalendar,
  trackEvent,
  type NatalArcanaSignature,
  type TarotReadingResponse,
  type ArcanaForecastResponse,
  type LearningPathResponse,
  type DeckArtResponse,
  type SpreadType,
  type SourceSystem,
  SOURCE_LABELS,
} from "../api/client";
import { CLASSROOM, EXPRESSION_KINDS, generateArtifact, type Artifact } from "../lib/tarotCopy";

type Tab = "natal" | "draw" | "transit" | "classroom" | "studio";

const SPREADS: { id: SpreadType; label: string }[] = [
  { id: "daily", label: "Daily card" },
  { id: "three_card", label: "Self · Mirror · Shadow" },
  { id: "elemental_balance", label: "Elemental balance" },
  { id: "twelve_house", label: "Twelve-house" },
  { id: "shadow_integration", label: "Shadow integration" },
  { id: "creative_expression", label: "Creative expression" },
];

function CardChip({ name, reversed }: { name: string; reversed?: boolean }) {
  return (
    <span className={`arc-chip ${reversed ? "arc-chip--rev" : ""}`}>
      ✦ {name}{reversed ? " ⤓" : ""}
    </span>
  );
}

export const ArcanaModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const chart = useStore((s) => s.chart);
  const entitlement = useStore((s) => s.entitlement);
  const isSupporter = useStore((s) => s.isSupporter);
  const openSupport = useStore((s) => s.openSupport);

  const overlayRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<Tab>("natal");

  const [sig, setSig] = useState<NatalArcanaSignature | null>(null);
  const [reading, setReading] = useState<TarotReadingResponse | null>(null);
  const [forecast, setForecast] = useState<ArcanaForecastResponse | null>(null);
  const [path, setPath] = useState<LearningPathResponse | null>(null);
  const [artifact, setArtifact] = useState<Artifact | null>(null);
  const [deckArt, setDeckArt] = useState<DeckArtResponse | null>(null);
  const [deckCard, setDeckCard] = useState<string>("");   // "" = whole soul deck

  const [spread, setSpread] = useState<SpreadType>("three_card");
  const [source, setSource] = useState<SourceSystem>("golden_dawn");
  const [question, setQuestion] = useState("What do I need to understand right now?");
  const [useAi, setUseAi] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Esc to close.
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  // Reset cached arcana state whenever the underlying chart changes
  // (e.g. the user casts a new chart with the modal open).
  useEffect(() => {
    setSig(null);
    setReading(null);
    setForecast(null);
    setPath(null);
    setDeckArt(null);
  }, [chart]);

  // Load the natal signature once a chart exists.
  useEffect(() => {
    if (chart && !sig) {
      fetchNatalArcana(chart).then(setSig).catch((e) => setErr(String(e)));
    }
  }, [chart, sig]);

  async function draw() {
    if (!chart) return;
    setLoading(true); setErr(null);
    try {
      const wantAi = useAi && isSupporter;
      const r = await fetchTarotReading(chart, spread, question, {
        includeAi: wantAi, entitlement, source,
      });
      setReading(r);
      trackEvent("arcana_draw", { spread, ai: wantAi, source });
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function loadForecast() {
    if (!chart) return;
    setLoading(true); setErr(null);
    try {
      const f = await fetchArcanaForecast(chart, 7, entitlement, { source });
      setForecast(f);
      trackEvent("arcana_forecast_opened");
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function loadPath() {
    if (!chart) return;
    setLoading(true); setErr(null);
    try {
      const p = await fetchLearningPath(chart, { source });
      setPath(p);
      trackEvent("arcana_learning_path", { source });
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function loadDeckArt() {
    if (!chart) return;
    setLoading(true); setErr(null);
    try {
      const d = await fetchDeckArt(chart, {
        cardId: deckCard || undefined, source, entitlement,
      });
      setDeckArt(d);
      trackEvent("arcana_deck_art", { card: deckCard || "soul_deck", source });
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function exportCalendar(kind: "ritual" | "journal") {
    if (!chart) return;
    setErr(null);
    try {
      await downloadArcanaCalendar(chart, { days: 7, source, kind, entitlement });
      trackEvent("arcana_calendar_export", { kind, source });
    } catch (e) {
      setErr(String(e));
    }
  }

  function copy(text: string) {
    navigator.clipboard?.writeText(text).catch(() => undefined);
  }

  return (
    <div className="modal-overlay" ref={overlayRef}
         onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}>
      <div className="arcana-modal">
        <div className="arcana-header">
          <div>
            <h2 className="arcana-title">✶ Astra Arcana</h2>
            <p className="arcana-sub">
              Your chart is the geometry of arrival. The cards are mirrors for translating
              it into action, beauty, and self-knowledge.
            </p>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="arcana-tabs">
          {([
            ["natal", "Natal Arcana"],
            ["draw", "Draw"],
            ["transit", "Transit Cards"],
            ["classroom", "Classroom"],
            ["studio", "Studio"],
          ] as [Tab, string][]).map(([id, label]) => (
            <button
              key={id}
              className={`arcana-tab ${tab === id ? "is-active" : ""}`}
              onClick={() => {
                setTab(id);
                if (id === "transit" && !forecast) loadForecast();
                if (id === "classroom" && !path) loadPath();
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="arcana-body">
          {!chart && <p className="arc-empty">Cast your chart first to open the Arcana.</p>}
          {err && <p className="arc-error">{err}</p>}

          {/* ── Natal Arcana ─────────────────────────────────────────── */}
          {tab === "natal" && sig && (
            <div className="arc-natal">
              <div className="arc-meta">
                <span>Dominant element: <b>{sig.dominant_element}</b></span>
                <span>Modality: <b>{sig.dominant_modality}</b></span>
              </div>
              <div className="arc-link-grid">
                {sig.links.map((l) => (
                  <div key={l.body} className="arc-link-card">
                    <div className="arc-link-body">{l.body}</div>
                    <CardChip name={l.card.name} />
                    <div className="arc-link-note">{l.note}</div>
                  </div>
                ))}
              </div>
              <div className="arc-themes">
                <p><b>Strongest archetypes:</b> {sig.themes.join(", ")}</p>
                <p><b>Growth-ward / quieter:</b> {sig.shadows.join(", ") || "in balance"}</p>
              </div>
            </div>
          )}

          {/* ── Draw ─────────────────────────────────────────────────── */}
          {tab === "draw" && chart && (
            <div className="arc-draw">
              <div className="arc-draw-controls">
                <label>Spread
                  <select value={spread} onChange={(e) => setSpread(e.target.value as SpreadType)}>
                    {SPREADS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </label>
                <label>Lineage
                  <select value={source} onChange={(e) => setSource(e.target.value as SourceSystem)}>
                    {(Object.keys(SOURCE_LABELS) as SourceSystem[]).map((s) =>
                      <option key={s} value={s}>{SOURCE_LABELS[s]}</option>)}
                  </select>
                </label>
                <label className="arc-q">Question
                  <input value={question} onChange={(e) => setQuestion(e.target.value)} />
                </label>
                <label className="arc-ai-toggle" title={isSupporter ? "" : "Supporter feature"}>
                  <input type="checkbox" checked={useAi && isSupporter}
                         disabled={!isSupporter}
                         onChange={(e) => {
                           if (!isSupporter) { openSupport(true); return; }
                           setUseAi(e.target.checked);
                         }} />
                  AI reading {isSupporter ? "" : "🔒"}
                </label>
                <button className="arc-draw-btn" onClick={draw} disabled={loading}>
                  {loading ? "Drawing…" : "Draw"}
                </button>
              </div>

              {reading && (
                <div className="arc-reading">
                  <div className="arc-cards-row">
                    {reading.cards.map((c) => (
                      <div key={c.position} className="arc-drawn">
                        <div className="arc-drawn-pos">{c.position}</div>
                        <CardChip name={c.card.name} reversed={c.reversed} />
                        <p className="arc-drawn-meaning">{c.meaning}</p>
                        {c.weight_sources.length > 0 && (
                          <div className="arc-why" style={{ marginTop: 6, fontSize: "0.72rem", opacity: 0.78 }}
                               title="Why this card was likely — from the actual draw weights">
                            <div style={{ textTransform: "uppercase", letterSpacing: "0.08em", fontSize: "0.6rem", opacity: 0.7 }}>why this card</div>
                            <ul style={{ margin: "2px 0 0", paddingLeft: 14 }}>
                              {c.weight_sources.map((w, i) => (
                                <li key={i}>{w.label}{w.weight ? ` (+${w.weight.toFixed(2)})` : ""}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {c.activity && <p className="arc-drawn-act">✦ {c.activity}</p>}
                        {c.journal_prompt && <p className="arc-drawn-journal">✎ {c.journal_prompt}</p>}
                      </div>
                    ))}
                  </div>
                  <div className="arc-interp">
                    <div className="arc-interp-head">
                      Reading · <span className="arc-lineage" style={{ opacity: 0.8, fontWeight: 400 }}>{SOURCE_LABELS[reading.source]}</span>
                      {reading.ai_source === "llm" && <span className="arc-badge">AI</span>}
                      {reading.ai_source === "offline" && <span className="arc-badge arc-badge--off">offline</span>}
                    </div>
                    <pre className="arc-interp-text">{reading.interpretation}</pre>
                    <button className="ghost arc-copy" onClick={() => copy(reading.interpretation)}>copy</button>
                  </div>
                  <p className="arc-disclaimer">{reading.disclaimer}</p>
                </div>
              )}
            </div>
          )}

          {/* ── Transit Cards (Phase 7) ──────────────────────────────── */}
          {tab === "transit" && (
            <div className="arc-transit">
              {forecast && forecast.cards.length > 0 && (
                <div className="arc-cal-export" style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
                  <span style={{ opacity: 0.75, fontSize: "0.8rem" }}>Export to calendar (.ics):</span>
                  <button className="ghost" onClick={() => exportCalendar("ritual")}>✦ Rituals</button>
                  <button className="ghost" onClick={() => exportCalendar("journal")}>✎ Journal prompts</button>
                </div>
              )}
              {loading && <p className="arc-empty">Reading the sky…</p>}
              {forecast && forecast.cards.length === 0 && (
                <p className="arc-empty">No notable activations in the next {forecast.days} days.</p>
              )}
              {forecast?.cards.map((d) => (
                <div key={d.date} className="arc-day">
                  <div className="arc-day-head">
                    <span className="arc-day-date">{d.date}</span>
                    <span className="arc-day-transit">{d.transit_summary}</span>
                    <CardChip name={d.card.name} reversed={d.reversed} />
                  </div>
                  <p className="arc-day-lesson">{d.lesson}</p>
                  <p className="arc-day-action">✦ {d.alignment_action}</p>
                  <p className="arc-drawn-journal">✎ {d.journal_prompt}</p>
                </div>
              ))}
            </div>
          )}

          {/* ── Classroom (Phase 5) ──────────────────────────────────── */}
          {tab === "classroom" && (
            <div className="arc-classroom">
              {/* Generated learning path — a chart-anchored archetypal sequence. */}
              {loading && !path && <p className="arc-empty">Charting your path…</p>}
              {path && (
                <div className="arc-path" style={{ marginBottom: 18 }}>
                  <div className="arc-path-head" style={{ marginBottom: 8 }}>
                    <b>Your learning path</b>{" "}
                    <span style={{ opacity: 0.75 }}>
                      — {path.anchor} → {path.growth_edge} · {path.lineage}
                    </span>
                  </div>
                  <ol className="arc-path-steps" style={{ paddingLeft: 18, margin: 0 }}>
                    {path.steps.map((s) => (
                      <li key={s.order} style={{ marginBottom: 10 }}>
                        <div>
                          <span className="arc-badge arc-badge--off">{s.stage}</span>{" "}
                          <b>{s.card.name}</b>
                        </div>
                        <p style={{ margin: "3px 0" }}>{s.focus}</p>
                        <p className="arc-drawn-act" style={{ margin: "2px 0" }}>✦ {s.practice}</p>
                        <p className="arc-drawn-journal" style={{ margin: "2px 0" }}>✎ {s.journal}</p>
                      </li>
                    ))}
                  </ol>
                  <p className="arc-disclaimer" style={{ marginTop: 6 }}>{path.disclaimer}</p>
                  <hr style={{ opacity: 0.2, margin: "14px 0" }} />
                  <div style={{ opacity: 0.7, fontSize: "0.8rem", marginBottom: 6 }}>Archetype reference</div>
                </div>
              )}
              {CLASSROOM.map((l) => (
                <details key={l.title} className="arc-lesson">
                  <summary>{l.title} — <i>{l.summary}</i></summary>
                  <p><b>Symbol:</b> {l.symbolic}</p>
                  <p><b>Astrology:</b> {l.astrology}</p>
                  <p><b>Tarot:</b> {l.tarot}</p>
                  <p><b>Shadow:</b> {l.shadow}</p>
                  <p><b>Balanced:</b> {l.balanced}</p>
                  <p><b>Practice:</b> {l.practice}</p>
                  <p className="arc-drawn-journal">✎ {l.journal}</p>
                </details>
              ))}
            </div>
          )}

          {/* ── Studio (Phase 6) ─────────────────────────────────────── */}
          {tab === "studio" && sig && (
            <div className="arc-studio">
              <div className="arc-studio-btns">
                {EXPRESSION_KINDS.map((k) => (
                  <button key={k.kind} className="ghost"
                          onClick={() => { setArtifact(generateArtifact(k.kind, sig)); trackEvent("arcana_artifact", { kind: k.kind }); }}>
                    {k.label}
                  </button>
                ))}
              </div>
              {artifact && (
                <div className="arc-artifact">
                  <div className="arc-interp-head">{artifact.title}
                    <button className="ghost arc-copy" onClick={() => copy(artifact.body)}>copy</button>
                  </div>
                  <pre className="arc-interp-text">{artifact.body}</pre>
                </div>
              )}

              {/* ── Deck-art prompts (Phase 4) — deterministic, prompt-only ── */}
              <hr style={{ opacity: 0.2, margin: "16px 0" }} />
              <div style={{ opacity: 0.7, fontSize: "0.8rem", marginBottom: 6 }}>
                Deck-art prompts — art-direction briefs from your chart, for the image tool of your choice
              </div>
              <div className="arc-draw-controls">
                <label>Card
                  <select value={deckCard} onChange={(e) => setDeckCard(e.target.value)}>
                    <option value="">Whole soul deck</option>
                    {sig.links.map((l) => (
                      <option key={l.body} value={l.card.id}>{l.card.name} ({l.body})</option>
                    ))}
                  </select>
                </label>
                <label>Lineage
                  <select value={source} onChange={(e) => setSource(e.target.value as SourceSystem)}>
                    {(Object.keys(SOURCE_LABELS) as SourceSystem[]).map((s) =>
                      <option key={s} value={s}>{SOURCE_LABELS[s]}</option>)}
                  </select>
                </label>
                <button className="arc-draw-btn" onClick={loadDeckArt} disabled={loading}>
                  {loading ? "Composing…" : "Compose prompts"}
                </button>
              </div>
              {deckArt && (
                <div className="arc-deck-art">
                  <div style={{ opacity: 0.75, fontSize: "0.8rem", margin: "8px 0" }}>
                    {deckArt.lineage} · {deckArt.prompts.length} prompt{deckArt.prompts.length === 1 ? "" : "s"}
                  </div>
                  {deckArt.prompts.map((p) => (
                    <div key={p.card.id} className="arc-artifact" style={{ marginBottom: 10 }}>
                      <div className="arc-interp-head">{p.title}
                        <button className="ghost arc-copy" onClick={() => copy(p.prompt)}>copy</button>
                      </div>
                      <pre className="arc-interp-text">{p.prompt}</pre>
                      {p.natal_context && (
                        <p className="arc-drawn-act" style={{ margin: "4px 0 0" }}>✦ {p.natal_context}</p>
                      )}
                      <p style={{ opacity: 0.6, fontSize: "0.72rem", margin: "4px 0 0" }}>
                        avoid: {p.negative_prompt}
                      </p>
                    </div>
                  ))}
                  <p className="arc-disclaimer">{deckArt.disclaimer}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
