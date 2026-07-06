// Browser-safe entry point for @astra/core. Exposes the engines that carry no
// Node-only dependencies — chart casting and the transit forecast — so a
// bundler (Vite) can ship them for on-device compute. The tarot module is
// deliberately excluded: it uses `node:crypto` for its sha256 seed and needs
// an isomorphic hash before it can join this surface (tracked follow-up).

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
