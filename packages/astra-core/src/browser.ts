// Browser-safe entry point for @astra/core. Exposes the engines that carry no
// Node-only dependencies — chart, forecast, and tarot (now that its seed uses
// the pure-TS sha256) — so a bundler (Vite) can ship them for on-device
// compute.

export * from "./types.js";
export {
  SIGNS,
  SIGN_GLYPHS,
  ELEMENTS,
  MODALITIES,
  ASPECT_DEFS,
  dignityFor,
  norm360,
  angularSeparation,
  signFor,
  degreeInSign,
} from "./astrology.js";
export { detectPatterns } from "./patterns.js";
export { ascendant, midheaven, placidusCusps, houseOf } from "./houses.js";
export {
  calculateChart,
  calculateAspects,
  aspectsBetween,
  eclipticLonSpeed,
  julianDay,
  julianDayUtc,
} from "./ephemeris.js";
export { initSwisseph, swissReady } from "./swisseph.js";
export {
  computeSynastry,
  synastryAspects,
  synastryGrid,
  compositeMidpoints,
  compositeHouseCusps,
  derivedCompositeHouses,
  davisonChart,
  geographicMidpoint,
  circularMidpoint,
  synastryTarot,
  type SynastryResult,
  type SynastryGrid,
  type CompositeChart,
  type DavisonChart,
  type SynastryTarotSpread,
} from "./synastry.js";
export {
  progressedChart,
  solarReturn,
  solarReturnJd,
  eclipseTimeline,
  type ProgressedChart,
  type SolarReturnChart,
  type EclipseTimeline,
  type EclipseEvent,
  type EclipseContact,
} from "./predictive.js";
export {
  harmonicChart,
  midpointTree,
  fixedStarHits,
  type HarmonicChart,
  type HarmonicPosition,
  type MidpointTreeEntry,
  type MidpointContact,
  type FixedStarHit,
} from "./advanced.js";
export { generateForecast, type ForecastEvent } from "./forecast.js";
export { MT19937 } from "./mt19937.js";
export { sha256Hex } from "./sha256.js";
export {
  buildNatalArcanaSignature,
  buildLocalSignature,
  weightedDraw,
  buildLocalReading,
  cardById,
  FULL_DECK_IDS,
  defaultSeed,
  SPREAD_POSITIONS,
  DISCLAIMER,
  pyRound,
  type NatalArcanaSignature,
  type DrawnCard,
  type TarotCard,
  type LocalReading,
  dailyArcanaFromEvents,
  arcanaForEvent,
  type ArcanaDay,
  type OverlayEvent,
  type ReadingDrawnCard,
} from "./tarot.js";

// TZ-2 — historical wall-clock → UTC offset resolution for the birth-time
// input. Resolves an INPUT only; `tz_offset` stays numeric on the wire, so the
// deterministic engine and the Python↔TS parity contract are untouched.
export {
  resolveOffset,
  zoneOffsetMsAt,
  firstTransition,
  // TZ-3: the sanity check on a hand-entered offset. Advisory only — the manual
  // field is an escape hatch for cases a zone database cannot decide, so this
  // warns and never blocks.
  checkOffsetAgainstLongitude,
  OFFSET_SOLAR_TOLERANCE_H,
  type OffsetCheck,
  type OffsetCheckLevel,
  type WallClock,
  type Ambiguity,
  type OffsetResolution,
} from "./timezone.js";

// The resonarium — the personal tonal field. Browser-safe by construction: it
// imports only sha256.js (pure TS, exported above) and types.js, touches no
// Node API, and does no I/O.
//
// It was absent from this entry point until session 37, which is the real
// reason nothing in the app called it: the frontend's `@astra/core` alias
// resolves HERE, not to index.ts, so `personalSoundtrack` was not merely
// tree-shaken out of the bundle — it was never importable in the first place.
//
// The engine itself is untouched and stays parity-locked against
// resonarium/natal_seed.py by parity/resonarium-seed.json; re-exporting it
// moves no vector.
export {
  personalSoundtrack,
  seedChartFromResponse,
  deriveNatalSeed,
  canonicalizeChart,
  sanitizeIntention,
  seedToHex,
  seedLower32,
  mulberry32,
  bedrockFrequencies,
  binauralConfig,
  clampFrequency,
  ChartValidationError,
  RESONARIUM_SCHEMA_VERSION,
  type SoundtrackSpec,
  type SoundtrackSource,
  type SeedChart,
  type BinauralConfig,
} from "./resonarium.js";
