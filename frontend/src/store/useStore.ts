// store/useStore.ts — central Zustand state for the observatory.
import { create } from "zustand";
import {
  aiAsk,
  aiAskStream,
  aiSuggestions,
  checkEntitlement,
  fetchTransits,
  generateChart,
  localChart,
  getTreasury,
  verifyDonation,
  type AIResult,
  type Treasury,
} from "../api/client";

const ENT_KEY = "aae.entitlement";
const LAST_CHART_KEY = "aae.last_chart";
import type {
  BirthInput,
  ChartResponse,
  Lens,
  LayerState,
  Selection,
  TransitResponse,
} from "../types";
import { trackEvent } from "../api/client";
import { toDatetimeLocal } from "../lib/datetime";

// Default chart — an obviously-synthetic sample (Y2K noon, Greenwich) so the
// observatory is never empty on first visit. Carries no personal data, and is
// distinct from PLACEHOLDER_BIRTH so personal forecast features stay active for
// the loaded demo chart.
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
  chart: ChartResponse | null;
  chartFromCache: boolean; // chart from offline fallback (cache or on-device), not the API
  chartFromLocal: boolean; // chart computed on-device by @astra/core (reduced body set)
  transit: TransitResponse | null;
  transitIso: string; // ISO datetime for the slider

  // UI
  selection: Selection | null;
  hovered: Selection | null;
  loading: boolean;
  error: string | null;
  autoSpeak: boolean; // read each new interpretation aloud automatically

  // AI
  aiResult: AIResult | null;
  aiLoading: boolean;
  aiStreaming: boolean;

  // Monetization / open paywall
  entitlement: string | null; // supporter token (persisted)
  isSupporter: boolean;
  treasury: Treasury | null;
  supportOpen: boolean; // is the Support modal visible

  // Actions
  setBirth: (b: Partial<BirthInput>) => void;
  setLens: (l: Lens) => void;
  toggleLayer: (k: keyof LayerState) => void;
  select: (s: Selection | null) => void;
  hover: (s: Selection | null) => void;
  setTransitIso: (iso: string) => void;
  toggleAutoSpeak: () => void;

  generate: () => Promise<void>;
  loadTransit: (iso: string) => Promise<void>;
  ask: (query: string, depth?: "quick" | "deep") => Promise<void>;
  suggest: () => Promise<void>;

  openSupport: (open: boolean) => void;
  loadTreasury: () => Promise<void>;
  redeemDonation: (txHash: string, chain?: string) => Promise<boolean>;
  clearEntitlement: () => void;
  validateEntitlement: () => Promise<void>;
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

export const useStore = create<AstroState>((set, get) => ({
  birth: DEFAULT_BIRTH,
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
  loading: false,
  error: null,
  autoSpeak: false,

  aiResult: null,
  aiLoading: false,
  aiStreaming: false,

  entitlement: localStorage.getItem(ENT_KEY),
  isSupporter: !!localStorage.getItem(ENT_KEY),
  treasury: null,
  supportOpen: false,

  setBirth: (b) => set((s) => ({ birth: { ...s.birth, ...b } })),
  setLens: (lens) => { set({ lens }); trackEvent("lens_changed", { lens }); },
  toggleLayer: (k) =>
    set((s) => ({ layers: { ...s.layers, [k]: !s.layers[k] } })),
  select: (selection) => {
    set({ selection, aiResult: null });
    if (selection) trackEvent("element_selected", { type: selection.type, id: selection.id });
  },
  hover: (hovered) => set({ hovered }),
  setTransitIso: (transitIso) => set({ transitIso }),
  toggleAutoSpeak: () => set((s) => ({ autoSpeak: !s.autoSpeak })),

  generate: async () => {
    set({ loading: true, error: null });
    try {
      const chart = await generateChart(get().birth);
      set({ chart, loading: false, selection: null, transit: null,
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
        set({ chart: cached.chart, loading: false, error: null,
              selection: null, transit: null, chartFromCache: true, chartFromLocal: false });
        return;
      }
      // 2) No cache for this birth — cast it on-device with @astra/core
      // (reduced body set). Genuinely offline-capable, any birth data.
      try {
        const chart = await localChart(get().birth);
        set({ chart, loading: false, error: null, selection: null,
              transit: null, chartFromCache: true, chartFromLocal: true });
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
        } else {
          set({ aiLoading: false, aiStreaming: false, error: msg });
        }
      }
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
    if (!entitlement) return;
    try {
      const status = await checkEntitlement(entitlement);
      if (!status.supporter) {
        // Token expired or revoked — clear it so the UI reflects reality.
        localStorage.removeItem(ENT_KEY);
        set({ entitlement: null, isSupporter: false });
      }
    } catch {
      // Network failure — leave the stored token alone; it's verified next time.
    }
  },
}));
