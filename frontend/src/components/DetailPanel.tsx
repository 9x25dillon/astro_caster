// components/DetailPanel.tsx
// Context-sensitive right rail: shows the selected planet / house / aspect /
// pattern, plus the Astra reflective interpretation and navigational suggestions.
import React, { useEffect, useRef, useState } from "react";
import { useStore } from "../store/useStore";
import { formatPos, ORDINAL, glyphText } from "../lib/astro";
import { PLANET_METAL, MODALITY_PRINCIPLE } from "../lib/alchemy";
import { ElementSigil, PrincipleSigil } from "./AlchemySigil";
import { useSpeech } from "../lib/speech";
import { GlossaryTooltip } from "./GlossaryTooltip";
import type { Lens } from "../types";

const LENSES: Lens[] = [
  "psychological",
  "natal",
  "evolutionary",
  "transit",
  "relationship",
  "traditional",
];

interface InterpSection { title: string; body: string }

function parseSections(text: string): InterpSection[] {
  return text.split(/\n(?=## )/g).map((part) => {
    if (part.startsWith("## ")) {
      const nl = part.indexOf("\n");
      return nl === -1
        ? { title: part.replace("## ", ""), body: "" }
        : { title: part.slice(3, nl), body: part.slice(nl + 1).trim() };
    }
    return { title: "", body: part.trim() };
  }).filter((s) => s.title || s.body);
}

// Structured, collapsible sections with per-section Speak + Copy.
// Exported for reuse — the Oracle Report (ArcanaModal) renders through the
// same `## Section` accordion so the two long-form surfaces stay consistent.
export const Interpretation: React.FC<{
  text: string;
  streaming?: boolean;
  onSpeak?: (text: string) => void;
}> = ({ text, streaming, onSpeak }) => {
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const sections = parseSections(text);

  const toggle = (i: number) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });

  const copy = (body: string) =>
    navigator.clipboard?.writeText(body).catch(() => undefined);

  return (
    <div className="interp">
      {sections.map((s, i) => {
        const isLast = i === sections.length - 1;
        const incomplete = streaming && isLast;
        const isOpen = !collapsed.has(i);

        if (!s.title) {
          return <div key={i} className="interp-preamble">{renderInline(s.body)}</div>;
        }

        return (
          <div key={`s${i}`} className="interp-section">
            <div className="interp-section-head" onClick={() => !incomplete && toggle(i)}>
              <span className="interp-section-chevron">{isOpen ? "▾" : "▸"}</span>
              <h2 className="interp-section-title">{s.title}</h2>
              {!incomplete && (
                <span className="interp-section-actions">
                  {onSpeak && s.body && (
                    <button className="interp-action" title="Speak this section"
                      onClick={(e) => { e.stopPropagation(); onSpeak(s.body); }}>
                      🔊
                    </button>
                  )}
                  <button className="interp-action" title="Copy section"
                    onClick={(e) => { e.stopPropagation(); copy(s.body); }}>
                    ↓
                  </button>
                </span>
              )}
              {incomplete && <span className="interp-writing">…</span>}
            </div>
            {isOpen && (
              <div className="interp-section-body">
                {renderBody(s.body)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// Map raw model IDs to readable labels.
const MODEL_NAMES: Record<string, string> = {
  "anthropic/claude-opus-4-8":         "Claude Opus 4.8",
  "anthropic/claude-sonnet-4-6":       "Claude Sonnet 4.6",
  "anthropic/claude-haiku-4-5":        "Claude Haiku 4.5",
  "anthropic/claude-haiku-4-5-20251001": "Claude Haiku 4.5",
};
const MODEL_TIER: Record<string, string> = {
  "anthropic/claude-opus-4-8":    "oracle",
  "anthropic/claude-sonnet-4-6":  "supporter",
};

function friendlyModel(model: string): string {
  if (MODEL_NAMES[model]) return MODEL_NAMES[model];
  // Unknown cloud model — strip provider prefix
  const name = model.split("/").pop() ?? model;
  return name.replace(/^claude-/, "Claude ");
}

// Minimal **bold** support.
function renderInline(s: string): React.ReactNode {
  const parts = s.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? (
      <b key={i} style={{ color: "var(--gold-soft)" }}>
        {p.slice(2, -2)}
      </b>
    ) : (
      <span key={i}>{p}</span>
    )
  );
}

// Section bodies may carry `### ` subsections (e.g. the Oracle Report's one
// subsection per drawn card). Render those as styled subheadings instead of
// literal "###" text; everything else flows through renderInline.
function renderBody(body: string): React.ReactNode {
  const chunks = body.split(/\n(?=### )/g);
  if (chunks.length === 1 && !body.startsWith("### ")) return renderInline(body);
  return chunks.map((chunk, i) => {
    if (!chunk.startsWith("### ")) return <span key={i}>{renderInline(chunk)}</span>;
    const nl = chunk.indexOf("\n");
    const title = nl === -1 ? chunk.slice(4) : chunk.slice(4, nl);
    const rest = nl === -1 ? "" : chunk.slice(nl + 1);
    return (
      <div key={i} className="interp-subsection">
        <h3 className="interp-subsection-title"
            style={{ margin: "10px 0 4px", fontSize: "0.9rem", color: "var(--gold-soft)" }}>
          {renderInline(title)}
        </h3>
        {rest && renderInline(rest)}
      </div>
    );
  });
}

export const DetailPanel: React.FC = () => {
  const chart = useStore((s) => s.chart);
  const selection = useStore((s) => s.selection);
  const lens = useStore((s) => s.lens);
  const setLens = useStore((s) => s.setLens);
  const aiResult = useStore((s) => s.aiResult);
  const aiLoading = useStore((s) => s.aiLoading);
  const ask = useStore((s) => s.ask);
  const suggest = useStore((s) => s.suggest);
  const select = useStore((s) => s.select);
  const autoSpeak = useStore((s) => s.autoSpeak);
  const toggleAutoSpeak = useStore((s) => s.toggleAutoSpeak);
  const [q, setQ] = useState("");

  const aiStreaming = useStore((s) => s.aiStreaming);
  const isSupporter = useStore((s) => s.isSupporter);
  const birth = useStore((s) => s.birth);

  const exportReading = () => {
    if (!aiResult) return;
    const label = birth.label || "Chart";
    const selStr = selection ? `${selection.type}: ${selection.id}` : "Whole Chart";
    const lensStr = lens[0].toUpperCase() + lens.slice(1);
    const h = birth.hour, m = birth.minute;
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    const timeStr = `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
    const hr = "━".repeat(44);
    const content = [
      "ASTRA · CELESTIAL OBSERVATORY",
      hr,
      `Chart:    ${label}`,
      `Born:     ${birth.month}/${birth.day}/${birth.year}  ${timeStr}  (UTC ${birth.tz_offset >= 0 ? "+" : ""}${birth.tz_offset}h)`,
      `Place:    ${birth.lat.toFixed(4)}°  ${birth.lng.toFixed(4)}°`,
      `House:    ${birth.house_system}  ·  Zodiac: ${birth.zodiac}`,
      `Focus:    ${selStr}`,
      `Lens:     ${lensStr}`,
      "",
      hr,
      "REFLECTION",
      hr,
      "",
      aiResult.interpretation,
      "",
      hr,
      `Generated ${new Date().toLocaleString()} by Astra`,
      `Provider: ${aiResult.provider ?? "offline"}  ·  Model: ${aiResult.model ?? "—"}`,
    ].join("\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `astra-${label.replace(/\s+/g, "-").toLowerCase()}-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Astra's voice.
  const speech = useSpeech();
  // Auto-read the interpretation once it has fully arrived (not mid-stream).
  const lastSpokenRef = useRef<string | null>(null);
  useEffect(() => {
    if (!aiResult || aiLoading || aiStreaming) return;
    const sig = aiResult.interpretation.slice(0, 40);
    if (autoSpeak && speech.supported && lastSpokenRef.current !== sig) {
      lastSpokenRef.current = sig;
      speech.speak(aiResult.interpretation);
    }
  }, [aiResult, aiLoading, aiStreaming, autoSpeak, speech]);

  if (!chart) {
    return (
      <div className="panel detail">
        <h2 className="section">Detail</h2>
        <p className="muted">Generate a chart to begin your inquiry.</p>
      </div>
    );
  }

  const renderSelected = () => {
    if (!selection) {
      return (
        <>
          <h3>The Whole Sky</h3>
          <p className="muted">
            {chart.meta.zodiac} zodiac · house system {chart.meta.house_system} ·{" "}
            {chart.meta.ephemeris} ephemeris
          </p>
          {chart.patterns.length > 0 && (
            <div style={{ marginTop: 10 }}>
              {chart.patterns.map((pt, i) => (
                <div
                  key={i}
                  className="aspect-line-item"
                  onClick={() => select({ type: "pattern", id: pt.type + ":" + pt.planets.join(",") })}
                >
                  <GlossaryTooltip term={pt.type}><b style={{ color: "var(--gold)" }}>{pt.type}</b></GlossaryTooltip> — {pt.planets.join(", ")}
                </div>
              ))}
            </div>
          )}
        </>
      );
    }

    if (selection.type === "planet") {
      const p = chart.planets.find((x) => x.id === selection.id);
      if (!p) return null;
      const related = chart.aspects.filter((a) => a.p1 === p.id || a.p2 === p.id).slice(0, 8);
      return (
        <>
          <h3>
            {glyphText(p.glyph)} {p.id}
          </h3>
          <p className="muted">
            {formatPos(p)} · {ORDINAL(p.house)} house {p.retrograde ? "· ℞ retrograde" : ""}
          </p>
          <div className="kv"><b>Element / Modality</b><span><GlossaryTooltip term={p.element}>{p.element}</GlossaryTooltip> · <GlossaryTooltip term={p.modality}>{p.modality}</GlossaryTooltip></span></div>
          <div className="kv"><b>Dignity</b><span><GlossaryTooltip term={p.dignity}>{p.dignity}</GlossaryTooltip></span></div>
          <div className="kv"><b>Speed</b><span>{p.speed.toFixed(3)}°/day</span></div>
          <div className="kv"><b>Declination</b><span>{p.declination.toFixed(2)}°</span></div>
          {PLANET_METAL[p.id] && (() => {
            const metal = PLANET_METAL[p.id];
            const principle = MODALITY_PRINCIPLE[p.modality];
            return (
              <div className="alchemy-card" style={{ borderColor: `${metal.color}55` }}>
                <div className="alchemy-card-head">
                  <span className="alchemy-metal-sigil" style={{ color: metal.color }}>
                    {metal.sigil}
                  </span>
                  <span className="alchemy-metal-name">
                    {metal.metal} <i className="alchemy-latin">· {metal.latin}</i>
                  </span>
                  {metal.stage && <span className="alchemy-stage">{metal.stage}</span>}
                </div>
                <div className="alchemy-correspondence">
                  <span className="alchemy-corr-item">
                    <ElementSigil element={p.element} color="var(--gold-soft)" /> {p.element}
                  </span>
                  {principle && (
                    <span className="alchemy-corr-item" title={principle.gloss}>
                      <PrincipleSigil principle={principle.name} color="var(--amethyst-soft)" />{" "}
                      {principle.name}
                    </span>
                  )}
                </div>
                <div className="alchemy-motto">{metal.motto}</div>
              </div>
            );
          })()}
          {related.length > 0 && (
            <>
              <div style={{ marginTop: 10, color: "var(--gold)", fontSize: 13 }}>Aspects</div>
              {related.map((a, i) => {
                const other = a.p1 === p.id ? a.p2 : a.p1;
                return (
                  <div
                    key={i}
                    className="aspect-line-item"
                    onClick={() => select({ type: "aspect", id: `${a.p1}|${a.p2}|${a.type}` })}
                  >
                    <GlossaryTooltip term={a.type}><span style={{ color: a.color }}>{a.type}</span></GlossaryTooltip> {other} · orb {a.orb}°{" "}
                    {a.applying ? "↗" : "↘"}
                  </div>
                );
              })}
            </>
          )}
        </>
      );
    }

    if (selection.type === "house") {
      const h = chart.houses.find((x) => String(x.index) === selection.id);
      if (!h) return null;
      const occupants = chart.planets.filter((p) => p.house === h.index && !["Descendant", "Imum Coeli"].includes(p.id));
      return (
        <>
          <h3>{ORDINAL(h.index)} House</h3>
          <p className="muted">Cusp at {h.degree}°{String(h.minute).padStart(2, "0")}' {h.sign}</p>
          <div style={{ marginTop: 8 }}>
            {occupants.length ? (
              occupants.map((p) => (
                <span key={p.id} className="chip active" onClick={() => select({ type: "planet", id: p.id })}>
                  {glyphText(p.glyph)} {p.id}
                </span>
              ))
            ) : (
              <span className="muted">No bodies tenant this house.</span>
            )}
          </div>
        </>
      );
    }

    if (selection.type === "aspect") {
      const a = chart.aspects.find((x) => `${x.p1}|${x.p2}|${x.type}` === selection.id);
      if (!a) return null;
      return (
        <>
          <h3 style={{ color: a.color }}><GlossaryTooltip term={a.type}>{a.type}</GlossaryTooltip></h3>
          <p className="muted">
            {a.p1} – {a.p2}
          </p>
          <div className="kv"><b>Exact angle</b><span>{a.angle}°</span></div>
          <div className="kv"><b>Separation</b><span>{a.separation}°</span></div>
          <div className="kv"><b>Orb</b><span>{a.orb}°</span></div>
          <div className="kv"><b>Quality</b><span>{a.harmony}</span></div>
          <div className="kv"><b>Phase</b><span>{a.applying ? "Applying" : "Separating"}</span></div>
        </>
      );
    }

    if (selection.type === "pattern") {
      const pt = chart.patterns.find((x) => x.type + ":" + x.planets.join(",") === selection.id);
      if (!pt) return null;
      return (
        <>
          <h3>{pt.type}</h3>
          <p className="muted">{pt.planets.join(" · ")}</p>
          <p style={{ fontSize: 14, lineHeight: 1.5 }}>{pt.description}</p>
        </>
      );
    }
    return null;
  };

  return (
    <div className="panel detail">
      <h2 className="section">Detail</h2>
      {renderSelected()}

      <h2 className="section" style={{ marginTop: 18 }}>Astra · Reflection</h2>
      <div style={{ marginBottom: 8 }}>
        <select value={lens} onChange={(e) => setLens(e.target.value as Lens)}>
          {LENSES.map((l) => (
            <option key={l} value={l}>
              {l[0].toUpperCase() + l.slice(1)} lens
            </option>
          ))}
        </select>
      </div>
      <div className="row" style={{ marginBottom: 8 }}>
        <input
          placeholder={
            selection ? `Ask about this ${selection.type}…` : "Ask about your chart…"
          }
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && q.trim()) {
              ask(q.trim());
            }
          }}
        />
        <button className="primary" style={{ flex: "0 0 auto", width: "auto" }} onClick={() => q.trim() && ask(q.trim())}>
          Ask
        </button>
      </div>
      <div className="row" style={{ marginBottom: 10 }}>
        <button className="ghost" onClick={() => suggest()}>
          ✦ Suggestions
        </button>
        <button
          className={`ghost ${isSupporter ? "" : "locked"}`}
          title={
            isSupporter
              ? "Richer whole-chart synthesis via the in-depth model"
              : "Supporter feature — opens the support panel"
          }
          onClick={() => ask(q.trim() || "Give me an in-depth reading of my whole chart.", "deep")}
        >
          ☾ In-depth reading{!isSupporter && <span className="lock-badge">✦</span>}
        </button>
      </div>

      {/* Astra's voice controls */}
      {(speech.supported || speech.elevenAvailable) && (
        <div className="voice-bar">
          <button
            className="ghost"
            style={{ width: "auto" }}
            onClick={() =>
              speech.speaking || speech.loading
                ? speech.stop()
                : aiResult && speech.speak(aiResult.interpretation)
            }
            disabled={!aiResult || aiStreaming}
            title={speech.speaking ? "Stop" : "Read aloud"}
          >
            {speech.loading ? "⋯ Loading" : speech.speaking ? "■ Stop" : "🔊 Speak"}
          </button>
          <span
            className={`chip ${autoSpeak ? "active" : ""}`}
            onClick={toggleAutoSpeak}
            title="Automatically read each new reflection aloud"
          >
            {autoSpeak ? "◉" : "○"} auto
          </span>

          {/* Engine selector — only shown when the premium voice exists. */}
          {speech.elevenAvailable && (
            <select
              value={speech.engine}
              onChange={(e) => speech.setEngine(e.target.value as "browser" | "elevenlabs")}
              title="Voice engine"
              style={{ width: "auto" }}
            >
              <option value="elevenlabs">ElevenLabs ✦</option>
              <option value="browser">Browser</option>
            </select>
          )}

          {/* Per-engine voice picker. */}
          {speech.engine === "elevenlabs" && speech.elevenVoices.length > 0 ? (
            <select
              value={speech.elevenVoiceId ?? ""}
              onChange={(e) => speech.setElevenVoiceId(e.target.value)}
              style={{ flex: 1, minWidth: 90 }}
              title="ElevenLabs voice"
            >
              {speech.elevenVoices.map((v) => (
                <option key={v.voice_id} value={v.voice_id}>
                  {v.name}
                </option>
              ))}
            </select>
          ) : (
            speech.engine === "browser" &&
            speech.voices.length > 0 && (
              <select
                value={speech.voiceURI ?? ""}
                onChange={(e) => speech.setVoiceURI(e.target.value)}
                style={{ flex: 1, minWidth: 90 }}
                title="Browser voice"
              >
                {speech.voices
                  .filter((v) => v.lang.toLowerCase().startsWith("en"))
                  .map((v) => (
                    <option key={v.voiceURI} value={v.voiceURI}>
                      {v.name}
                    </option>
                  ))}
              </select>
            )
          )}

          <label className="voice-pace">
            Pace
            <input
              type="range"
              min={0.6}
              max={1.3}
              step={0.02}
              value={speech.rate}
              onChange={(e) => speech.setRate(Number(e.target.value))}
              title={`Pace ${speech.rate.toFixed(2)}×`}
            />
            <span style={{ minWidth: 34, textAlign: "right" }}>{speech.rate.toFixed(2)}×</span>
          </label>
        </div>
      )}

      {aiLoading && (
        <p className="muted">
          <span className="spinner" /> Astra is contemplating…
        </p>
      )}
      {aiResult && (
        <>
          <div style={{ marginBottom: 6 }}>
            {speech.speaking && <span className="speaking-dot" title="Astra is speaking" />}
            <span className="tag" title={`${aiResult.provider ?? "?"} · ${aiResult.model ?? ""}`}>
              {aiResult.provider === "kgirl"
                ? "✦ kgirl consensus"
                : aiResult.provider === "ollama"
                ? `⬡ local · ${aiResult.model}`
                : aiResult.source === "llm"
                ? friendlyModel(aiResult.model ?? "")
                : "offline reflection"}
            </span>
            {aiResult.source === "llm" && aiResult.provider !== "kgirl" && aiResult.provider !== "ollama" && MODEL_TIER[aiResult.model ?? ""] && (
              <span className="tag" style={{ marginLeft: 6, color: "var(--gold-soft)", borderColor: "rgba(201,168,76,0.3)" }}>
                {MODEL_TIER[aiResult.model ?? ""]}
              </span>
            )}
            {/* kgirl topological-consensus metrics */}
            {aiResult.provider === "kgirl" && (
              <>
                <span className="tag" style={{ marginLeft: 6 }} title="topological coherence">
                  coh {aiResult.coherence?.toFixed(2)}
                </span>
                <span className="tag" style={{ marginLeft: 6 }} title="free energy">
                  E {aiResult.energy?.toFixed(2)}
                </span>
                {aiResult.decision && (
                  <span className="tag" style={{ marginLeft: 6 }}>{aiResult.decision}</span>
                )}
                {aiResult.rag_hits && aiResult.rag_hits.length > 0 && (
                  <span className="tag" style={{ marginLeft: 6 }} title="ChaosRAG grounding">
                    ⊕ {aiResult.rag_hits.length} sources
                  </span>
                )}
              </>
            )}
            {aiResult.focal_house && (
              <span className="tag" style={{ marginLeft: 6 }}>
                focal: {ORDINAL(aiResult.focal_house)} house
              </span>
            )}
          </div>
          <div className={aiStreaming ? "interp-streaming" : undefined}>
            <Interpretation
              text={aiResult.interpretation}
              streaming={aiStreaming}
              onSpeak={(body) => speech.speak(body)}
            />
          </div>
          {aiResult.note && <p className="muted" style={{ marginTop: 6 }}>{aiResult.note}</p>}
          {!aiStreaming && (
            <button
              className="ghost"
              style={{ fontSize: 11, padding: "3px 10px", width: "auto", marginTop: 8 }}
              onClick={exportReading}
              title="Download this reading as a text file"
            >
              ↓ Save Reading
            </button>
          )}
        </>
      )}
    </div>
  );
};
