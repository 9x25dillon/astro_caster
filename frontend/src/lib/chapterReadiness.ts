// lib/chapterReadiness.ts — Track E-2a: what each chapter needs before it has
// anything to say.
//
// The ergonomic law forbids expressing depth by hiding chapters and revealing
// them later: dial nodes sit at fixed compass positions and NEVER move, appear,
// or reorder, because spatial memory is the entire point of the dial. So depth
// is expressed as STATE. All eight chapters exist from the first second — the
// map is honest and complete immediately — and only their illumination changes.
//
// An unlit chapter is never disabled. It opens, it answers its number key, and
// it says what would light it. That teaches the instrument; refusing would just
// train people not to press things.
import type { Chapter } from "../components/ChapterDial";

export interface Corpus {
  /** A chart somebody actually cast — the arrival sky doesn't count. */
  hasOwnChart: boolean;
  /** Saved profiles, i.e. whether a SECOND chart exists to compare against. */
  savedCharts: number;
  /** Anything shelved or written down. */
  hasLibrary: boolean;
}

const CAST_ONE = "Cast your chart and this lights.";

/**
 * The explanation a chapter owes when it is unlit, or null when it is ready.
 * Each line names the one action that lights it — the point is to teach what
 * the instrument does next, not to explain a refusal.
 */
export function chapterNeed(ch: Chapter, c: Corpus): string | null {
  switch (ch) {
    case "I":
      return null; // The wheel always has a sky to show.
    case "II":
      return c.hasOwnChart ? null : `The Reading interprets your own chart. ${CAST_ONE}`;
    case "III":
      return c.hasOwnChart ? null : `Timing measures today's sky against your own chart. ${CAST_ONE}`;
    case "IV":
      if (!c.hasOwnChart) return `Relations compares two charts. ${CAST_ONE}`;
      return c.savedCharts > 0
        ? null
        : "Relations compares two charts. Save a second one and this lights.";
    case "V":
      return c.hasOwnChart ? null : `Depths works the finer structure of your own chart. ${CAST_ONE}`;
    case "VI":
      return c.hasOwnChart ? null : `The Study draws a path from your own chart. ${CAST_ONE}`;
    case "VII":
      return c.hasOwnChart ? null : `The Studio renders cards from your own chart. ${CAST_ONE}`;
    case "VIII":
      return c.hasLibrary
        ? null
        : "The Library holds what you keep. Shelve a reading or write a reflection and this lights.";
  }
}

/** Convenience for the dial: the set of chapters that currently have material. */
export function litChapters(c: Corpus): Set<Chapter> {
  const all: Chapter[] = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];
  return new Set(all.filter((ch) => chapterNeed(ch, c) === null));
}
