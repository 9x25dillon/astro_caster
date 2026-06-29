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
  applying: boolean;
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

export type SelectionType = "planet" | "house" | "aspect" | "pattern";

export interface Selection {
  type: SelectionType;
  id: string;
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
