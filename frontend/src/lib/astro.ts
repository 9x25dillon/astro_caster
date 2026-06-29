// lib/astro.ts — shared geometry + display helpers for the wheel.
import type { PlanetData } from "../types";

// Bodies that are angles/derived points; rendered differently or excluded.
export const POINT_IDS = new Set([
  "Ascendant",
  "Midheaven",
  "Descendant",
  "Imum Coeli",
  "Part of Fortune",
  "North Node",
  "South Node",
  "Lilith",
]);

export const SIGN_GLYPHS = [
  "♈", "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐", "♑", "♒", "♓",
];

/**
 * Astrological Unicode symbols (♈–♓, ♀, ♂, ☿…) are frequently promoted to
 * colourful emoji by the OS emoji font. Appending the U+FE0E "text
 * presentation selector" forces a flat, monochrome glyph so they match the
 * antique-gold aesthetic instead of appearing as red/blue emoji discs.
 */
export const glyphText = (g: string): string => g + "︎";

export const SIGN_NAMES = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
];

// Element colour key, used by the zodiac ring tinting + radar.
export const ELEMENT_COLORS: Record<string, string> = {
  Fire: "#b0432e",
  Earth: "#6b8e23",
  Air: "#c9a84c",
  Water: "#2e6e8e",
};

export const ELEMENT_OF_SIGN_INDEX = (i: number): string =>
  ["Fire", "Earth", "Air", "Water"][i % 4];

/**
 * The chart is drawn with the Ascendant pinned to the 9-o'clock (left) position
 * and longitude increasing counter-clockwise, the astrological convention.
 *
 * Given an absolute ecliptic longitude and the ascendant longitude, return the
 * on-screen polar angle in radians for the standard SVG coordinate system
 * (x = r·cos θ, y = r·sin θ, y growing downward).
 */
export function lonToAngle(longitude: number, ascendant: number): number {
  // Degrees of the body measured counter-clockwise from the Ascendant.
  const rel = ((longitude - ascendant) % 360 + 360) % 360;
  // Ascendant sits at 180° on screen (left). Counter-clockwise => subtract.
  const screenDeg = 180 - rel;
  return (screenDeg * Math.PI) / 180;
}

export function polar(r: number, angleRad: number): [number, number] {
  return [r * Math.cos(angleRad), r * Math.sin(angleRad)];
}

export function formatPos(p: PlanetData): string {
  return `${p.degree}°${String(p.minute).padStart(2, "0")}' ${p.sign}`;
}

export const ORDINAL = (n: number): string => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

// Resolve a separation of two points to a midpoint longitude (shorter arc).
export function midpointLon(a: number, b: number): number {
  let diff = ((b - a) % 360 + 360) % 360;
  if (diff > 180) diff -= 360;
  return ((a + diff / 2) % 360 + 360) % 360;
}
