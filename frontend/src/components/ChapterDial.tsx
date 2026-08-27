// ChapterDial — Track R R-1: the observatory's navigation is an orrery dial.
// Eight chapters at FIXED compass positions around the wheel (chapter I is
// always north; position = muscle memory — nodes never reorder). At rest
// (chapter I) the full ring breathes around the wheel; inside a chapter it
// collapses to a compact numeral rail pinned bottom-right. On narrow screens
// both states flatten into a bottom thumb-arc (44px targets).
//
// R-1 is geometry: the dial replaces the seven masthead module buttons.
// Material treatment (void glass, ion traces) arrives with R-4.
import React from "react";

export type Chapter = "I" | "II" | "III" | "IV" | "V" | "VI" | "VII" | "VIII";

export interface ChapterDef {
  ch: Chapter;
  name: string;
  hint: string;
  myst?: boolean; // esoteric surfaces keep the amethyst chrome
}

export const CHAPTERS: ChapterDef[] = [
  { ch: "I",    name: "Chart",     hint: "The wheel — home (Esc)" },
  { ch: "II",   name: "Reading",   hint: "Signature, draw, oracle report" },
  { ch: "III",  name: "Timing",    hint: "Forecast, returns, eclipses" },
  { ch: "IV",   name: "Relations", hint: "Synastry, composite, Davison" },
  { ch: "V",    name: "Depths",    hint: "Harmonics, midpoints, stars, torus, field" },
  { ch: "VI",   name: "Study",     hint: "Learning path, the Course, glossary", myst: true },
  { ch: "VII",  name: "Studio",    hint: "Expressions, deck art, plates", myst: true },
  { ch: "VIII", name: "Library",   hint: "Shelf, journal, vault" },
];

export const ChapterDial: React.FC<{
  active: Chapter;
  onSelect: (ch: Chapter) => void;
  /**
   * E-2a: chapters that currently have material. Unlit nodes keep their exact
   * position and stay fully operable — illumination is the ONLY difference.
   * Omit to light everything (the dial's own default is not to editorialise).
   */
  lit?: Set<Chapter>;
  /** What an unlit chapter is waiting for, shown on hover/focus. */
  need?: (ch: Chapter) => string | null;
}> = ({ active, onSelect, lit, need }) => {
  const atRest = active === "I";
  return (
    <nav
      className={`chapter-dial ${atRest ? "at-rest" : "mini"}`}
      aria-label="Chapters"
    >
      <div className="dial-orbit">
        {CHAPTERS.map((c, i) => {
          // Fixed compass positions: I north, then clockwise every 45°.
          // This angle is the ONLY thing that decides where a node sits, and
          // it depends on nothing but the index — which is what makes "nodes
          // never move" a property of the code rather than a promise.
          const angle = -90 + i * 45;
          const waiting = lit ? !lit.has(c.ch) : false;
          const needs = waiting && need ? need(c.ch) : null;
          return (
            <button
              key={c.ch}
              data-ch={c.ch}
              className={
                "dial-node" +
                (c.ch === active ? " active" : "") +
                (c.myst ? " myst" : "") +
                (waiting ? " waiting" : "")
              }
              style={{ "--a": `${angle}deg` } as React.CSSProperties}
              title={needs ?? `${c.ch} · ${c.name} — ${c.hint}`}
              // The need belongs in the DESCRIPTION, never the name: folding it
              // into aria-label made every node's accessible name contain its
              // explanation, and "…what you keep" started matching by-name
              // queries for the journal's "Keep" button.
              aria-label={`Chapter ${c.ch} · ${c.name}`}
              aria-description={needs ?? undefined}
              aria-current={c.ch === active ? "page" : undefined}
              onClick={() => onSelect(c.ch)}
            >
              <span className="dial-num">{c.ch}</span>
              <span className="dial-name"> · {c.name}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
