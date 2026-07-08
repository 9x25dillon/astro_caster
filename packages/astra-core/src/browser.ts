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
  defaultSeed,
  SPREAD_POSITIONS,
  DISCLAIMER,
  pyRound,
  type NatalArcanaSignature,
  type DrawnCard,
  type TarotCard,
  type LocalReading,
  type ReadingDrawnCard,
} from "./tarot.js";
