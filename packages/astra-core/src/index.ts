// @astra/core — the deterministic engines, in TypeScript, drift-locked to the
// Python backend through the committed golden vectors in /parity
// (MOBILE_ROADMAP §3). v0.1 ships the chart module.

export * from "./types.js";
export * from "./astrology.js";
export { detectPatterns } from "./patterns.js";
export { ascendant, midheaven, placidusCusps, houseOf } from "./houses.js";
export {
  calculateChart,
  calculateAspects,
  julianDay,
  julianDayUtc,
} from "./ephemeris.js";
export { eclipticLonSpeed } from "./ephemeris.js";
export { initSwisseph, swissReady } from "./swisseph.js";
export { generateForecast, type ForecastEvent } from "./forecast.js";
export { MT19937 } from "./mt19937.js";
export { sha256Hex } from "./sha256.js";
export {
  buildNatalArcanaSignature,
  weightedDraw,
  buildLocalSignature,
  SPREAD_POSITIONS,
  pyRound,
  PLANET_MAJOR,
  MAJOR_IDS,
  type NatalArcanaSignature,
  dailyArcanaFromEvents,
  arcanaForEvent,
  type ArcanaDay,
  type OverlayEvent,
  type DrawnCard,
} from "./tarot.js";
export { aspectsBetween } from "./ephemeris.js";
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
