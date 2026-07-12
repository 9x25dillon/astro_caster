// tomeCompile.ts — R-3: ✦ Generate My Tome (wireframes fig. 4). Compiles
// everything the observatory holds into ONE printed volume via the existing
// print-CSS path — PB1's press-ready book trim comes later. The tome's
// chapters are the dial's eight, in the same order; chapters with no
// material yet are listed honestly rather than padded.
//
// Fully local: the corpus is the browser's own shelf + journal, the chart
// feeds the cover constellation, and printing happens in a local popup.

import {
  journalAll, shelfList,
  type JournalEntry, type ShelfEntry,
} from "./bookshelf";
import { coverArtSvg, printReport } from "./printReport";
import type { BirthInput, ChartResponse } from "../types";

export interface TomeChapterState {
  numeral: string;
  name: string;
  count: number;    // material units bound into this chapter
  detail: string;   // what's bound, or what would fill it
}

export interface TomeManifest {
  chapters: TomeChapterState[];
  bound: number;    // chapters carrying material
  total: number;    // always 8
}

const isCourse = (e: ShelfEntry) => e.spread === "course";

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

/** The spine meter's data: what each of the eight chapters holds today. */
export function buildManifest(
  shelf: ShelfEntry[],
  journal: JournalEntry[],
  hasChart: boolean
): TomeManifest {
  const sessions = shelf.filter((e) => !isCourse(e));
  const courses = shelf.filter(isCourse);
  const deluxe = sessions.filter((e) => e.personal).length;

  const chapters: TomeChapterState[] = [
    {
      numeral: "I", name: "The Chart", count: hasChart ? 1 : 0,
      detail: hasChart
        ? "your natal geometry — cover constellation, alchemical appendix"
        : "cast a chart and the tome opens with your sky",
    },
    {
      numeral: "II", name: "The Reading", count: sessions.length,
      detail: sessions.length
        ? plural(sessions.length, "oracle session") +
          (deluxe ? ` · ${plural(deluxe, "deluxe edition")}` : "")
        : "generate an Oracle Report and it binds itself here",
    },
    {
      numeral: "III", name: "The Timing", count: 0,
      detail: "forecasts don't shelve yet — a later arc binds the clocks",
    },
    {
      numeral: "IV", name: "The Relations", count: 0,
      detail: "relationship charts don't shelve yet",
    },
    {
      numeral: "V", name: "The Depths", count: 0,
      detail: "the specialist instruments don't shelve yet",
    },
    {
      numeral: "VI", name: "The Study", count: courses.length,
      detail: courses.length
        ? plural(courses.length, "composed course")
        : "compose a Course in the Study and it becomes a chapter",
    },
    {
      numeral: "VII", name: "The Studio", count: 0,
      detail: "rendered plates don't shelve yet — save the .png meanwhile",
    },
    {
      numeral: "VIII", name: "The Library", count: journal.length,
      detail: journal.length
        ? plural(journal.length, "kept reflection")
        : "keep a reflection and the journal binds in",
    },
  ];

  return {
    chapters,
    bound: chapters.filter((c) => c.count > 0).length,
    total: chapters.length,
  };
}

export async function loadManifest(hasChart: boolean): Promise<TomeManifest> {
  const shelf = await shelfList().catch(() => [] as ShelfEntry[]);
  const journal = await journalAll().catch(() => [] as JournalEntry[]);
  return buildManifest(shelf, journal, hasChart);
}

function sessionMarkdown(e: ShelfEntry): string {
  const head =
    `## ${e.question || "An Oracle session"} — ${e.updatedAt.slice(0, 10)}\n\n` +
    `*${e.lineage} · ${e.spread}${e.ai_source === "llm" ? ` · ${e.model ?? "live"}` : " · offline compiler"}*\n\n`;
  // The deluxe edition contains the Oracle core within it — prefer it whole
  // rather than binding the same reading twice.
  return head + (e.personal ? e.personal.report_markdown : e.report);
}

function journalMarkdownSection(journal: JournalEntry[], shelf: ShelfEntry[]): string {
  const bySeed = new Map<string, JournalEntry[]>();
  for (const j of journal) {
    if (!bySeed.has(j.seed)) bySeed.set(j.seed, []);
    bySeed.get(j.seed)!.push(j);
  }
  const parts: string[] = [];
  for (const [seed, entries] of bySeed) {
    const session = shelf.find((e) => e.seed === seed);
    const title = session?.question ?? entries[0]?.question ?? seed;
    parts.push(`## ${title}`);
    for (const j of entries) {
      const meta = [j.position, j.cardName].filter(Boolean).join(" — ");
      if (meta) parts.push(`**${meta}**`);
      if (j.prompt) parts.push(`*✎ ${j.prompt}*`);
      parts.push(j.text);
    }
  }
  return parts.join("\n\n");
}

export const TOME_REFRAIN =
  "Nothing Astra produces is a life sentence — it is a life poem.";

/** Compile the whole corpus into one printed tome. Returns false when the
 *  print popup was blocked. Phase 0: trim "book" renders at 6×9" + bleed —
 *  the POD interior file (the cover ships separately via pressCover). */
export async function compileTome(
  birth: BirthInput | null,
  chart: ChartResponse | null,
  opts: { trim?: "letter" | "book" } = {}
): Promise<boolean> {
  const shelf = await shelfList().catch(() => [] as ShelfEntry[]);
  const journal = await journalAll().catch(() => [] as JournalEntry[]);
  const manifest = buildManifest(shelf, journal, !!chart);
  const sessions = shelf.filter((e) => !isCourse(e));
  const courses = shelf.filter(isCourse);
  const today = new Date().toISOString().slice(0, 10);

  const parts: string[] = [
    `# ✦ THE TOME ✦`,
    `Compiled ${today} · ${manifest.bound} of ${manifest.total} chapters carry material. ` +
      `This volume binds what the observatory holds today — it thickens as you read.`,
  ];

  if (sessions.length) {
    parts.push(`# Chapter II — The Reading`);
    for (const e of sessions) parts.push(sessionMarkdown(e));
  }
  if (courses.length) {
    parts.push(`# Chapter VI — The Study`);
    for (const e of courses) parts.push(sessionMarkdown(e));
  }
  if (journal.length) {
    parts.push(`# Chapter VIII — The Library · Reflections`);
    parts.push(journalMarkdownSection(journal, shelf));
  }

  const waiting = manifest.chapters.filter((c) => c.count === 0);
  if (waiting.length) {
    parts.push(`# The chapters still waiting`);
    parts.push(
      waiting.map((c) => `- **${c.numeral} · ${c.name}** — ${c.detail}`).join("\n")
    );
  }

  // The colophon: the tome's last page ends with the refrain (voice canon).
  parts.push(`# Colophon`);
  parts.push(`*${TOME_REFRAIN}*`);

  const pad = (n: number) => `${n}`.padStart(2, "0");
  const birthInfo = birth
    ? `${birth.label ? birth.label + " · " : ""}${birth.year}-${pad(birth.month)}-${pad(birth.day)}` +
      ` ${pad(birth.hour)}:${pad(birth.minute)} · ${birth.lat.toFixed(2)}°, ${birth.lng.toFixed(2)}°`
    : "";

  return printReport(parts.join("\n\n"), {
    title: `Astra — The Tome · ${today}`,
    birthInfo,
    sigilPhrase: "the tome of my sky",
    seed: `tome:${today}`,
    trim: opts.trim,
    chartPlanets: chart?.planets.map((p) => ({ id: p.id, longitude: p.longitude })),
    alchemyPlanets: chart?.planets.map((p) => ({
      id: p.id, element: p.element, modality: p.modality, sign: p.sign,
    })),
  });
}

/** Phase 0: the SEPARATE cover file POD vendors want — one full-bleed
 *  6.25 × 9.25in page (6×9 trim + 0.125" bleed) carrying the dark cover
 *  plate: the owner's constellation around the tome sigil. Front cover
 *  only — the vendor's cover wizard composes spine and back from it.
 *  Returns false when the popup was blocked. */
export function pressCover(
  birth: BirthInput | null,
  chart: ChartResponse | null
): boolean {
  const today = new Date().toISOString().slice(0, 10);
  const art = coverArtSvg({
    planets: chart?.planets.map((p) => ({ id: p.id, longitude: p.longitude })),
    seed: `tome:${today}`,
    phrase: "the tome of my sky",
  });
  const name = birth?.label || "Traveler";
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<title>Astra — The Tome · cover</title>
<style>
  @page { size: 6.25in 9.25in; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; }
  .cover {
    width: 6.25in; height: 9.25in;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 0.35in; text-align: center;
    background: linear-gradient(180deg, #0D0620 0%, #1A0F33 55%, #2C1654 100%);
    color: #F8F4E9; font-family: Georgia, "EB Garamond", serif;
    /* Keep type inside the trim + safe zone (bleed 0.125 + safety 0.25). */
    padding: 0.6in 0.5in;
  }
  .cover-art { width: 4.6in; height: 4.6in; }
  h1 { font-family: "Cinzel", Georgia, serif; font-size: 1.9rem; letter-spacing: 4px;
       margin: 0; color: #F8F4E9; }
  .name { color: #C9A84C; font-style: italic; font-size: 1.05rem; margin: 0; }
  .refrain { color: #C9A84C; font-style: italic; font-size: 0.72rem; opacity: 0.85;
             margin: 0; max-width: 4.6in; }
</style></head><body>
  <section class="cover">
    ${art}
    <h1>THE TOME</h1>
    <p class="name">${esc(name)} · ${today}</p>
    <p class="refrain">${esc(TOME_REFRAIN)}</p>
  </section>
</body></html>`;
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  w.focus();
  w.setTimeout(() => w.print(), 250);
  return true;
}
