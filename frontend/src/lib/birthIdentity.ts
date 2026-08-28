// birthIdentity.ts — which birth fields actually determine a chart.
//
// This list existed in three places before this file (the store, replay, and
// soundtrackStore). It is the answer to "are these two readings about the same
// sky?", and the answer has to be identical everywhere or two surfaces will
// disagree about whether a stored artifact belongs to the chart on screen.
//
// `label` is excluded on purpose: renaming a chart must not make it a
// different chart. That rule is load-bearing for the soundtrack, where a
// re-identified chart re-deals the whole field.
//
// NOT migrated here, deliberately: `soundtrackStore.ts` keeps its own copy.
// Its list is part of a persisted seed's identity, so a future edit to the
// shared list must not be able to silently re-deal somebody's stored
// soundtrack. That decoupling is a feature; see [[seed-is-the-session]].
import type { BirthInput } from "../types";

/** The birth fields that determine the chart, in a fixed order. */
export const BIRTH_FIELDS: (keyof BirthInput)[] = [
  "year", "month", "day", "hour", "minute", "second",
  "lat", "lng", "tz_offset", "house_system", "zodiac", "ayanamsha",
];

/** Do these two births describe the same sky? Null-safe: two absent births
 *  are NOT the same chart, because neither is a chart. */
export function sameBirth(
  a: BirthInput | null | undefined,
  b: BirthInput | null | undefined,
): boolean {
  if (!a || !b) return false;
  return BIRTH_FIELDS.every((k) => a[k] === b[k]);
}

/** A stable string identity for a birth — for map keys and scope comparisons. */
export function birthKey(birth: BirthInput | null | undefined): string {
  if (!birth) return "";
  return BIRTH_FIELDS.map((f) => String(birth[f] ?? "")).join(",");
}
