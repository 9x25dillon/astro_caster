// store/useStore.ts — central Zustand state for the observatory.
import { create } from "zustand";
import {
  aiAsk,
  aiAskStream,
  aiSuggestions,
  checkEntitlement,
  claimReportCheckout,
  fetchTransits,
  generateChart,
  localChart,
  getTreasury,
  retrieveCheckout,
  verifyDonation,
  type AIResult,
  type Treasury,
} from "../api/client";
import {
  clearPendingReportSeed,
  readPendingReportSeed,
  saveReportToken,
} from "../lib/reportTokens";

const ENT_KEY = "aae.entitlement";
const LAST_CHART_KEY = "aae.last_chart";
const ASK_QUEUE_KEY = "aae.ask_queue";
import type {
  BirthInput,
  ChartResponse,
  Lens,
  LayerState,
  MarginNote,
  Selection,
  TransitResponse,
} from "../types";
import { trackEvent } from "../api/client";
import { toDatetimeLocal } from "../lib/datetime";
import { decodeBirthShare, extractChartToken } from "../lib/shareChart";

// The neutral settings a chart falls back to when nobody has chosen any:
// Greenwich, UTC, Placidus, tropical. Kept as the base for the arrival sky
// below (Track E-1) — it is also still an obviously-synthetic sample moment,
// distinct from PLACEHOLDER_BIRTH so personal forecast features stay active.
export const DEFAULT_BIRTH: BirthInput = {
  year: 2000,
  month: 1,
  day: 1,
  hour: 12,
  minute: 0,
  second: 0,
  lat: 51.4826, // Greenwich
  lng: 0.0,
  tz_offset: 0, // UTC
  house_system: "P",
  zodiac: "tropical",
  ayanamsha: 1,
  label: "Sample · 2000-01-01",
};

// Track E-1, the threshold: a first-time visitor meets the instrument already
// running rather than a form. "The sky right now" is just a chart whose moment
// is the present one — no new engine, no new endpoint, the same cast the
// observatory always did.
//
// Quantised to the minute on purpose. The moment doubles as the offline
// cache key (sameBirth), and a to-the-second moment would miss its own cache on
// every reload; to-the-minute means a reload inside the same minute is a hit.
// Local clock fields + the browser's real offset, so the instant is genuinely
// now and the displayed time matches the visitor's own clock.
export const SKY_LABEL = "The sky right now";

export function currentSkyBirth(now: Date = new Date()): BirthInput {
  return {
    ...DEFAULT_BIRTH,
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
    hour: now.getHours(),
    minute: now.getMinutes(),
    second: 0,
    tz_offset: -now.getTimezoneOffset() / 60,
    label: SKY_LABEL,
  };
}

// A distinct reference chart (Einstein — public natal data) used only to detect
// the "no personal chart cast yet" state. The synthetic default above differs
// from this, so personal forecast features stay active for the demo chart.
export const PLACEHOLDER_BIRTH: BirthInput = {
  year: 1879, month: 3, day: 14, hour: 11, minute: 30, second: 0,
  lat: 48.4011, lng: 9.9876, tz_offset: 0.67,
  house_system: "P", zodiac: "tropical", ayanamsha: 1, label: "",
};

// Offline app shell (MOBILE_ROADMAP §7.4): the last successful cast persists
// so a network-dead reload still boots a living observatory. The label is
// excluded — it's cosmetic, not chart-determining.
const BIRTH_FIELDS: (keyof BirthInput)[] = [
  "year", "month", "day", "hour", "minute", "second",
  "lat", "lng", "tz_offset", "house_system", "zodiac", "ayanamsha",
];

function sameBirth(a: BirthInput, b: BirthInput): boolean {
  return BIRTH_FIELDS.every((k) => a[k] === b[k]);
}

function readLastChart(): { birth: BirthInput; chart: ChartResponse } | null {
  try {
    const raw = localStorage.getItem(LAST_CHART_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

interface AstroState {
  // Inputs
  birth: BirthInput;
  lens: Lens;
  layers: LayerState;

  // Data
  // Track E-1: true while the wheel is showing the live sky rather than a chart
  // anyone asked for — the threshold state, before any birth data exists.
  isCurrentSky: boolean;
  chart: ChartResponse | null;
  chartFromCache: boolean; // chart from offline fallback (cache or on-device), not the API
  chartFromLocal: boolean; // chart computed on-device by @astra/core
  transit: TransitResponse | null;
  transitIso: string; // ISO datetime for the slider

  // UI
  selection: Selection | null;
  hovered: Selection | null;
  // Track R (R-2): the margin glass. Chapters publish their selection here;
  // DetailPanel renders it, falling back to chart detail when null (chapter I).
  marginContent: MarginNote | null;
  loading: boolean;
  error: string | null;
  autoSpeak: boolean; // read each new interpretation aloud automatically

  // AI
  aiResult: AIResult | null;
  aiLoading: boolean;
  aiStreaming: boolean;
  queuedAsks: number; // asks captured while offline, awaiting reconnection

  // Monetization / open paywall
  entitlement: string | null; // supporter token (persisted)
  isSupporter: boolean;
  treasury: Treasury | null;
  supportOpen: boolean; // is the Support modal visible
  // Feedback for a Stripe redirect-return ("unlocked", "cancelled", a failure
  // to explain). Transient — never persisted, cleared when acknowledged.
  checkoutNote: string | null;
  checkoutBusy: boolean; // settling a return (the poll window)

  // Actions
  setBirth: (b: Partial<BirthInput>) => void;
  setLens: (l: Lens) => void;
  toggleLayer: (k: keyof LayerState) => void;
  select: (s: Selection | null) => void;
  setMargin: (m: MarginNote | null) => void;
  hover: (s: Selection | null) => void;
  setTransitIso: (iso: string) => void;
  toggleAutoSpeak: () => void;

  generate: () => Promise<void>;
  loadTransit: (iso: string) => Promise<void>;
  ask: (query: string, depth?: "quick" | "deep") => Promise<void>;
  flushAskQueue: () => Promise<void>;
  suggest: () => Promise<void>;

  openSupport: (open: boolean) => void;
  loadTreasury: () => Promise<void>;
  redeemDonation: (txHash: string, chain?: string) => Promise<boolean>;
  clearEntitlement: () => void;
  validateEntitlement: () => Promise<void>;
  completeCheckoutReturn: () => Promise<void>;
  setCheckoutNote: (note: string | null) => void;
}

const EMPTY_RESULT: AIResult = {
  interpretation: "",
  source: "llm",
  model: "",
  provider: undefined,
};

// Mobile-friendly unlock: `?entitlement=<token>` stores the token exactly like
// the devtools localStorage snippet would (Termux/phone browsers have no
// console). `?entitlement=clear` returns to free tier. The param is scrubbed
// from the address bar immediately; startup validation still clears any
// invalid/expired token, so a bad paste just lands on free.
(() => {
  try {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("entitlement");
    if (token === null) return;
    if (token === "clear" || token === "") localStorage.removeItem(ENT_KEY);
    else localStorage.setItem(ENT_KEY, token);
    params.delete("entitlement");
    const rest = params.toString();
    window.history.replaceState(
      null, "", window.location.pathname + (rest ? `?${rest}` : "") + window.location.hash);
  } catch { /* sandboxed storage or no window: ignore */ }
})();

// Stripe redirect-return (Phase 4 / Track E-3). Checkout is a REDIRECT flow:
// the browser leaves for Stripe's hosted page and comes back to
// `?checkout=<session_id>` (tier) or `?report_checkout=<session_id>` (deluxe),
// or `…=cancel` if the customer backed out. Capture BOTH synchronously here and
// scrub them immediately — same discipline as `?entitlement=` above — so a
// reload can't re-trigger a mint and the session id doesn't linger in the bar,
// in history, or in a referrer. The network half runs later, in
// `completeCheckoutReturn`, which the App calls on mount.
const CHECKOUT_RETURN: { tier: string | null; report: string | null } = (() => {
  try {
    const params = new URLSearchParams(window.location.search);
    const tier = params.get("checkout");
    const report = params.get("report_checkout");
    if (tier === null && report === null) return { tier: null, report: null };
    params.delete("checkout");
    params.delete("report_checkout");
    const rest = params.toString();
    window.history.replaceState(
      null, "", window.location.pathname + (rest ? `?${rest}` : "") + window.location.hash);
    return { tier, report };
  } catch {
    return { tier: null, report: null };
  }
})();

// Stripe reports a session paid as soon as the customer finishes, but our mint
// can race the webhook. `GET /api/checkout/{id}` mints on read, so a short poll
// covers the window where the browser gets back first.
const CHECKOUT_POLLS = 3;
const CHECKOUT_POLL_MS = 2000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Offline ask queue — persisted so a reflection typed with no connection
// survives reload and fires when the network returns (flushAskQueue).
interface QueuedAsk {
  query: string;
  depth: "quick" | "deep";
  lens: Lens;
  selType: Selection["type"] | null;
  selId: string | null;
}
const loadAskQueue = (): QueuedAsk[] => {
  try { return JSON.parse(localStorage.getItem(ASK_QUEUE_KEY) || "[]"); } catch { return []; }
};
const saveAskQueue = (q: QueuedAsk[]) => {
  try { localStorage.setItem(ASK_QUEUE_KEY, JSON.stringify(q)); } catch { /* best-effort */ }
};
// Guards against two 'online'/startup triggers draining the queue concurrently
// (which would double-send the head entry).
let flushing = false;
// A fetch that fails because we're offline throws a TypeError, not an HTTP status.
const isOfflineError = (msg: string) =>
  !navigator.onLine || /failed to fetch|networkerror|load failed/i.test(msg);

// Shared-chart import: a `?chart=<token>` link (or a share_target payload whose
// `text`/`url` embeds one) decodes into a BirthInput used as the initial cast.
// Scrubbed from the address bar so a reload doesn't re-import stale data.
const SHARED_BIRTH: BirthInput | null = (() => {
  try {
    const params = new URLSearchParams(window.location.search);
    const token = extractChartToken(
      params.get("chart") ?? params.get("text") ?? params.get("url")
    );
    if (!token) return null;
    const birth = decodeBirthShare(token);
    for (const k of ["chart", "text", "url", "title"]) params.delete(k);
    const rest = params.toString();
    window.history.replaceState(
      null, "", window.location.pathname + (rest ? `?${rest}` : "") + window.location.hash);
    if (birth) trackEvent("chart_shared_in");
    return birth;
  } catch {
    return null;
  }
})();

// What the observatory opens on, in order of precedence: a shared chart link,
// then whatever this browser last cast (a returning visitor keeps their sky —
// and it keeps the offline cache key stable across a reload), and only on a
// genuinely new browser, the sky as it is right now.
const ARRIVAL: { birth: BirthInput; isSky: boolean } = (() => {
  if (SHARED_BIRTH) return { birth: SHARED_BIRTH, isSky: false };
  const last = readLastChart();
  if (last?.birth) return { birth: last.birth, isSky: last.birth.label === SKY_LABEL };
  return { birth: currentSkyBirth(), isSky: true };
})();

export const useStore = create<AstroState>((set, get) => ({
  birth: ARRIVAL.birth,
  isCurrentSky: ARRIVAL.isSky,
  lens: "psychological",
  layers: {
    zodiac: true,
    houses: true,
    planets: true,
    aspects: true,
    transits: false,
    minorAspects: false,
  },

  chart: null,
  chartFromCache: false,
  chartFromLocal: false,
  transit: null,
  transitIso: toDatetimeLocal(new Date()),

  selection: null,
  hovered: null,
  marginContent: null,
  loading: false,
  error: null,
  autoSpeak: false,

  aiResult: null,
  aiLoading: false,
  aiStreaming: false,
  queuedAsks: loadAskQueue().length,

  entitlement: localStorage.getItem(ENT_KEY),
  isSupporter: !!localStorage.getItem(ENT_KEY),
  treasury: null,
  supportOpen: false,
  checkoutNote: null,
  checkoutBusy: false,

  // Any birth data someone actually chose ends the threshold state — the wheel
  // stops being "the sky right now" the moment it becomes somebody's chart.
  setBirth: (b) =>
    set((s) => {
      const birth = { ...s.birth, ...b };
      return { birth, isCurrentSky: birth.label === SKY_LABEL };
    }),
  setLens: (lens) => { set({ lens }); trackEvent("lens_changed", { lens }); },
  toggleLayer: (k) =>
    set((s) => ({ layers: { ...s.layers, [k]: !s.layers[k] } })),
  select: (selection) => {
    set({ selection, aiResult: null });
    if (selection) trackEvent("element_selected", { type: selection.type, id: selection.id });
  },
  setMargin: (marginContent) => set({ marginContent }),
  hover: (hovered) => set({ hovered }),
  setTransitIso: (transitIso) => set({ transitIso }),
  toggleAutoSpeak: () => set((s) => ({ autoSpeak: !s.autoSpeak })),

  generate: async () => {
    set({ loading: true, error: null });
    try {
      const chart = await generateChart(get().birth);
      set({ chart, loading: false, selection: null, marginContent: null, transit: null,
            chartFromCache: false, chartFromLocal: false });
      try {
        localStorage.setItem(LAST_CHART_KEY, JSON.stringify({ birth: get().birth, chart }));
      } catch {
        /* storage full or sandboxed — the offline cache is best-effort */
      }
    } catch (e) {
      // Offline degradation ladder. 1) The last successful cast of the SAME
      // birth data is the best offline chart (full body set) — restore it.
      const cached = readLastChart();
      if (cached && sameBirth(cached.birth, get().birth)) {
        set({ chart: cached.chart, loading: false, error: null, selection: null,
              marginContent: null, transit: null, chartFromCache: true, chartFromLocal: false });
        return;
      }
      // 2) No cache for this birth — cast it on-device with @astra/core
      // (full body set via the bundled WASM Swiss engine). Genuinely offline-capable, any birth data.
      try {
        const chart = await localChart(get().birth);
        set({ chart, loading: false, error: null, selection: null,
              marginContent: null, transit: null, chartFromCache: true, chartFromLocal: true });
        return;
      } catch {
        /* local engine unavailable — fall through to the error */
      }
      set({ loading: false, error: (e as Error).message });
    }
  },

  loadTransit: async (iso) => {
    // Keep transitIso in local datetime-local format: a raw toISOString()
    // value (trailing seconds + "Z") blanks <input type="datetime-local">.
    set({ transitIso: toDatetimeLocal(iso) });
    try {
      const transit = await fetchTransits(get().birth, new Date(iso).toISOString());
      set({ transit });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  ask: async (query, depth = "quick") => {
    const { chart, lens, selection, isSupporter, entitlement } = get();
    if (!chart) return;
    // Open-paywall gate: deep readings ask for support, but never hard-block.
    if (depth === "deep" && !isSupporter) {
      set({ supportOpen: true });
      return;
    }
    set({ aiLoading: true, aiStreaming: true, aiResult: null });
    let acc = "";
    let meta: Partial<AIResult> = {};
    try {
      await aiAskStream(query, chart, lens, selection, depth, {
        onMeta: (m) => {
          meta = { provider: m.provider as AIResult["provider"], model: m.model };
          set({ aiResult: { ...EMPTY_RESULT, ...meta } });
        },
        onChunk: (t) => {
          acc += t;
          // First token arrived — drop the spinner, show streaming text.
          set((s) => ({
            aiLoading: false,
            aiResult: { ...EMPTY_RESULT, ...meta, ...s.aiResult, interpretation: acc },
          }));
        },
        onDone: (d) => {
          set({
            aiResult: {
              ...EMPTY_RESULT,
              ...meta,
              ...d,
              interpretation: acc || (d.interpretation ?? ""),
            } as AIResult,
            aiStreaming: false,
            aiLoading: false,
          });
        },
        onError: (msg) => set({ error: msg, aiStreaming: false, aiLoading: false }),
      }, entitlement);
    } catch (e) {
      // 402 means supporter gate — open the modal rather than surfacing a raw error.
      if ((e as Error).message.includes("402")) {
        set({ aiLoading: false, aiStreaming: false, supportOpen: true });
        return;
      }
      // Network/abort — fall back to the non-streaming endpoint once.
      try {
        const aiResult = await aiAsk(query, chart, lens, selection, depth, entitlement);
        set({ aiResult, aiLoading: false, aiStreaming: false });
      } catch (e2) {
        const msg = (e2 as Error).message;
        if (msg.includes("402")) {
          set({ aiLoading: false, aiStreaming: false, supportOpen: true });
        } else if (isOfflineError(msg)) {
          // Offline: capture the ask so it fires when the network returns,
          // rather than surfacing a dead-end error.
          const q = loadAskQueue();
          q.push({ query, depth, lens, selType: selection?.type ?? null, selId: selection?.id ?? null });
          saveAskQueue(q);
          set({ aiLoading: false, aiStreaming: false, queuedAsks: q.length });
          trackEvent("ask_queued_offline");
        } else {
          set({ aiLoading: false, aiStreaming: false, error: msg });
        }
      }
    }
  },

  // Drain the offline ask queue oldest-first. Called on the window 'online'
  // event and at startup. We don't trust navigator.onLine (it tracks a network
  // interface, not real reachability, and can lag the event) — we just attempt
  // the send and stop on the first genuine network failure, keeping the queue.
  flushAskQueue: async () => {
    if (flushing) return;
    const { chart, entitlement } = get();
    if (!chart) return; // need a cast to interpret against
    if (loadAskQueue().length === 0) return;
    flushing = true;
    try {
      let q = loadAskQueue();
      while (q.length > 0) {
        const item = q[0];
        const selection = item.selType
          ? ({ type: item.selType, id: item.selId } as Selection)
          : null;
        try {
          const aiResult = await aiAsk(item.query, chart, item.lens, selection, item.depth, entitlement);
          set({ aiResult });
        } catch (e) {
          // Still offline / server down: stop and keep the queue for next time.
          // A 402 (supporter-gated) falls through and is dropped so a gated ask
          // can't wedge the queue forever.
          if (!(e as Error).message.includes("402")) break;
        }
        q = loadAskQueue();
        q.shift();
        saveAskQueue(q);
        set({ queuedAsks: q.length });
      }
    } finally {
      flushing = false;
    }
  },

  suggest: async () => {
    const { chart, lens } = get();
    if (!chart) return;
    set({ aiLoading: true, aiResult: null });
    try {
      const aiResult = await aiSuggestions(chart, lens);
      set({ aiResult, aiLoading: false });
    } catch (e) {
      set({ aiLoading: false, error: (e as Error).message });
    }
  },

  openSupport: (open) => { set({ supportOpen: open }); if (open) trackEvent("support_opened"); },

  loadTreasury: async () => {
    try {
      set({ treasury: await getTreasury() });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  redeemDonation: async (txHash, chain = "evm") => {
    try {
      const { entitlement } = await verifyDonation(txHash, chain);
      localStorage.setItem(ENT_KEY, entitlement.token);
      set({ entitlement: entitlement.token, isSupporter: true, supportOpen: false });
      return true;
    } catch (e) {
      set({ error: (e as Error).message });
      return false;
    }
  },

  clearEntitlement: () => {
    localStorage.removeItem(ENT_KEY);
    set({ entitlement: null, isSupporter: false });
  },

  validateEntitlement: async () => {
    const { entitlement } = get();
    try {
      // Always ask the backend — even with NO token. In personal mode
      // (Edition P) the instance grants oracle tier to every request, so a
      // tokenless browser is still fully unlocked; without this the UI would
      // show free-tier support/purchase prompts against an unlocked backend.
      const status = await checkEntitlement(entitlement ?? "");
      // A checkout return can mint WHILE this request is in flight (both fire
      // from the same mount). The answer we're holding is about the old token,
      // so applying it would flip a customer who just paid back to locked.
      if (get().entitlement !== entitlement) return;
      if (status.supporter) {
        set({ isSupporter: true });
      } else if (entitlement) {
        // Token expired or revoked — clear it so the UI reflects reality.
        localStorage.removeItem(ENT_KEY);
        set({ entitlement: null, isSupporter: false });
      } else {
        set({ isSupporter: false });
      }
    } catch {
      // Network failure — leave the stored state alone; re-checked next time.
    }
  },

  setCheckoutNote: (note) => set({ checkoutNote: note }),

  // The other half of the Stripe redirect: the params were captured and scrubbed
  // at module load (CHECKOUT_RETURN); this exchanges them for the actual unlock.
  // Called once on mount — a no-op on every ordinary visit.
  completeCheckoutReturn: async () => {
    const { tier, report } = CHECKOUT_RETURN;
    if (tier === null && report === null) return;

    if (tier === "cancel" || report === "cancel") {
      // Backing out is a legitimate answer, not an error. Say so kindly and
      // change nothing.
      trackEvent("checkout_cancelled");
      set({ checkoutNote: "Checkout cancelled — nothing was charged." });
      return;
    }

    set({ checkoutBusy: true });
    try {
      if (tier) {
        for (let attempt = 0; attempt < CHECKOUT_POLLS; attempt++) {
          const res = await retrieveCheckout(tier);
          if (res.granted && res.entitlement) {
            localStorage.setItem(ENT_KEY, res.entitlement.token);
            trackEvent("checkout_returned", { granted: true, kind: "tier" });
            set({
              entitlement: res.entitlement.token,
              isSupporter: true,
              checkoutNote: `Unlocked — ${res.tier ?? "supporter"} tier is active. Thank you.`,
            });
            return;
          }
          // Not settled yet: the browser beat the webhook. Wait and re-read.
          if (attempt < CHECKOUT_POLLS - 1) await sleep(CHECKOUT_POLL_MS);
        }
        trackEvent("checkout_returned", { granted: false, kind: "tier" });
        set({
          checkoutNote:
            "Payment is still settling with Stripe. Reload in a moment — " +
            "if it stays locked, the ♥ Support panel can re-check it.",
        });
        return;
      }

      // Deluxe: the claim must prove WHICH Oracle session it unlocks, and the
      // raw seed never went to Stripe — it was stashed locally before leaving.
      const sessionId = report as string;
      const seed = readPendingReportSeed(sessionId);
      if (!seed) {
        trackEvent("checkout_returned", { granted: false, kind: "deluxe" });
        set({
          checkoutNote:
            "Deluxe purchase received, but this browser doesn't hold the Oracle " +
            "session it was bought for. Re-open that session and use " +
            "“already unlocked? compile” to claim it.",
        });
        return;
      }
      const { entitlement } = get();
      const res = await claimReportCheckout(sessionId, seed, { entitlement });
      if (res.granted && res.report_token?.token) {
        saveReportToken(seed, res.report_token.token);
        clearPendingReportSeed();
        trackEvent("checkout_returned", { granted: true, kind: "deluxe" });
        set({
          checkoutNote:
            "Deluxe edition unlocked for that Oracle session — open it and compile.",
        });
      }
    } catch (e) {
      const err = e as Error & { status?: number };
      // 402 = Stripe hasn't settled the payment yet; 409 = the purchase belongs
      // to a different Oracle session. Both are worth saying precisely.
      const note = err.status === 402
        ? "Payment hasn't settled yet — reload in a moment to claim it."
        : err.status === 409
          ? "That purchase was made for a different Oracle session."
          : `Could not complete the purchase: ${err.message}`;
      trackEvent("checkout_returned", { granted: false });
      set({ checkoutNote: note });
    } finally {
      set({ checkoutBusy: false });
    }
  },
}));
