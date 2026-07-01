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
  fetchOracleReport,
  fetchPersonalReport,
  downloadArcanaCalendar,
  localToday,
  trackEvent,
  type NatalArcanaSignature,
  type TarotReadingResponse,
  type ArcanaForecastResponse,
  type LearningPathResponse,
  type DeckArtResponse,
  type OracleReportResponse,
  type PersonalReportResponse,
  type SpreadType,
  type SourceSystem,
  SOURCE_LABELS,
  ApiError,
} from "../api/client";
import { CLASSROOM, EXPRESSION_KINDS, generateArtifact, type Artifact } from "../lib/tarotCopy";
import { Interpretation } from "./DetailPanel";
import { useSpeech, speakableText } from "../lib/speech";
import { printReport } from "../lib/printReport";

// Friendly labels for the models that can serve an Oracle Report (requested
// model + its server-side fallback). Unknown IDs fall through as-is — honest
// provenance beats a pretty label.
const ORACLE_MODEL_LABELS: Record<string, string> = {
  "claude-fable-5": "Claude Fable 5",
  "claude-opus-4-8": "Claude Opus 4.8",
};

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
  const birth = useStore((s) => s.birth);
  const entitlement = useStore((s) => s.entitlement);
  const isSupporter = useStore((s) => s.isSupporter);
  const openSupport = useStore((s) => s.openSupport);
  const speech = useSpeech();   // Speak buttons on the Oracle Report sections

  const overlayRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<Tab>("natal");

  const [sig, setSig] = useState<NatalArcanaSignature | null>(null);
  const [reading, setReading] = useState<TarotReadingResponse | null>(null);
  const [forecast, setForecast] = useState<ArcanaForecastResponse | null>(null);
  const [path, setPath] = useState<LearningPathResponse | null>(null);
  const [artifact, setArtifact] = useState<Artifact | null>(null);
  const [deckArt, setDeckArt] = useState<DeckArtResponse | null>(null);
  const [deckCard, setDeckCard] = useState<string>("");   // "" = whole soul deck
  const [oracle, setOracle] = useState<OracleReportResponse | null>(null);
  const [oracleLoading, setOracleLoading] = useState(false);
  // The exact (date, generated-at) context of the Oracle session — the Personal
  // Report must echo the same local date or the server's seed check rejects it.
  const [oracleCtx, setOracleCtx] = useState<{ date: string | null; generatedAt: string } | null>(null);
  const [personal, setPersonal] = useState<PersonalReportResponse | null>(null);
  const [personalLoading, setPersonalLoading] = useState(false);

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
    setOracle(null);   // a report belongs to one chart — never show it against another
    setOracleCtx(null);
    setPersonal(null);
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

  async function loadOracleReport() {
    if (!chart || oracleLoading) return;
    setOracleLoading(true); setErr(null);
    try {
      // Reuses the Draw tab's spread/lineage/question controls; the backend
      // rebuilds the full deterministic substrate itself, so this works with
      // or without a prior draw. Fable 5 reports can take a while — the
      // dedicated oracleLoading flag keeps the Draw button usable meanwhile.
      // Pass the local date explicitly so we can capture the EXACT session
      // context — the Personal Report must echo it for the server's seed check.
      const date = spread === "daily" ? localToday() : null;
      const r = await fetchOracleReport(chart, question, {
        spread, source, entitlement, date: date ?? undefined,
      });
      setOracle(r);
      setOracleCtx({ date, generatedAt: localToday() });
      setPersonal(null);   // a deluxe edition compiles ONE session — clear stale
      trackEvent("oracle_report", {
        spread, source, ai: r.ai_source, model: r.model ?? "offline",
      });
    } catch (e) {
      if (e instanceof ApiError && e.status === 402) {
        // Tier gate (server-side source of truth): route to the support flow.
        setErr("Oracle tier required — the Oracle Report is the observatory's " +
               "deepest paid reading (Claude Fable 5). Support at the oracle " +
               "level to unlock it.");
        openSupport(true);
        trackEvent("oracle_report_gated", { spread, source });
      } else {
        setErr(String(e));
      }
    } finally {
      setOracleLoading(false);
    }
  }

  async function loadPersonalReport() {
    if (!chart || !oracle || personalLoading) return;
    setPersonalLoading(true); setErr(null);
    try {
      const p = await fetchPersonalReport(chart, oracle, {
        date: oracleCtx?.date ?? null,
        generatedAt: oracleCtx?.generatedAt,
        entitlement,
      });
      setPersonal(p);
      trackEvent("personal_report", {
        spread: p.spread, source: p.source, ai: p.ai_source, model: p.model ?? "offline",
      });
    } catch (e) {
      if (e instanceof ApiError && e.status === 402) {
        setErr("Oracle tier required — the Personal Report is an optional deluxe "
               + "edition compiled from your Oracle session.");
        openSupport(true);
        trackEvent("personal_report_gated", { spread, source });
      } else if (e instanceof ApiError && e.status === 409) {
        // Post-Oracle gate: the session no longer matches this chart/controls.
        setErr("This Oracle session no longer matches the current chart — "
               + "generate a fresh Oracle Report, then compile the deluxe edition.");
      } else {
        setErr(String(e));
      }
    } finally {
      setPersonalLoading(false);
    }
  }

  function printPersonalReport() {
    if (!personal) return;
    // {{BIRTH_INFO}} is filled HERE, locally — birth details never leave the
    // browser (the server/AI only ever saw the placeholder).
    const pad = (n: number) => `${n}`.padStart(2, "0");
    const birthInfo = birth
      ? `${birth.label ? birth.label + " · " : ""}${birth.year}-${pad(birth.month)}-${pad(birth.day)}` +
        ` ${pad(birth.hour)}:${pad(birth.minute)} · ${birth.lat.toFixed(2)}°, ${birth.lng.toFixed(2)}°`
      : "";
    const ok = printReport(personal.report_markdown, {
      birthInfo,
      sigilPhrase: oracle?.question || "astra arcana",
      title: `Astra Arcana — Personal Report · ${personal.oracle_date}`,
    });
    if (!ok) setErr("Popup blocked — allow popups for this site to print the report.");
    else trackEvent("personal_report_print", { spread: personal.spread });
  }

  function downloadMarkdown(md: string, name: string) {
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
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

              {/* ── Oracle Report — the deepest offering (oracle tier) ── */}
              <div className="arc-oracle" style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.12)" }}>
                {!oracle && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <button className="arc-draw-btn" onClick={loadOracleReport} disabled={oracleLoading}>
                      {oracleLoading ? "Consulting the Oracle… (this can take a minute)" : "✧ Generate Oracle Report"}
                    </button>
                    <span style={{ opacity: 0.7, fontSize: "0.78rem" }}>
                      The observatory's deepest reading — a long-form Claude Fable&nbsp;5 synthesis
                      of your signature, spread, and learning path. <b>Oracle tier only.</b> Uses
                      the spread, lineage, and question above.
                    </span>
                  </div>
                )}

                {oracle && (
                  <div className="arc-oracle-report">
                    <div className="arc-interp-head">
                      Oracle Report ·{" "}
                      <span className="arc-lineage" style={{ opacity: 0.8, fontWeight: 400 }}>{oracle.lineage}</span>
                      {oracle.ai_source === "llm" && (
                        <span className="arc-badge" title={`Served by ${oracle.model ?? "AI"}`}>
                          {ORACLE_MODEL_LABELS[oracle.model ?? ""] ?? oracle.model ?? "AI"}
                        </span>
                      )}
                      {oracle.ai_source === "offline" && (
                        <span className="arc-badge arc-badge--off"
                              title="The AI layer was unavailable — this report was assembled entirely by the deterministic engine.">
                          Deterministic offline report
                        </span>
                      )}
                    </div>

                    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", margin: "6px 0 10px", fontSize: "0.75rem", opacity: 0.8 }}>
                      <span>
                        seed&nbsp;
                        <code style={{ userSelect: "all", wordBreak: "break-all" }}>{oracle.seed}</code>
                      </span>
                      <button className="ghost" title="Copy the deterministic seed — the draw is reproducible from it"
                              onClick={() => copy(oracle.seed)}>copy seed</button>
                    </div>

                    <Interpretation
                      text={oracle.report}
                      onSpeak={(body) => speech.speak(speakableText(body))}
                    />

                    <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                      <button className="ghost arc-copy" onClick={() => copy(oracle.report)}>copy report</button>
                      {speech.supported && (
                        speech.speaking
                          ? <button className="ghost" onClick={() => speech.stop()}>■ stop</button>
                          : <button className="ghost" onClick={() => speech.speak(speakableText(oracle.report))}>🔊 speak report</button>
                      )}
                      <button className="ghost" onClick={loadOracleReport} disabled={oracleLoading}>
                        {oracleLoading ? "Consulting…" : "regenerate"}
                      </button>
                    </div>

                    <p className="arc-disclaimer">{oracle.disclaimer}</p>

                    {/* ── Deluxe Edition — optional post-Oracle product ── */}
                    <div className="arc-personal" style={{ marginTop: 14, paddingTop: 12, borderTop: "1px dashed rgba(255,255,255,0.18)" }}>
                      {!personal && (
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                          <button className="arc-draw-btn" onClick={loadPersonalReport} disabled={personalLoading}>
                            {personalLoading ? "Compiling the deluxe edition… (this can take minutes)" : "✦ Compile Personal Report"}
                          </button>
                          <span style={{ opacity: 0.7, fontSize: "0.78rem" }}>
                            <b>Deluxe Compiled Edition</b> — an optional post-Oracle product: your
                            Oracle session expanded into a research-paper-style personal report
                            (natal deep-dive, tarot layout, career & relationship inserts,
                            practices, appendix) as PDF-ready markdown.
                          </span>
                        </div>
                      )}

                      {personal && (
                        <div className="arc-personal-report">
                          <div className="arc-interp-head">
                            Personal Report ·{" "}
                            <span className="arc-lineage" style={{ opacity: 0.8, fontWeight: 400 }}>{personal.lineage}</span>
                            {personal.ai_source === "llm" && (
                              <span className="arc-badge" title={`Served by ${personal.model ?? "AI"}`}>
                                {ORACLE_MODEL_LABELS[personal.model ?? ""] ?? personal.model ?? "AI"}
                              </span>
                            )}
                            {personal.ai_source === "offline" && (
                              <span className="arc-badge arc-badge--off"
                                    title="The AI layer was unavailable — this edition was compiled entirely by the deterministic engine.">
                                Deterministic offline edition
                              </span>
                            )}
                          </div>
                          <p style={{ fontSize: "0.75rem", opacity: 0.75, margin: "4px 0 8px" }}>
                            Compiled from your Oracle session of {personal.oracle_date} · seed{" "}
                            <code style={{ userSelect: "all" }}>{personal.seed.slice(-12)}</code>
                          </p>

                          {/* Top-level part preview — the full render is the PDF pipeline's job. */}
                          <div style={{ maxHeight: 320, overflowY: "auto", fontSize: "0.82rem" }}>
                            {personal.report_markdown.split(/\n(?=# )/g).map((part, i) => {
                              const nl = part.indexOf("\n");
                              const title = part.startsWith("# ") ? part.slice(2, nl === -1 ? undefined : nl) : "Preamble";
                              const body = part.startsWith("# ") && nl !== -1 ? part.slice(nl + 1) : part;
                              return (
                                <details key={i} open={i === 0}>
                                  <summary style={{ cursor: "pointer", color: "var(--gold-soft)" }}>{title}</summary>
                                  <pre className="arc-interp-text" style={{ whiteSpace: "pre-wrap" }}>{body}</pre>
                                </details>
                              );
                            })}
                          </div>

                          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                            <button className="ghost arc-copy" onClick={printPersonalReport}
                                    title="Styled print document — use the dialog's 'Save as PDF'">
                              ⎙ print / save as PDF
                            </button>
                            <button className="ghost arc-copy"
                                    onClick={() => downloadMarkdown(personal.report_markdown,
                                      `astra-personal-report-${personal.oracle_date}.md`)}>
                              ↓ download .md
                            </button>
                            <button className="ghost" onClick={() => copy(personal.report_markdown)}>copy markdown</button>
                            <button className="ghost" onClick={loadPersonalReport} disabled={personalLoading}>
                              {personalLoading ? "Compiling…" : "recompile"}
                            </button>
                          </div>
                          <p className="arc-disclaimer">{personal.disclaimer}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
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
