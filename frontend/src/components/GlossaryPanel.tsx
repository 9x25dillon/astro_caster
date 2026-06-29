// GlossaryPanel.tsx — searchable glossary with chart-context insights (premium).
import React, { useState, useMemo } from "react";
import { GLOSSARY, CATEGORIES, type GlossaryEntry, type GlossaryCategory } from "../lib/glossary";
import { useStore } from "../store/useStore";
import type { ChartResponse } from "../types";

// ── Chart-context personalisation ────────────────────────────────────────────

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

function chartContext(entry: GlossaryEntry, chart: ChartResponse): string | null {
  switch (entry.category) {
    case "planet": {
      const p = chart.planets.find((pl) => pl.id === entry.term);
      if (!p) return null;
      const retro = p.retrograde ? ", retrograde ℞" : "";
      return `Your ${entry.term} is in ${p.sign} (${p.degree}°${String(p.minute).padStart(2, "0")}'), ${ordinal(p.house)} house${retro}. Dignity: ${p.dignity}.`;
    }
    case "aspect": {
      const matches = chart.aspects.filter((a) => a.type === entry.term);
      if (matches.length === 0) return `No ${entry.term} aspects in your chart.`;
      const examples = matches
        .sort((a, b) => a.orb - b.orb)
        .slice(0, 3)
        .map((a) => `${a.p1}–${a.p2} (orb ${a.orb}°)`)
        .join("; ");
      return `You have ${matches.length} ${entry.term}${matches.length !== 1 ? "s" : ""}: ${examples}${matches.length > 3 ? " …" : ""}.`;
    }
    case "element": {
      const count = chart.elements[entry.term] ?? 0;
      const total = Object.values(chart.elements).reduce((a, b) => a + b, 0);
      const pct = total > 0 ? Math.round((count / total) * 100) : 0;
      const planets = chart.planets
        .filter((p) => p.element === entry.term && !["Ascendant", "Midheaven", "Descendant", "Imum Coeli"].includes(p.id))
        .map((p) => p.id);
      const list = planets.length ? ` (${planets.join(", ")})` : "";
      return `${entry.term} in your chart: ${count} planet${count !== 1 ? "s" : ""}${list} — ${pct}% of the total emphasis.`;
    }
    case "modality": {
      const count = chart.modalities[entry.term] ?? 0;
      const total = Object.values(chart.modalities).reduce((a, b) => a + b, 0);
      const pct = total > 0 ? Math.round((count / total) * 100) : 0;
      return `${entry.term} modality: ${count} planet${count !== 1 ? "s" : ""} — ${pct}% of your chart's emphasis.`;
    }
    case "dignity": {
      const planets = chart.planets
        .filter((p) => p.dignity === entry.term && !["Ascendant", "Midheaven", "Descendant", "Imum Coeli"].includes(p.id));
      if (planets.length === 0) return `No planets in ${entry.term.toLowerCase()} in your chart.`;
      return `In ${entry.term.toLowerCase()} in your chart: ${planets.map((p) => `${p.id} (${p.sign})`).join(", ")}.`;
    }
    case "pattern": {
      const matches = chart.patterns.filter((pt) => pt.type === entry.term);
      if (matches.length === 0) return `No ${entry.term} pattern in your chart.`;
      return matches.map((pt) => `${pt.type}: ${pt.planets.join(" · ")}`).join("; ");
    }
    case "concept": {
      if (entry.term === "Ascendant") {
        const asc = chart.planets.find((p) => p.id === "Ascendant");
        return asc ? `Your Ascendant is at ${asc.degree}°${String(asc.minute).padStart(2, "0")}' ${asc.sign}.` : null;
      }
      if (entry.term === "Midheaven") {
        const mc = chart.planets.find((p) => p.id === "Midheaven");
        return mc ? `Your Midheaven is at ${mc.degree}°${String(mc.minute).padStart(2, "0")}' ${mc.sign}.` : null;
      }
      if (entry.term === "Retrograde") {
        const retro = chart.planets.filter(
          (p) => p.retrograde && !["Ascendant", "Midheaven", "Descendant", "Imum Coeli"].includes(p.id)
        );
        if (retro.length === 0) return "No retrograde planets in your natal chart.";
        return `Retrograde in your chart: ${retro.map((p) => p.id).join(", ")}.`;
      }
      if (entry.term === "Orb") {
        const tight = chart.aspects.filter((a) => a.orb <= 2);
        if (tight.length === 0) return "No aspects under 2° orb in your chart.";
        const top = tight.sort((a, b) => a.orb - b.orb).slice(0, 3).map((a) => `${a.p1}–${a.p2} ${a.type} (${a.orb}°)`).join("; ");
        return `Tightest aspects (under 2°): ${top}.`;
      }
      return null;
    }
    default:
      return null;
  }
}

// ── Panel component ───────────────────────────────────────────────────────────

export const GlossaryPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const chart = useStore((s) => s.chart);
  const isSupporter = useStore((s) => s.isSupporter);
  const openSupport = useStore((s) => s.openSupport);

  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<GlossaryCategory | "all">("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return GLOSSARY.filter((e) => {
      const matchCat = cat === "all" || e.category === cat;
      const matchQ = !q || e.term.toLowerCase().includes(q) || e.short.toLowerCase().includes(q);
      return matchCat && matchQ;
    });
  }, [query, cat]);

  const toggle = (term: string) => setExpanded((prev) => (prev === term ? null : term));

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal gloss-modal">
        <button className="modal-close" onClick={onClose}>×</button>
        <h2 className="section" style={{ marginTop: 0 }}>⊕ Astrological Glossary</h2>

        {/* Search */}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search terms…"
          style={{ marginBottom: 10 }}
          autoFocus
        />

        {/* Category chips */}
        <div className="layer-toggles" style={{ marginBottom: 14 }}>
          {(["all", ...CATEGORIES] as const).map((c) => (
            <span
              key={c}
              className={`chip ${cat === c ? "active" : ""}`}
              onClick={() => setCat(c)}
            >
              {c}
            </span>
          ))}
        </div>

        {/* Entry list */}
        <div className="gloss-list">
          {filtered.length === 0 && (
            <p className="muted">No terms match your search.</p>
          )}
          {filtered.map((entry) => {
            const isOpen = expanded === entry.term;
            const ctx = chart ? chartContext(entry, chart) : null;
            return (
              <div key={entry.term} className={`gloss-entry ${isOpen ? "open" : ""}`}>
                <div className="gloss-entry-head" onClick={() => toggle(entry.term)}>
                  <span className="gloss-entry-term">
                    {entry.glyph && <span style={{ marginRight: 6, color: "var(--gold)" }}>{entry.glyph}</span>}
                    {entry.term}
                    <span className="tag" style={{ marginLeft: 8, verticalAlign: "middle" }}>{entry.category}</span>
                  </span>
                  <span className="gloss-entry-chevron">{isOpen ? "▲" : "▼"}</span>
                </div>
                <div className="gloss-entry-short">{entry.short}</div>

                {isOpen && (
                  <div className="gloss-entry-body">
                    <p className="gloss-detail">{entry.detail}</p>

                    {/* "In Your Chart" context */}
                    {ctx && (
                      <div className="gloss-chart-ctx">
                        <span className="gloss-ctx-label">In your chart</span>
                        {isSupporter ? (
                          <span>{ctx}</span>
                        ) : (
                          <span className="locked" title="Supporter feature">
                            {ctx.replace(/[^ ]/g, "·").slice(0, 60)}…{" "}
                            <span className="lock-badge" style={{ cursor: "pointer" }} onClick={() => openSupport(true)}>
                              ✦ unlock
                            </span>
                          </span>
                        )}
                      </div>
                    )}

                    {/* Apply tip (premium) */}
                    <div className={`gloss-apply-box ${!isSupporter ? "locked" : ""}`}>
                      <span className="gloss-ctx-label">How to apply</span>
                      {isSupporter ? (
                        <span>{entry.apply}</span>
                      ) : (
                        <span>
                          {entry.apply.slice(0, 48)}…{" "}
                          <span
                            className="lock-badge"
                            style={{ cursor: "pointer" }}
                            onClick={() => openSupport(true)}
                          >
                            ✦ supporter feature
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {!isSupporter && (
          <div style={{ marginTop: 12, textAlign: "center" }}>
            <button className="ghost" style={{ fontSize: 13 }} onClick={() => { onClose(); openSupport(true); }}>
              ✦ Unlock full glossary insights — support the observatory
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
