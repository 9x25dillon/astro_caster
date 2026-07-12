// types.ts — mirrors backend/models.py. Keep in sync.

export interface PlanetData {
  id: string;
  glyph: string;
  longitude: number;
  latitude: number;
  declination: number;
  speed: number;
  sign: string;
  sign_glyph: string;
  degree: number;
  minute: number;
  second: number;
  house: number;
  retrograde: boolean;
  dignity: string;
  element: string;
  modality: string;
}

export interface HouseCusp {
  index: number;
  longitude: number;
  sign: string;
  degree: number;
  minute: number;
}

export interface Aspect {
  p1: string;
  p2: string;
  type: string;
  angle: number;
  orb: number;
  separation: number;
  harmony: "harmonious" | "challenging" | "neutral";
  color: string;
  // true = tightening, false = separating, null = undefined (both points
  // static — angles / Part of Fortune have no motion of their own).
  applying: boolean | null;
}

export interface Pattern {
  type: string;
  planets: string[];
  description: string;
  extra: Record<string, string>;
}

export interface Angles {
  ascendant: number;
  midheaven: number;
  descendant: number;
  imum_coeli: number;
  vertex?: number | null;
}

export interface ChartResponse {
  planets: PlanetData[];
  houses: HouseCusp[];
  angles: Angles;
  aspects: Aspect[];
  patterns: Pattern[];
  elements: Record<string, number>;
  modalities: Record<string, number>;
  meta: Record<string, string>;
}

export interface TransitResponse {
  transiting: PlanetData[];
  aspects_to_natal: Aspect[];
  transit_iso: string;
}

export interface BirthInput {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  lat: number;
  lng: number;
  tz_offset: number;
  house_system: string;
  zodiac: "tropical" | "sidereal";
  ayanamsha: number;
  label?: string;
}

export type SelectionType = "planet" | "house" | "aspect" | "pattern" | "sign" | "transit_aspect";

export interface Selection {
  type: SelectionType;
  id: string;
}

// Track R (R-2): what a chapter publishes into the margin glass. Plain data
// only — the margin renders every chapter's selection through one generic
// shape (zone 1: title/subtitle/chips · zone 2: body/action + JournalPad).
export interface MarginJournalKey {
  seed: string;
  position?: string | null;
  prompt?: string | null;
  cardName?: string | null;
  question?: string | null;
}

export interface MarginNote {
  title: string;
  subtitle?: string;
  chips?: string[];
  body?: string[];      // prose paragraphs
  action?: string;      // a practice / alignment line, rendered with ✦
  journal?: MarginJournalKey; // keys the margin's JournalPad to the selection
}

export type Lens =
  | "natal"
  | "psychological"
  | "evolutionary"
  | "transit"
  | "relationship"
  | "traditional";

export interface LayerState {
  zodiac: boolean;
  houses: boolean;
  planets: boolean;
  aspects: boolean;
  transits: boolean;
  minorAspects: boolean;
}
