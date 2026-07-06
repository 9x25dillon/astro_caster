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
  eclipticLonSpeed,
  julianDay,
  julianDayUtc,
} from "./ephemeris.js";
export { generateForecast, type ForecastEvent } from "./forecast.js";
export { MT19937 } from "./mt19937.js";
export { sha256Hex } from "./sha256.js";
export {
  buildNatalArcanaSignature,
  weightedDraw,
  SPREAD_POSITIONS,
  pyRound,
  type NatalArcanaSignature,
  type DrawnCard,
} from "./tarot.js";
