// spreadLayout.ts — true positional geometry for the traditional spreads.
//
// A Celtic Cross laid out as a plain responsive row is just ten cards in a line;
// the arrangement IS the tradition, and the position of a card on the cloth is
// half of what it means. This module supplies a CSS-grid geometry per spread.
// Spreads with no entry keep the auto-fit row, which is the right rendering for
// the chart-native spreads (a twelve-house draw has no canonical tableau).
//
// Keyed by INDEX, never by label. The position strings live in two engines
// (backend/tarot.py and packages/astra-core/src/tarot.ts) and are re-wordable;
// their ORDER is fixed by the parity vectors and the stored seeds, so the order
// is the stable thing to build on. `cells` must have exactly one entry per
// position in the spread — asserted by spreadLayout.test.ts against the engine.
//
// ONE DEVIATION FROM THE CLOTH, deliberate: on a real table card 2 is laid
// bodily across card 1, rotated a quarter turn and overlapping it. These cards
// are text panels of variable height carrying the meaning, the weight sources
// and the activity — rotating one makes it unreadable, and overlapping one
// clips whichever is taller. The Crossing therefore sits immediately beneath
// The Heart in its own cell, rendered LANDSCAPE (wide and short, the shape a
// rotated card actually has) and marked with the crossing rule. It reads as
// laid across without costing the reader the words.

import type { CSSProperties } from "react";

export interface SpreadLayout {
  /** CSS grid-template-columns value. */
  columns: string;
  /** One string per grid row, naming the cell in each column. "." = empty. */
  rows: string[];
  /** Grid-area name for each position, in engine order. */
  cells: string[];
  /** Positions (by index) that render as a landscape panel. */
  landscape?: number[];
  /** Human note shown under the tableau, so the geometry explains itself. */
  note: string;
}

const CELTIC_CROSS: SpreadLayout = {
  //   past  centre  future  staff
  columns: "1fr 1.15fr 1fr 1fr",
  rows: [
    ".     crown     .       outcome",
    "past  heart     future  hopes",
    ".     crossing  .       environment",
    ".     foundation .      self",
  ],
  // Engine order: Heart, Crossing, Foundation, Recent Past, Crown,
  // Near Future, Self, Environment, Hopes and Fears, Outcome.
  cells: [
    "heart", "crossing", "foundation", "past", "crown",
    "future", "self", "environment", "hopes", "outcome",
  ],
  landscape: [1],
  note: "The cross reads centre-out; the staff reads bottom-up, Self to Outcome.",
};

const TREE_OF_LIFE: SpreadLayout = {
  // Severity (left) · Mildness (centre) · Mercy (right) — the three pillars.
  columns: "1fr 1fr 1fr",
  rows: [
    ".        kether     .",
    "binah    .          chokmah",
    "geburah  .          chesed",
    ".        tiphareth  .",
    "hod      .          netzach",
    ".        yesod      .",
    ".        malkuth    .",
  ],
  // Engine order is 1–10 down the Tree, Kether to Malkuth.
  cells: [
    "kether", "chokmah", "binah", "chesed", "geburah",
    "tiphareth", "netzach", "hod", "yesod", "malkuth",
  ],
  note: "Severity on the left, Mercy on the right, the Middle Pillar between them.",
};

export const SPREAD_LAYOUTS: Record<string, SpreadLayout> = {
  celtic_cross: CELTIC_CROSS,
  tree_of_life: TREE_OF_LIFE,
};

/** The geometry for a spread, or null when it should use the plain card row. */
export function layoutFor(spread: string): SpreadLayout | null {
  return SPREAD_LAYOUTS[spread] ?? null;
}

/** Inline grid style for the tableau container. */
export function gridStyle(layout: SpreadLayout): CSSProperties {
  return {
    gridTemplateColumns: layout.columns,
    gridTemplateAreas: layout.rows.map((r) => `"${r}"`).join(" "),
  };
}
