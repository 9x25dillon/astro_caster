// gazetteer.ts — offline city search (GAZ-2).
//
// Replaces the Nominatim geocoding call. Everything here resolves against a
// same-origin JSON artifact, so a birthplace query never leaves the device —
// which is the whole point: the typed place name IS the sensitive datum.
//
// The artifact is written by backend/tools/gen_gazetteer.py. Its rows are
// pre-sorted by population descending, so ROW ORDER IS THE RANKING and no
// population field is stored. Any change to that ordering silently changes
// search results, which is why the generator's sort key is total.

export interface City {
  name: string;
  /** ASCII form ("Zurich" for "Zürich"); equals `name` when already ASCII. */
  ascii: string;
  /** ISO 3166-1 alpha-2. */
  country: string;
  /** GeoNames admin1 code — disambiguates same-named cities within a country. */
  admin1: string;
  lat: number;
  lng: number;
  /** IANA zone name, e.g. "Europe/Zurich". */
  tz: string;
}

interface Packed {
  schema: number;
  count: number;
  attribution: string;
  tz: string[];
  cc: string[];
  a1: string[];
  rows: [string, string, number, number, number, number, number][];
}

export interface Gazetteer {
  readonly count: number;
  readonly attribution: string;
  search(query: string, limit?: number): City[];
}

const SCHEMA = 1;

/**
 * Diacritic-fold and lowercase, so "Zurich" matches "Zürich" and "Sao Paulo"
 * matches "São Paulo".
 *
 * NFKD splits a base letter from its combining marks; `\p{M}` then strips the
 * marks. `toLowerCase` (not `toLocaleLowerCase`) keeps this locale-independent
 * — a Turkish locale would otherwise fold "I" to "ı" and break every match
 * containing it, for every user, depending on their device settings.
 */
export function fold(s: string): string {
  return s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
}

// Most rows are already plain ASCII, and `normalize` is the expensive part of
// folding. Skipping it for those turns a ~70k-row index build from sluggish
// into unnoticeable, without changing a single result.
const ASCII_ONLY = /^[\x20-\x7E]*$/;
function foldFast(s: string): string {
  return ASCII_ONLY.test(s) ? s.toLowerCase() : fold(s);
}

function expand(p: Packed, i: number): City {
  const [name, ascii, cc, a1, lat, lng, tz] = p.rows[i];
  return {
    name,
    ascii: ascii || name,
    country: p.cc[cc],
    admin1: p.a1[a1],
    lat,
    lng,
    tz: p.tz[tz],
  };
}

function build(p: Packed): Gazetteer {
  if (p.schema !== SCHEMA) {
    throw new Error(`gazetteer schema ${p.schema}, expected ${SCHEMA}`);
  }

  // Folded once at load, then reused by every keystroke.
  const folded = new Array<string>(p.rows.length);
  // A second key only where asciiname genuinely differs, so "Zurich" hits even
  // if a name's folded form somehow diverges from its published ASCII spelling.
  const alt = new Array<string | null>(p.rows.length);
  for (let i = 0; i < p.rows.length; i++) {
    const [name, ascii] = p.rows[i];
    folded[i] = foldFast(name);
    const a = ascii ? foldFast(ascii) : "";
    alt[i] = a && a !== folded[i] ? a : null;
  }

  return {
    count: p.count,
    attribution: p.attribution,

    search(query, limit = 8) {
      const q = fold(query.trim());
      if (!q) return [];

      // Three tiers, best first. Rows are population-ordered, so appending in
      // scan order keeps each tier ranked without any sorting — and makes the
      // result a pure function of (query, artifact).
      const exact: number[] = [];
      const prefix: number[] = [];
      const contains: number[] = [];

      for (let i = 0; i < folded.length; i++) {
        const f = folded[i];
        const a = alt[i];
        if (f === q || a === q) {
          if (exact.length < limit) exact.push(i);
        } else if (f.startsWith(q) || (a !== null && a.startsWith(q))) {
          if (prefix.length < limit) prefix.push(i);
        } else if (f.includes(q) || (a !== null && a.includes(q))) {
          if (contains.length < limit) contains.push(i);
        }
        // Exact + prefix already fill the page; anything further can only rank
        // below what we hold, so the remaining rows cannot change the answer.
        if (exact.length >= limit) break;
      }

      const picked: number[] = [];
      for (const bucket of [exact, prefix, contains]) {
        for (const i of bucket) {
          if (picked.length >= limit) break;
          if (!picked.includes(i)) picked.push(i);
        }
      }
      return picked.map((i) => expand(p, i));
    },
  };
}

let pending: Promise<Gazetteer> | null = null;

/**
 * Load the gazetteer once per session. Same-origin by construction — the URL is
 * a root-relative path, so it is served by our own origin in dev (Vite) and in
 * production, and is precached by the service worker for offline use.
 */
export function loadGazetteer(): Promise<Gazetteer> {
  if (!pending) {
    pending = fetch("/gazetteer/cities.json")
      .then((r) => {
        if (!r.ok) throw new Error(`gazetteer ${r.status}`);
        return r.json() as Promise<Packed>;
      })
      .then(build)
      .catch((e) => {
        pending = null; // let a later attempt retry rather than cache the failure
        throw e;
      });
  }
  return pending;
}

/** Test seam: build a gazetteer from an in-memory artifact. */
export function gazetteerFrom(packed: Packed): Gazetteer {
  return build(packed);
}
