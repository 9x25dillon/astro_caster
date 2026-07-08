// tomePrint.ts — one place that turns a session (live or shelved) into the
// printed tome. Used by ArcanaModal right after compiling the deluxe edition
// and by the Bookshelf when reprinting a stored one — the shelf path re-casts
// the chart on-device from the saved birth data, so reprints work fully
// offline, months later.

import { localChart, localTarotReading } from "../api/client";
import type { SourceSystem, SpreadType } from "../api/client";
import type { BirthInput, ChartResponse } from "../types";
import { printReport } from "./printReport";

export interface TomeSession {
  reportMarkdown: string;
  seed: string;
  spread: string;
  source: string;
  question: string;
  lineage?: string;
  date?: string | null; // the oracle call's local date (daily spreads)
  oracleDate: string; // shown in the document title
  birth: BirthInput | null;
  chart?: ChartResponse | null; // reuse the live chart when the caller has it
}

/** Print the tome for a session. Returns false when the popup was blocked. */
export async function printSessionTome(s: TomeSession): Promise<boolean> {
  // {{BIRTH_INFO}} is filled HERE, locally — birth details never leave the
  // browser (the server/AI only ever saw the placeholder).
  const pad = (n: number) => `${n}`.padStart(2, "0");
  const b = s.birth;
  const birthInfo = b
    ? `${b.label ? b.label + " · " : ""}${b.year}-${pad(b.month)}-${pad(b.day)}` +
      ` ${pad(b.hour)}:${pad(b.minute)} · ${b.lat.toFixed(2)}°, ${b.lng.toFixed(2)}°`
    : "";

  // The chart feeds the cover constellation, the alchemy appendix, and the
  // plate re-deal. A shelved session re-casts it on-device (WASM Swiss).
  let chart = s.chart ?? null;
  if (!chart && b) {
    try {
      chart = await localChart(b);
    } catch {
      /* tome prints without chart-derived pages */
    }
  }

  // Plates page: re-deal the SESSION's spread deterministically on-device —
  // same chart + spread + question + date + lineage ⇒ the same cards the
  // report reads (parity-locked), not a new shuffle. Optional on failure.
  let spreadCards;
  try {
    if (chart) {
      const redeal = await localTarotReading(
        chart,
        s.spread as SpreadType,
        s.question,
        { source: s.source as SourceSystem, date: s.date ?? undefined }
      );
      spreadCards = redeal.cards.map((c) => ({
        position: c.position, name: c.card.name, arcana: c.card.arcana,
        number: c.card.number, element: c.card.element, reversed: c.reversed,
        natalLink: c.natal_link, meaning: c.meaning, keywords: c.card.keywords,
      }));
    }
  } catch {
    /* the tome still prints without plates */
  }

  return printReport(s.reportMarkdown, {
    spreadCards,
    spreadName: s.spread,
    lineage: s.lineage,
    birthInfo,
    sigilPhrase: s.question || "astra arcana",
    title: `Astra Arcana — Personal Report · ${s.oracleDate}`,
    // Tome frontispiece: the user's own constellation + session star field.
    chartPlanets: chart?.planets.map((p) => ({ id: p.id, longitude: p.longitude })),
    seed: s.seed,
    // Appendix page: each body's metal, opus stage, element, and principle.
    alchemyPlanets: chart?.planets.map((p) => ({
      id: p.id, element: p.element, modality: p.modality, sign: p.sign,
    })),
  });
}
