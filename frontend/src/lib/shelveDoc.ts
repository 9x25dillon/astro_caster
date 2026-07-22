// shelveDoc.ts — The Archive: shelve the text that chapters III (forecasts),
// IV (relationships), and V (specialist charts) produce, so the tome binds
// them instead of leaving those chapters empty.
//
// The feature results are structured, not prose, so we render a concise,
// honest markdown summary (headline facts + the notable rows) rather than
// dumping JSON. Keyed by kind+title, so re-running the same reading overwrites.

import { docSave, type DocChapter } from "./bookshelf";
import type { BirthInput } from "../types";

type Row = Record<string, unknown>;

function isRows(v: unknown): v is Row[] {
  return Array.isArray(v) && v.every((x) => x && typeof x === "object");
}

/** Pull a human label out of a result row, whatever its exact field is. */
function rowLine(r: Row): string {
  const pick = (...keys: string[]) =>
    keys.map((k) => r[k]).find((v) => v != null && v !== "");
  const name = pick("title", "name", "label", "aspect", "kind", "nature", "star", "body");
  const when = pick("date", "iso", "when", "peak", "exact");
  const detail = pick("meaning", "note", "orb", "description", "houses", "influence");
  const bits = [name, when, detail].filter((v) => v != null).map(String);
  return bits.length ? `- ${bits.join(" · ")}` : "";
}

/** A compact markdown summary of any feature result. Lists the first, most
 *  meaningful array it finds (events/aspects/hits/…) plus scalar headline
 *  fields, so the tome carries the substance without the raw shape. */
function summarize(result: unknown): string {
  if (!result || typeof result !== "object") return "_(no detail)_";
  const obj = result as Row;
  const parts: string[] = [];

  // Headline scalars worth stating.
  for (const k of ["return_iso", "year", "harmonic", "start", "days", "count"]) {
    if (obj[k] != null) parts.push(`**${k.replace(/_/g, " ")}:** ${String(obj[k])}`);
  }

  // The richest array in the result becomes the body.
  const arrays = Object.entries(obj).filter(([, v]) => isRows(v)) as [string, Row[]][];
  arrays.sort((a, b) => b[1].length - a[1].length);
  if (arrays.length) {
    const [label, rows] = arrays[0];
    parts.push(`\n**${rows.length} ${label.replace(/_/g, " ")}**`);
    for (const r of rows.slice(0, 40)) {
      const line = rowLine(r);
      if (line) parts.push(line);
    }
    if (rows.length > 40) parts.push(`- …and ${rows.length - 40} more`);
  }

  return parts.join("\n") || "_(no detail)_";
}

/** Render a summary and shelve it under the given chapter. Best-effort:
 *  never throws into the caller (a failed shelve must not break the reading). */
export async function shelveReading(opts: {
  kind: string;
  chapter: DocChapter;
  title: string;
  result: unknown;
  birth?: BirthInput | null;
}): Promise<void> {
  try {
    await docSave({
      id: `${opts.kind}:${opts.title}`,
      kind: opts.kind,
      chapter: opts.chapter,
      title: opts.title,
      markdown: summarize(opts.result),
      seed: null,
      meta: opts.birth?.label ? { subject: opts.birth.label } : null,
    });
  } catch {
    /* shelving is best-effort */
  }
}

/** Shelve a forecast (chapter III) from its event list. */
export async function shelveForecast(
  events: unknown[],
  start: string,
  days: number
): Promise<void> {
  await shelveReading({
    kind: "forecast",
    chapter: "III",
    title: `Forecast · ${start} · ${days}d`,
    result: { start, days, events },
  });
}
