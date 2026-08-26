// soundtrackStore.ts — the personal tonal field, persisted.
//
// THE SEED IS IDENTITY, NOT A CACHE KEY. This module exists to enforce that
// single sentence, which the resonarium engine states at length and which
// nothing in the app had yet obeyed:
//
//   Derive the spec ONCE per profile and keep it. Re-deriving it after an
//   ephemeris or engine change can move a longitude's sixth decimal and
//   re-deal the entire field — the same person, a different soundtrack. A
//   measured 28.8% of bodies moved across one ephemeris change. So the stored
//   spec is the field; derivation is how it was born, not how it is looked up.
//
// Hand_off is explicit that the WHOLE spec is persisted, not just seed_hex,
// because bedrock_hz re-derived on a different substrate can move in its last
// bits (110·2^x goes through libm pow, and transcendentals are not bit-
// identical across platforms — the parity suite's own stated boundary).
//
// One thing stored beyond the spec: the seed chart's KEY LIST. bedrock_hz is
// compacted, not padded, so which bodies were present at derivation time is
// what makes an index in it mean a planet. Recomputing that list from a later
// chart could pair a persisted bedrock_hz with a different presence set and
// silently sound the wrong body. See lib/resonance.natalDroneIndex.
//
// Privacy: the seed is a one-way digest and cannot be inverted to natal data,
// but bedrock_hz encodes by construction the longitudes it was mapped from, so
// this record is treated with the same care as the chart — device-local only,
// never sent anywhere, alongside the existing aae.last_chart.
import {
  personalSoundtrack,
  seedChartFromResponse,
  type ChartResponse,
  type SoundtrackSpec,
} from "@astra/core";
import type { BirthInput } from "../types";

const SOUNDTRACK_KEY = "aae.soundtrack";

/** The birth fields that determine a chart. `label` is excluded — renaming a
 *  chart must not re-deal its field. Mirrors BIRTH_FIELDS in the store. */
const IDENTITY_FIELDS: (keyof BirthInput)[] = [
  "year", "month", "day", "hour", "minute", "second",
  "lat", "lng", "tz_offset", "house_system", "zodiac", "ayanamsha",
];

export interface StoredSoundtrack {
  /** Which profile this field belongs to. */
  identity: string;
  spec: SoundtrackSpec;
  /** Seed-chart keys present when bedrock_hz was emitted, in no particular
   *  order — membership is what matters. */
  seed_keys: string[];
}

function identityOf(birth: BirthInput): string {
  return IDENTITY_FIELDS.map((k) => String(birth[k])).join("|");
}

function read(): StoredSoundtrack | null {
  try {
    const raw = localStorage.getItem(SOUNDTRACK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSoundtrack;
    // A record written by an older schema is not this field; let it be reborn.
    if (
      !parsed?.spec?.seed_hex ||
      !Array.isArray(parsed.spec.bedrock_hz) ||
      !Array.isArray(parsed.seed_keys) ||
      typeof parsed.identity !== "string"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null; // private mode, quota, or corrupt JSON — derive fresh
  }
}

/**
 * The profile's tonal field: the stored one if this is the same profile,
 * otherwise derived once and stored.
 *
 * `intention` participates in the seed. Today the app has no persisted
 * intention — SoulProfileModal holds one in local component state and passes
 * it nowhere — so this is called with "" and the field is the chart's alone.
 * When an intention is eventually wired through, note that changing it is
 * MEANT to re-deal the field: it is part of the identity, not a modifier of it.
 */
export function getSoundtrack(
  birth: BirthInput,
  chart: ChartResponse,
  intention = ""
): StoredSoundtrack {
  const identity = identityOf(birth);
  const stored = read();
  if (stored && stored.identity === identity) return stored;

  const spec = personalSoundtrack(chart, intention);
  const record: StoredSoundtrack = {
    identity,
    spec,
    seed_keys: Object.keys(seedChartFromResponse(chart)),
  };
  try {
    localStorage.setItem(SOUNDTRACK_KEY, JSON.stringify(record));
  } catch {
    /* storage full or sandboxed — the field still sounds, it just won't
       survive the reload, and will be re-derived from the same chart. */
  }
  return record;
}
