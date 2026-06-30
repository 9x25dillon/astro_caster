// api/client.ts — thin typed wrapper over the FastAPI backend.
import type {
  BirthInput,
  ChartResponse,
  Lens,
  Selection,
  TransitResponse,
} from "../types";

const BASE = "/api";

// Session ID — random per browser session, resets on tab close, never persisted.
const _sessionId = Math.random().toString(36).slice(2) + Date.now().toString(36);

/** Fire-and-forget UI event. Silently drops on network failure. */
export function trackEvent(name: string, props?: Record<string, unknown>): void {
  fetch(`${BASE}/telemetry/event`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, props: props ?? null, session_id: _sessionId }),
  }).catch(() => undefined);
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${detail}`);
  }
  return res.json() as Promise<T>;
}

export function generateChart(birth: BirthInput): Promise<ChartResponse> {
  return post<ChartResponse>("/generate-chart", birth);
}

export function fetchTransits(
  natal: BirthInput,
  transitIso: string
): Promise<TransitResponse> {
  return post<TransitResponse>("/transits", {
    natal,
    transit_iso: transitIso,
  });
}

export interface AIResult {
  interpretation: string;
  source: "llm" | "offline";
  model: string;
  provider?: "kgirl" | "ollama" | "openai" | "offline";
  note?: string;
  focal_house?: number;
  // kgirl topological-consensus metadata (present only for the kgirl provider).
  coherence?: number;
  energy?: number;
  decision?: string;
  model_names?: string[];
  rag_hits?: string[];
}

export function aiAsk(
  query: string,
  chart: ChartResponse,
  lens: Lens,
  selection: Selection | null,
  depth: "quick" | "deep" = "quick",
  entitlement?: string | null
): Promise<AIResult> {
  return post<AIResult>("/ai-ask", {
    query,
    chart,
    lens,
    depth,
    entitlement: entitlement ?? null,
    selected_type: selection?.type ?? null,
    selected_id: selection?.id ?? null,
  });
}

export function aiSuggestions(chart: ChartResponse, lens: Lens): Promise<AIResult> {
  return post<AIResult>("/suggestions", { query: "", chart, lens });
}

export interface StreamHandlers {
  onMeta?: (m: { provider: string; model: string }) => void;
  onChunk?: (text: string) => void;
  onDone?: (meta: Partial<AIResult>) => void;
  onError?: (msg: string) => void;
}

function parseSSE(block: string): { event: string; data: unknown } | null {
  let event = "message";
  let dataStr = "";
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataStr += line.slice(5).trim();
  }
  if (!dataStr) return null;
  try {
    return { event, data: JSON.parse(dataStr) };
  } catch {
    return { event, data: dataStr };
  }
}

/** Stream Astra's reflection token-by-token via Server-Sent Events. */
export async function aiAskStream(
  query: string,
  chart: ChartResponse,
  lens: Lens,
  selection: Selection | null,
  depth: "quick" | "deep",
  handlers: StreamHandlers,
  entitlement?: string | null,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(`${BASE}/ai-ask-stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      chart,
      lens,
      depth,
      entitlement: entitlement ?? null,
      selected_type: selection?.type ?? null,
      selected_id: selection?.id ?? null,
    }),
    signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`stream ${res.status}: ${await res.text().catch(() => res.statusText)}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const block = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const ev = parseSSE(block);
      if (!ev) continue;
      if (ev.event === "meta") handlers.onMeta?.(ev.data as { provider: string; model: string });
      else if (ev.event === "chunk") handlers.onChunk?.(ev.data as string);
      else if (ev.event === "done") handlers.onDone?.(ev.data as Partial<AIResult>);
      else if (ev.event === "error") handlers.onError?.(String(ev.data));
    }
  }
}

// --- Health + premium TTS ---------------------------------------------------

export interface Health {
  status: string;
  ephemeris: string;
  ai: { mode: string; configured: boolean; model: string };
  tts: { available: boolean; default_voice_id: string | null; model: string | null };
}

export function getHealth(): Promise<Health> {
  return fetch(`${BASE}/health`).then((r) => r.json());
}

export interface ElevenVoice {
  voice_id: string;
  name: string;
  category: string;
}

export function getTtsVoices(): Promise<{ available: boolean; voices: ElevenVoice[] }> {
  return fetch(`${BASE}/tts/voices`).then((r) => r.json());
}

/** Synthesize speech via ElevenLabs; returns an MP3 blob. Throws if unavailable. */
export async function ttsSynthesize(
  text: string,
  voiceId?: string | null,
  entitlement?: string | null
): Promise<Blob> {
  const res = await fetch(`${BASE}/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice_id: voiceId ?? null, entitlement: entitlement ?? null }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`tts ${res.status}: ${detail}`);
  }
  return res.blob();
}

// --- Treasury + open-paywall entitlements ----------------------------------

export interface TreasuryChain {
  id: string;
  label: string;
  address: string;
  asset: string;
}
export interface FundingPillar {
  name: string;
  pct: number;
  note: string;
}
export interface Treasury {
  label: string;
  configured: boolean;
  chains: TreasuryChain[];
  allocation: FundingPillar[];
  suggested_usd: number[];
  philosophy: string;
}

export function getTreasury(): Promise<Treasury> {
  return fetch(`${BASE}/treasury`).then((r) => r.json());
}

export interface Entitlement {
  token: string;
  tier: string;
  verified: boolean;
  exp: number;
}

export interface EntitlementStatus {
  supporter: boolean;
  tier: string;
  verified: boolean;
  exp: number | null;
  premium_features: string[];
}

export async function verifyDonation(
  txHash: string,
  chain = "evm"
): Promise<{ granted: boolean; note: string; entitlement: Entitlement }> {
  const res = await fetch(`${BASE}/donate/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tx_hash: txHash, chain }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${detail}`);
  }
  return res.json();
}

export function checkEntitlement(token: string): Promise<EntitlementStatus> {
  return fetch(`${BASE}/entitlement?token=${encodeURIComponent(token)}`).then((r) => r.json());
}

// ── Forecast ──────────────────────────────────────────────────────────────────

export interface ForecastEvent {
  date: string;         // ISO date "YYYY-MM-DD"
  jd: number;
  type: "station" | "transit_natal" | "transit_transit";
  planet: string;
  glyph: string;
  aspect: string | null;
  target: string | null;
  target_glyph: string | null;
  orb: number;
  significance: "high" | "medium" | "low";
  direction: "retrograde" | "direct" | null;
  summary: string;
  meaning: string;
  color: string;
  harmony: "harmonious" | "challenging" | "neutral" | null;
}

export interface ForecastResponse {
  events: ForecastEvent[];
  start: string;
  days: number;
  natal_count: number;
}

export function fetchForecast(
  natal: BirthInput,
  days = 90,
  minSig: "high" | "medium" | "low" = "medium",
): Promise<ForecastResponse> {
  return post<ForecastResponse>("/forecast", {
    natal,
    days,
    include_natal: true,
    include_transit_transit: true,
    min_sig: minSig,
  });
}

// ── Astra Arcana — natal tarot (symbolic mirror, never prediction) ──────────────

export type SpreadType =
  | "daily" | "three_card" | "elemental_balance" | "planetary_seven"
  | "twelve_house" | "relationship" | "transit_pressure"
  | "shadow_integration" | "creative_expression";

export interface TarotCard {
  id: string;
  name: string;
  arcana: "major" | "minor";
  number: number | null;
  suit: "wands" | "cups" | "swords" | "pentacles" | null;
  keywords: string[];
  element: string | null;
  astrology: string[];
  upright: string | null;
  reversed_meaning: string | null;
}

export interface ArcanaCardLink {
  body: string;
  sign: string | null;
  house: number | null;
  card: TarotCard;
  note: string;
}

export interface NatalArcanaSignature {
  links: ArcanaCardLink[];
  dominant_element: string;
  dominant_modality: string;
  suit_bias: Record<string, number>;
  major_weights: Record<string, number>;
  themes: string[];
  shadows: string[];
  disclaimer: string;
}

export interface DrawnCard {
  position: string;
  card: TarotCard;
  reversed: boolean;
  natal_link: string | null;
  meaning: string;
  activity: string | null;
  journal_prompt: string | null;
}

export interface TarotReadingResponse {
  spread: SpreadType;
  question: string;
  seed: string;
  signature: NatalArcanaSignature;
  cards: DrawnCard[];
  interpretation: string;
  ai_source: "llm" | "offline" | null;
  lessons: Record<string, string>[];
  activities: Record<string, string>[];
  disclaimer: string;
}

export interface ArcanaDay {
  date: string;
  transit_summary: string;
  natal_link: string | null;
  card: TarotCard;
  reversed: boolean;
  lesson: string;
  shadow: string;
  best_expression: string;
  alignment_action: string;
  journal_prompt: string;
}

export interface ArcanaForecastResponse {
  start: string;
  days: number;
  cards: ArcanaDay[];
  disclaimer: string;
}

export function fetchNatalArcana(chart: ChartResponse): Promise<NatalArcanaSignature> {
  return post<NatalArcanaSignature>("/natal-arcana", chart);
}

export function fetchTarotReading(
  chart: ChartResponse,
  spread: SpreadType,
  question: string,
  opts: { includeAi?: boolean; entitlement?: string | null } = {},
): Promise<TarotReadingResponse> {
  return post<TarotReadingResponse>("/tarot-reading", {
    chart,
    spread,
    question,
    include_activities: true,
    include_lessons: true,
    include_ai: opts.includeAi ?? false,
    entitlement: opts.entitlement ?? null,
  });
}

export function fetchArcanaForecast(
  chart: ChartResponse,
  days = 7,
  entitlement?: string | null,
): Promise<ArcanaForecastResponse> {
  return post<ArcanaForecastResponse>("/arcana-forecast", {
    chart,
    days,
    min_sig: "medium",
    entitlement: entitlement ?? null,
  });
}
