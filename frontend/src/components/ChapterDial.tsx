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
  { ch: "V",    name: "Depths",    hint: "Harmonics, midpoints, fixed stars" },
  { ch: "VI",   name: "Study",     hint: "Learning path, the Course, glossary", myst: true },
  { ch: "VII",  name: "Studio",    hint: "Expressions, deck art, plates", myst: true },
  { ch: "VIII", name: "Library",   hint: "Shelf, journal, vault" },
];

export const ChapterDial: React.FC<{
  active: Chapter;
  onSelect: (ch: Chapter) => void;
}> = ({ active, onSelect }) => {
  const atRest = active === "I";
  return (
    <nav
      className={`chapter-dial ${atRest ? "at-rest" : "mini"}`}
      aria-label="Chapters"
    >
      <div className="dial-orbit">
        {CHAPTERS.map((c, i) => {
          // Fixed compass positions: I north, then clockwise every 45°.
          const angle = -90 + i * 45;
          return (
            <button
              key={c.ch}
              data-ch={c.ch}
              className={
                "dial-node" +
                (c.ch === active ? " active" : "") +
                (c.myst ? " myst" : "")
              }
              style={{ "--a": `${angle}deg` } as React.CSSProperties}
              title={`${c.ch} · ${c.name} — ${c.hint}`}
              aria-label={`Chapter ${c.ch} · ${c.name}`}
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
