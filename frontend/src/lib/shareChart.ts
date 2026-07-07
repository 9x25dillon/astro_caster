// shareChart.ts — encode a birth chart into a shareable link and back.
//
// Astra is privacy-absolute: birth data never touches a server. So "sharing a
// chart" means handing someone a self-contained URL whose query string carries
// the (base64url-encoded) BirthInput — no lookup, no account. The PWA registers
// a `share_target` (manifest) so a shared link/text lands back in the app, and
// readSharedBirth() below decodes it on load.
import type { BirthInput } from "../types";

export const CHART_PARAM = "chart";

// base64url so the token is URL-safe and copy-paste clean (no +/=).
function b64urlEncode(s: string): string {
  const b64 = btoa(unescape(encodeURIComponent(s))); // UTF-8 safe
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(token: string): string {
  const b64 = token.replace(/-/g, "+").replace(/_/g, "/");
  return decodeURIComponent(escape(atob(b64)));
}

export function encodeBirthShare(birth: BirthInput): string {
  return b64urlEncode(JSON.stringify(birth));
}

/** A full, self-contained link that reconstructs this chart when opened. */
export function birthShareUrl(birth: BirthInput): string {
  return `${location.origin}${location.pathname}?${CHART_PARAM}=${encodeBirthShare(birth)}`;
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

// Only trust an object that carries the numeric fields a cast needs; copy over
// exactly the known BirthInput keys so a crafted link can't inject anything.
function coerceBirth(o: Record<string, unknown>): BirthInput | null {
  const req = ["year", "month", "day", "hour", "minute", "lat", "lng", "tz_offset"];
  if (!req.every((k) => isNum(o[k]))) return null;
  const z = o.zodiac === "sidereal" ? "sidereal" : "tropical";
  return {
    year: o.year as number,
    month: o.month as number,
    day: o.day as number,
    hour: o.hour as number,
    minute: o.minute as number,
    second: isNum(o.second) ? (o.second as number) : 0,
    lat: o.lat as number,
    lng: o.lng as number,
    tz_offset: o.tz_offset as number,
    house_system: typeof o.house_system === "string" ? (o.house_system as string) : "P",
    zodiac: z,
    ayanamsha: isNum(o.ayanamsha) ? (o.ayanamsha as number) : 1,
    label: typeof o.label === "string" ? (o.label as string).slice(0, 80) : undefined,
  };
}

export function decodeBirthShare(token: string): BirthInput | null {
  try {
    const obj = JSON.parse(b64urlDecode(token));
    return obj && typeof obj === "object" ? coerceBirth(obj as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// A shared payload may be the bare token, or a URL / free text containing
// `?chart=<token>` (share_target hands us `url`/`text`, not a clean param).
export function extractChartToken(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const embedded = raw.match(/[?&]chart=([A-Za-z0-9_-]+)/);
  if (embedded) return embedded[1];
  const trimmed = raw.trim();
  if (/^[A-Za-z0-9_-]{24,}$/.test(trimmed)) return trimmed; // looks like a bare token
  return null;
}

/**
 * Share the current chart via the OS share sheet, falling back to clipboard.
 * Returns what actually happened so the caller can show feedback.
 */
export async function shareBirth(birth: BirthInput): Promise<"shared" | "copied" | "failed"> {
  const url = birthShareUrl(birth);
  const label = birth.label?.trim() || "natal chart";
  const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
  if (nav.share) {
    try {
      await nav.share({ title: `Astra — ${label}`, text: "My natal chart in Astra", url });
      return "shared";
    } catch (e) {
      // AbortError = user closed the sheet; don't then silently copy behind them.
      if ((e as Error).name === "AbortError") return "failed";
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}
