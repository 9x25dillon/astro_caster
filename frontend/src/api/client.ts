// api/client.ts — thin typed wrapper over the FastAPI backend.
import {
  calculateChart as coreCalculateChart,
  buildLocalReading,
  generateForecast as coreGenerateForecast,
  type ChartRequest as CoreChartRequest,
  type ChartResponse as CoreChartResponse,
} from "@astra/core";
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

/** API error carrying the HTTP status so callers can branch on it (e.g. 402 →
 *  support flow) without string-parsing. Message format is unchanged from the
 *  previous plain Error, so existing `String(e)` displays are unaffected. */
export class ApiError extends Error {
  constructor(public status: number, detail: string) {
    super(`${status}: ${detail}`);
    this.name = "ApiError";
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

export function generateChart(birth: BirthInput): Promise<ChartResponse> {
  return post<ChartResponse>("/generate-chart", birth);
}

/**
 * On-device chart cast via @astra/core (MOBILE_ROADMAP §3/H1). Used as the
 * last-resort fallback when the backend is unreachable and there's no cached
 * chart for this birth data. Reduced body set vs the server (no lunar Node /
 * Chiron / Lilith — the TS ephemeris lacks them), so the UI flags it.
 */
export function localChart(birth: BirthInput): ChartResponse {
  // @astra/core mirrors models.py; BirthInput is a structural superset of
  // ChartRequest (the extra `label` is ignored by the engine).
  return coreCalculateChart(birth as unknown as CoreChartRequest) as unknown as ChartResponse;
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

// Display maps for the on-device forecast (the backend carries these server-side;
// offline we add them to the structural events @astra/core produces).
const FC_GLYPHS: Record<string, string> = {
  Sun: "☉", Moon: "☽", Mercury: "☿", Venus: "♀", Mars: "♂", Jupiter: "♃",
  Saturn: "♄", Uranus: "♅", Neptune: "♆", Pluto: "♇", Ascendant: "Asc", Midheaven: "MC",
};
const FC_ASPECT_COLOR: Record<string, string> = {
  Conjunction: "#c9a84c", Opposition: "#b03a2e", Square: "#b03a2e",
  Trine: "#2e86c1", Sextile: "#48a999",
};

/**
 * On-device transit forecast via @astra/core (MOBILE_ROADMAP §3/H1). Computes
 * the natal chart locally, then scans transits in the browser — the same events
 * the backend's offline scan gives (Sun–Pluto transits; no Chiron/Node). Used
 * as the fallback when the backend is unreachable.
 */
export function localForecast(
  natal: BirthInput,
  days = 90,
  minSig: "high" | "medium" | "low" = "medium",
): ForecastResponse {
  const chart = coreCalculateChart(natal as unknown as CoreChartRequest);
  const targets = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter",
    "Saturn", "Uranus", "Neptune", "Pluto", "Ascendant", "Midheaven"];
  const natalMap: Record<string, number> = {};
  for (const p of chart.planets) if (targets.includes(p.id)) natalMap[p.id] = p.longitude;

  const start = localToday();
  const core = coreGenerateForecast(natalMap, start, days, minSig);
  const events: ForecastEvent[] = core.map((e) => {
    const color = e.type === "station"
      ? (e.direction === "retrograde" ? "#b87333" : "#c9a84c")
      : FC_ASPECT_COLOR[e.aspect ?? ""] ?? "#9a8f78";
    const meaning = e.type === "station"
      ? `${e.planet} turns ${e.direction} — a review phase for what it governs.`
      : e.summary + (e.harmony === "harmonious"
          ? " A supportive current." : e.harmony === "challenging"
          ? " Tension asking for adaptation." : " A significant meeting of currents.");
    return {
      date: e.date, jd: 0, type: e.type, planet: e.planet,
      glyph: FC_GLYPHS[e.planet] ?? e.planet,
      aspect: e.aspect, target: e.target,
      target_glyph: e.target ? (FC_GLYPHS[e.target] ?? e.target) : null,
      orb: e.orb, significance: e.significance as ForecastEvent["significance"],
      direction: e.direction as ForecastEvent["direction"],
      summary: e.summary, meaning,
      color, harmony: e.harmony as ForecastEvent["harmony"],
    };
  });
  return { events, start, days, natal_count: Object.keys(natalMap).length };
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

export type SourceSystem = "golden_dawn" | "rws" | "thoth" | "jungian";

export const SOURCE_LABELS: Record<SourceSystem, string> = {
  golden_dawn: "Golden Dawn / Hermetic",
  rws: "Rider-Waite-Smith",
  thoth: "Thoth (Crowley-Harris)",
  jungian: "Psychological / Jungian",
};

export interface WeightSource {
  label: string;
  weight: number;
}

export interface DrawnCard {
  position: string;
  card: TarotCard;
  reversed: boolean;
  natal_link: string | null;
  meaning: string;
  activity: string | null;
  journal_prompt: string | null;
  weight_sources: WeightSource[];
}

export interface TarotReadingResponse {
  spread: SpreadType;
  source: SourceSystem;
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

// Local calendar date "YYYY-MM-DD" in the browser's own timezone.
export function localToday(): string {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function browserTz(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

export function fetchTarotReading(
  chart: ChartResponse,
  spread: SpreadType,
  question: string,
  opts: {
    includeAi?: boolean;
    entitlement?: string | null;
    source?: SourceSystem;
    date?: string;
  } = {},
): Promise<TarotReadingResponse> {
  return post<TarotReadingResponse>("/tarot-reading", {
    chart,
    spread,
    // The querent's local day is the unit of meaning: default a daily draw to the
    // browser's local date so it doesn't depend on the server clock (Phase 1.4).
    date: opts.date ?? (spread === "daily" ? localToday() : null),
    source: opts.source ?? "golden_dawn",
    question,
    include_activities: true,
    include_lessons: true,
    include_ai: opts.includeAi ?? false,
    entitlement: opts.entitlement ?? null,
  });
}

/**
 * On-device tarot reading via @astra/core (MOBILE_ROADMAP §3/H1). The seed and
 * dealt cards reproduce the backend's OFFLINE reading exactly for the same
 * chart; AI enrichment and lesson/activity generators are backend-only, so
 * those fields come back empty. Used as the fallback when the backend is down.
 */
export function localTarotReading(
  chart: ChartResponse,
  spread: SpreadType,
  question: string,
  opts: { source?: SourceSystem; date?: string } = {},
): TarotReadingResponse {
  const r = buildLocalReading(chart as unknown as CoreChartResponse, spread, question, {
    date: opts.date ?? (spread === "daily" ? localToday() : null),
    source: opts.source ?? "golden_dawn",
  });
  return r as unknown as TarotReadingResponse;
}

export interface LearningStep {
  order: number;
  stage: string;
  card: TarotCard;
  focus: string;
  practice: string;
  journal: string;
}

export interface LearningPathResponse {
  source: SourceSystem;
  anchor: string;
  growth_edge: string;
  lineage: string;
  steps: LearningStep[];
  disclaimer: string;
}

export function fetchLearningPath(
  chart: ChartResponse,
  opts: { source?: SourceSystem; steps?: number; entitlement?: string | null } = {},
): Promise<LearningPathResponse> {
  return post<LearningPathResponse>("/learning-path", {
    chart,
    source: opts.source ?? "golden_dawn",
    steps: opts.steps ?? 5,
    entitlement: opts.entitlement ?? null,
  });
}

// ── Oracle Report — paid Fable 5 enriched synthesis (oracle tier only) ────────

export interface OracleReportResponse {
  spread: SpreadType;
  source: SourceSystem;
  question: string;
  seed: string;
  lineage: string;
  report: string;
  ai_source: "llm" | "offline";
  model: string | null;
  disclaimer: string;
}

/** The paid enriched reading. The backend answers 402 for anything below
 *  oracle tier — catch it and route the user to the support flow. */
export function fetchOracleReport(
  chart: ChartResponse,
  question: string,
  opts: {
    spread?: SpreadType;
    source?: SourceSystem;
    date?: string;
    entitlement?: string | null;
  } = {},
): Promise<OracleReportResponse> {
  return post<OracleReportResponse>("/oracle-report", {
    chart,
    spread: opts.spread ?? "three_card",
    source: opts.source ?? "golden_dawn",
    question,
    date: opts.date ?? ((opts.spread ?? "three_card") === "daily" ? localToday() : null),
    entitlement: opts.entitlement ?? null,
  });
}

// ── Personal Report — deluxe compiled edition (optional post-Oracle product) ──

export interface PersonalReportResponse {
  seed: string;
  short_seed: string;   // display digest — the raw seed's tail is the question
  oracle_date: string;
  spread: SpreadType;
  source: SourceSystem;
  lineage: string;
  report_markdown: string;
  ai_source: "llm" | "offline";
  model: string | null;
  disclaimer: string;
}

/** PDF-2 — the deluxe edition's separate purchase rail. Verifies a treasury
 *  contribution tx and mints a report token bound to ONE Oracle session seed.
 *  402 below oracle tier or when the payment doesn't verify / meet the price. */
export interface ReportPurchaseResponse {
  granted: boolean;
  product: string;
  note: string;
  report_token: {
    token: string;
    seed: string;
    verified: boolean;
    exp: number;
  };
}

export function purchasePersonalReport(
  txHash: string,
  seed: string,
  opts: { chain?: string; entitlement?: string | null } = {},
): Promise<ReportPurchaseResponse> {
  return post<ReportPurchaseResponse>("/personal-report/purchase", {
    tx_hash: txHash,
    chain: opts.chain ?? "evm",
    seed,
    entitlement: opts.entitlement ?? null,
  });
}

/** Compile the deluxe edition from a GENUINE prior Oracle session. The server
 *  re-derives the session seed and answers 409 on a mismatch (e.g. the chart
 *  changed since the Oracle ran) and 402 below oracle tier OR without a valid
 *  `reportToken` purchase claim for this session (detail names "purchase" so
 *  callers can branch). `date` must be the exact local date sent on the
 *  triggering Oracle call (null for non-daily). */
export function fetchPersonalReport(
  chart: ChartResponse,
  oracle: OracleReportResponse,
  opts: {
    date?: string | null;
    generatedAt?: string;
    displayName?: string;
    sigilNotes?: string;
    predictiveSummary?: string;
    reflectionSummary?: string;   // Astra's Detail-panel reading
    soulProfile?: string;         // Soul Profile module text
    lifePath?: string;            // Life Path numerology text
    entitlement?: string | null;
    reportToken?: string | null;
  } = {},
): Promise<PersonalReportResponse> {
  return post<PersonalReportResponse>("/personal-report", {
    chart,
    oracle: {
      seed: oracle.seed,
      spread: oracle.spread,
      source: oracle.source,
      question: oracle.question,
      date: opts.date ?? null,
      report: oracle.report,
      generated_at: opts.generatedAt ?? localToday(),
      ai_source: oracle.ai_source,
      model: oracle.model,
    },
    display_name: opts.displayName ?? null,
    sigil_notes: opts.sigilNotes ?? null,
    predictive_summary: opts.predictiveSummary ?? null,
    reflection_summary: opts.reflectionSummary ?? null,
    soul_profile: opts.soulProfile ?? null,
    life_path: opts.lifePath ?? null,
    entitlement: opts.entitlement ?? null,
    report_token: opts.reportToken ?? null,
  });
}

// ── Deck-Art Prompt Studio (Phase 4) — image PROMPTS only, generated offline ──

export interface DeckArtPrompt {
  card: TarotCard;
  title: string;
  prompt: string;
  negative_prompt: string;
  motifs: string[];
  palette: string;
  natal_context: string | null;
}

export interface DeckArtResponse {
  source: SourceSystem;
  lineage: string;
  prompts: DeckArtPrompt[];
  disclaimer: string;
}

/** Deterministic deck-art prompts: one card, or the whole soul deck when
 *  cardId is omitted. Stable per (chart, card, source). */
export function fetchDeckArt(
  chart: ChartResponse,
  opts: { cardId?: string; source?: SourceSystem; entitlement?: string | null } = {},
): Promise<DeckArtResponse> {
  return post<DeckArtResponse>("/deck-art", {
    chart,
    card_id: opts.cardId ?? null,
    source: opts.source ?? "golden_dawn",
    entitlement: opts.entitlement ?? null,
  });
}

/** Download the arcana forecast as an .ics calendar file (Phase 3.2). */
export async function downloadArcanaCalendar(
  chart: ChartResponse,
  opts: {
    days?: number;
    source?: SourceSystem;
    kind?: "ritual" | "journal";
    entitlement?: string | null;
  } = {},
): Promise<void> {
  const res = await fetch(`${BASE}/arcana-calendar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chart,
      days: opts.days ?? 7,
      min_sig: "medium",
      source: opts.source ?? "golden_dawn",
      kind: opts.kind ?? "ritual",
      timezone: browserTz() ?? null,
      entitlement: opts.entitlement ?? null,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${detail}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `astra-arcana-${localToday()}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function fetchArcanaForecast(
  chart: ChartResponse,
  days = 7,
  entitlement?: string | null,
  opts: { source?: SourceSystem; timezone?: string; startDate?: string } = {},
): Promise<ArcanaForecastResponse> {
  return post<ArcanaForecastResponse>("/arcana-forecast", {
    chart,
    days,
    min_sig: "medium",
    // Resolve "today" in the querent's own timezone (Phase 1.4).
    timezone: opts.timezone ?? browserTz() ?? null,
    start_date: opts.startDate ?? null,
    source: opts.source ?? "golden_dawn",
    entitlement: entitlement ?? null,
  });
}

// ── Relationship astrology (synastry / composite / Davison / tarot) ─────────────

export interface SynPlanet { id: string; longitude: number; sign: string; degree: number; house: number; }
export interface HouseOverlay { planet_id: string; longitude: number; host_house: number; host_owner: string; }
export interface HouseEmphasis { host_owner: string; house: number; count: number; planets: string[]; }
export interface RulerLink { host_owner: string; house: number; cusp_sign: string; ruler: string; lands_in_other_house: number; }
export interface SynAspect { p1: string; p2: string; type: string; orb: number; harmony: string; }

export interface SynastryResponse {
  inter_aspects: SynAspect[];
  grid: { b_in_a: HouseOverlay[]; a_in_b: HouseOverlay[]; emphasis: HouseEmphasis[]; rulers: RulerLink[]; };
  disclaimer: string;
}
export interface CompositeChart {
  planets: SynPlanet[]; houses: { index: number; longitude: number; sign: string; degree: number }[];
  angles: { ascendant: number; midheaven: number } | null;
  aspects: SynAspect[]; patterns: { type: string; planets: string[] }[];
  elements: Record<string, number>; modalities: Record<string, number>;
  disclaimer: string; meta: Record<string, string>;
}
export interface DavisonChart {
  planets: SynPlanet[]; houses: unknown[]; aspects: SynAspect[];
  elements: Record<string, number>; modalities: Record<string, number>;
  disclaimer: string; meta: Record<string, string>;
}
export interface SynastryTarotResponse {
  spread: { shared_themes: string[]; complementary_shadows: string[]; bond_card: string };
  disclaimer: string;
}

type HouseMethod = "midpoint" | "derived";

export function fetchSynastry(a: BirthInput, b: BirthInput): Promise<SynastryResponse> {
  return post<SynastryResponse>("/synastry", { person_a: a, person_b: b });
}
export function fetchComposite(a: BirthInput, b: BirthInput, houseMethod: HouseMethod = "midpoint"): Promise<CompositeChart> {
  return post<CompositeChart>("/composite", { person_a: a, person_b: b, house_method: houseMethod });
}
export function fetchDavison(a: BirthInput, b: BirthInput): Promise<DavisonChart> {
  return post<DavisonChart>("/davison", { person_a: a, person_b: b });
}
export function fetchSynastryTarot(a: BirthInput, b: BirthInput): Promise<SynastryTarotResponse> {
  return post<SynastryTarotResponse>("/synastry-tarot", { person_a: a, person_b: b });
}

// ── Predictive (progressions / solar return / eclipses) ─────────────────────────

export interface ProgressedChart {
  age_years: number; progressed_iso: string; planets: SynPlanet[];
  aspects_to_natal: SynAspect[]; disclaimer: string; meta: Record<string, string>;
}
export interface SolarReturnChart {
  year: number; return_iso: string; planets: SynPlanet[];
  houses: { index: number; sign: string; degree: number }[];
  elements: Record<string, number>; modalities: Record<string, number>; disclaimer: string;
}
export interface EclipseContact { natal_body: string; aspect: string; orb: number; }
export interface EclipseEvent {
  date: string; kind: string; nature: string; longitude: number; sign: string; degree: number;
  activations: EclipseContact[];
}
export interface EclipseTimeline { start: string; eclipses: EclipseEvent[]; disclaimer: string; }

export function fetchProgressed(natal: BirthInput, targetIso: string): Promise<ProgressedChart> {
  return post<ProgressedChart>("/progressed-chart", { natal, target_iso: targetIso });
}
export function fetchSolarReturn(natal: BirthInput, year: number): Promise<SolarReturnChart> {
  return post<SolarReturnChart>("/solar-return", { natal, year });
}
export function fetchEclipses(natal: BirthInput, startIso: string, count = 8): Promise<EclipseTimeline> {
  return post<EclipseTimeline>("/eclipse-timeline", { natal, start_iso: startIso, count });
}

// ── Advanced (harmonics / midpoint trees / fixed stars) ─────────────────────────

export interface HarmonicPosition { id: string; glyph: string; longitude: number; sign: string; sign_glyph: string; degree: number; minute: number; }
export interface HarmonicChart { harmonic: number; positions: HarmonicPosition[]; aspects: { p1: string; p2: string; type: string; orb: number }[]; disclaimer: string; }
export interface MidpointContact { body: string; angle: number; aspect: string; orb: number; }
export interface MidpointEntry { pair: string; midpoint: number; sign: string; degree: number; contacts: MidpointContact[]; }
export interface MidpointTree { orb: number; entries: MidpointEntry[]; disclaimer: string; }
export interface FixedStarHit { star: string; star_longitude: number; sign: string; degree: number; nature: string; natal_body: string; orb: number; }
export interface FixedStarResponse { orb: number; hits: FixedStarHit[]; disclaimer: string; }

export function fetchHarmonic(natal: BirthInput, harmonic: number): Promise<HarmonicChart> {
  return post<HarmonicChart>("/harmonic-chart", { natal, harmonic });
}
export function fetchMidpointTree(natal: BirthInput, orb = 1.0): Promise<MidpointTree> {
  return post<MidpointTree>("/midpoint-tree", { natal, orb });
}
export function fetchFixedStars(natal: BirthInput, orb = 1.5): Promise<FixedStarResponse> {
  return post<FixedStarResponse>("/fixed-stars", { natal, orb });
}
