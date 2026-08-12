// dailyOracle.ts — the day's card, computed ahead of time, on the device.
//
// Three surfaces want the same thing and none of them can ask a server for it:
// the in-app daily panel, the notification that fires at 8am, and the
// home-screen widget. The notification and the widget are the hard ones —
// neither runs our JavaScript at the moment it needs an answer. A notification
// is scheduled hours or days before it fires; a widget redraws while the app
// is not running at all.
//
// The way out is that a daily draw is already a pure function of (chart, date):
// `defaultSeed` folds the local date into the seed for `spread === "daily"`
// (tarot.ts), and the draw is the parity-locked MT19937 sequence over it. So
// the app can compute a RUN of days in advance, hand the results to the
// scheduler and to Android's SharedPreferences, and let both read a plain
// string later. Nothing needs the engine at fire time.
//
// This is what keeps the privacy posture intact: no push service, no FCM
// token, no server round-trip, nothing about a birth chart leaving the device
// for a feature whose whole content is derived from one. It is also what keeps
// the parity lock honest — porting the draw into Kotlin for the widget would
// make Android a THIRD engine under a lock that currently has two, and the one
// thing this repo has learned the hard way is that an unwitnessed engine
// drifts.
import { buildLocalReading, type ChartResponse } from "@astra/core";

/** One day's draw, flattened to the fields a notification or a widget can
 *  render. Deliberately primitive — this crosses into SharedPreferences and
 *  a notification payload, neither of which can hold a card object. */
export interface DailyDraw {
  date: string; // local calendar date, YYYY-MM-DD — the seed ingredient
  cardId: string;
  cardName: string;
  reversed: boolean;
  /** The card as a person would say it: "The Tower, reversed". */
  title: string;
  /** One line, short enough for a notification body and a widget's second row. */
  line: string;
  /** The natal body this card is linked to, when it has one. */
  natalLink: string | null;
}

/** The question a daily draw is cast against. Empty on purpose: the daily card
 *  answers no question, and `defaultSeed` lowercases and trims whatever it is
 *  given, so anything else here would silently become part of the seed and
 *  change every card. */
const DAILY_QUESTION = "";

/** Local calendar date as YYYY-MM-DD.
 *
 *  LOCAL, not UTC, and that distinction is the whole feature: `defaultSeed`
 *  uses the querent's local day, so a UTC date would hand someone east of
 *  Greenwich tomorrow's card at 8am — or worse, a different card in the
 *  notification than in the app, from the same "today". */
export function localDateKey(d: Date = new Date()): string {
  return (
    `${d.getFullYear()}-` +
    `${String(d.getMonth() + 1).padStart(2, "0")}-` +
    `${String(d.getDate()).padStart(2, "0")}`
  );
}

/** `n` days after `from`, as a local date key.
 *
 *  Steps through the Date constructor rather than adding 86_400_000 ms: across
 *  a DST boundary a day is 23 or 25 hours, and millisecond arithmetic silently
 *  lands on the wrong calendar day exactly once or twice a year — which would
 *  show up as a duplicated or skipped card, in one timezone, twice a year.
 */
export function addLocalDays(from: Date, n: number): Date {
  // Date normalises an out-of-range day-of-month into the next month(s), so
  // `getDate() + n` is safe across month and year ends.
  //
  // Anchored at NOON, not midnight. Some zones move their clocks AT midnight
  // (Brazil did for years), so local midnight is a time that does not exist on
  // those dates and the runtime slides it to 01:00 — of whichever day it
  // decides. Noon is twelve hours from either edge, so no transition of any
  // size can push it onto a neighbouring date. Only the date component is ever
  // read from the result.
  return new Date(from.getFullYear(), from.getMonth(), from.getDate() + n, 12);
}

/** Trim a meaning down to something that fits a notification line without
 *  ending mid-clause. Prefers the first sentence; falls back to a word-boundary
 *  cut so a long first sentence never gets chopped through a word. */
function toLine(meaning: string, limit = 120): string {
  // Strip markdown emphasis FIRST. `offlineMeaning` writes **bold** card names,
  // which the in-app panel renders as literal asterisks and a notification
  // body renders as literal asterisks with no possibility of ever doing
  // otherwise — Android notifications are plain text. Caught by looking at the
  // rendered panel; no DOM assertion would have flagged it, because the
  // markup was correct and only the glyphs were wrong.
  // Order matters: **bold** before *emphasis*, or the inner pass eats one
  // asterisk of each pair and leaves the other stranded.
  const plain = meaning
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/(^|\W)_(.+?)_(\W|$)/g, "$1$2$3")
    .replace(/`(.+?)`/g, "$1");
  const flat = plain.replace(/\s+/g, " ").trim();
  if (!flat) return "";
  const firstSentence = flat.match(/^[^.!?]*[.!?]/)?.[0]?.trim();
  const candidate = firstSentence && firstSentence.length <= limit ? firstSentence : flat;
  if (candidate.length <= limit) return candidate;
  const cut = candidate.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** The draw for one local date. Pure: same chart + same date, same card,
 *  forever — which is what lets a notification scheduled a month ago agree
 *  with the app the reader opens when it fires. */
export function dailyDrawFor(chart: ChartResponse, date: string): DailyDraw {
  const reading = buildLocalReading(chart, "daily", DAILY_QUESTION, { date });
  const drawn = reading.cards[0];
  const title = drawn.reversed ? `${drawn.card.name}, reversed` : drawn.card.name;
  return {
    date,
    cardId: drawn.card.id,
    cardName: drawn.card.name,
    reversed: drawn.reversed,
    title,
    line: toLine(drawn.meaning ?? ""),
    natalLink: drawn.natal_link ?? null,
  };
}

/** `days` consecutive draws starting at `from` (default: today).
 *
 *  The run length is the trade the whole design rests on. Android caps how many
 *  local notifications an app may have pending, and every scheduled day is one
 *  slot; too few and a reader who does not open the app goes quiet, too many
 *  and we crowd the cap. 60 is about two months of silence tolerance at one
 *  slot a day, and is re-topped-up on every launch, so in practice the app
 *  only ever falls behind if it is not opened for two months — at which point
 *  a daily card is not what has gone wrong. */
export function precomputeDailyDraws(
  chart: ChartResponse,
  days = 60,
  from: Date = new Date()
): DailyDraw[] {
  const out: DailyDraw[] = [];
  for (let i = 0; i < days; i++) {
    out.push(dailyDrawFor(chart, localDateKey(addLocalDays(from, i))));
  }
  return out;
}
