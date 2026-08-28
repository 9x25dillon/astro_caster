// ArcanaModal.tsx — Astra Arcana: natal tarot observatory.
// Tabs: Natal signature · Draw spread · Transit cards · Classroom · Studio.
// Deterministic core works offline; AI enrichment is opt-in for supporters.
// Track R (R-2): a chapter surface (II · Reading / VI · Study / VII · Studio),
// not a modal — no overlay, no ✕; Esc and the dial navigate home via the App shell.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store/useStore";
import {
  fetchNatalArcana,
  localNatalArcana,
  fetchTarotReading,
  localTarotReading,
  fetchArcanaForecast,
  fetchLearningPath,
  fetchDeckArt,
  deckCatalog,
  type DeckEntry,
  renderPlate,
  type PlateResponse,
  fetchOracleReport,
  fetchCourseStream,
  fetchPersonalReport,
  purchasePersonalReport,
  reportCheckout,
  getPricing,
  type Pricing,
  downloadArcanaCalendar,
  localToday,
  trackEvent,
  type NatalArcanaSignature,
  type TarotReadingResponse,
  type ArcanaForecastResponse,
  type LearningPathResponse,
  type DeckArtResponse,
  type OracleReportResponse,
  type CourseResponse,
  type PersonalReportResponse,
  type SpreadType,
  type SourceSystem,
  SOURCE_LABELS,
  ApiError,
} from "../api/client";
import { CLASSROOM, EXPRESSION_KINDS, generateArtifact, type Artifact } from "../lib/tarotCopy";
import { Interpretation } from "./DetailPanel";
import { useSpeech, speakableText } from "../lib/speech";
import { scopeArcanaSession, useSessionState } from "../lib/arcanaSession";
import { printSessionTome } from "../lib/tomePrint";
import { galleryByKind, gallerySave, journalForSeed, shelfAttachPersonal, shelfSaveOracle } from "../lib/bookshelf";
import { JournalPad } from "./JournalPad";
import { TarotCard } from "./TarotCard";
import { CardPlate } from "./CardPlate";
import { DailyCardPanel } from "./DailyCardPanel";
import { ConstellationPath } from "./ConstellationPath";
import { chaosLetters, wordValue, reduceDigit, planetToKamea } from "../lib/sigil";
import { rememberPlate } from "../lib/plateCache";
import { layoutFor, gridStyle } from "../lib/spreadLayout";
import { mergeSignatureByCard, signatureOptionLabel } from "../lib/arcanaPicker";
import { deriveSoulProfile } from "../lib/archetypes";
import { computeLifePath, LIFE_PATH_DATA, getResonance } from "../lib/numerology";
import { loadReportToken, saveReportToken, stashPendingReportSeed } from "../lib/reportTokens";

// Friendly labels for the models that can serve an Oracle Report (requested
// model + its server-side fallback). Unknown IDs fall through as-is — honest
// provenance beats a pretty label.
const ORACLE_MODEL_LABELS: Record<string, string> = {
  "claude-fable-5": "Claude Fable 5",
  "claude-opus-4-8": "Claude Opus 4.8",
};

type Tab = "natal" | "draw" | "transit" | "classroom" | "studio";

// Suit → its heading in the Studio's card picker, in canonical order. Like
// SPREADS below, `label` is presentation only — the card ids are what travel.
const SUIT_GROUPS: { suit: string; label: string }[] = [
  { suit: "wands", label: "Wands" },
  { suit: "cups", label: "Cups" },
  { suit: "swords", label: "Swords" },
  { suit: "pentacles", label: "Pentacles" },
];

// Every spread the engines define. Grouped so the picker reads as a menu rather
// than a flat list; `group` is presentation only — the ids are what travel.
const SPREADS: { id: SpreadType; label: string; group: string }[] = [
  { id: "daily", label: "Daily card", group: "Quick" },
  { id: "three_card", label: "Self · Mirror · Shadow", group: "Quick" },
  { id: "celtic_cross", label: "Celtic Cross (10)", group: "Traditional" },
  { id: "horseshoe", label: "Horseshoe (7)", group: "Traditional" },
  { id: "tree_of_life", label: "Tree of Life (10)", group: "Traditional" },
  { id: "elemental_balance", label: "Elemental balance", group: "Chart-native" },
  { id: "planetary_seven", label: "The Planetary Seven", group: "Chart-native" },
  { id: "twelve_house", label: "Twelve-house", group: "Chart-native" },
  { id: "relationship", label: "Relationship", group: "Themed" },
  { id: "transit_pressure", label: "Transit pressure", group: "Themed" },
  { id: "shadow_integration", label: "Shadow integration", group: "Themed" },
  { id: "creative_expression", label: "Creative expression", group: "Themed" },
];

const SPREAD_GROUPS = ["Quick", "Traditional", "Chart-native", "Themed"];

function CardChip({ name, reversed }: { name: string; reversed?: boolean }) {
  return (
    <span className={`arc-chip ${reversed ? "arc-chip--rev" : ""}`}>
      ✦ {name}{reversed ? " ⤓" : ""}
    </span>
  );
}

export const ArcanaModal: React.FC<{
  // Track R: chapters VI (Study) and VII (Studio) open straight to their tab.
  initialTab?: Tab;
}> = ({ initialTab }) => {
  const chart = useStore((s) => s.chart);
  const birth = useStore((s) => s.birth);
  const aiResult = useStore((s) => s.aiResult);   // Astra's Detail-panel reading
  const entitlement = useStore((s) => s.entitlement);
  const isSupporter = useStore((s) => s.isSupporter);
  const openSupport = useStore((s) => s.openSupport);
  const setMargin = useStore((s) => s.setMargin);   // R-2: publish selections to the margin glass
  const speech = useSpeech();   // Speak buttons on the Oracle Report sections

  // The readings must survive the chapter dial (see lib/arcanaSession.ts):
  // this modal remounts on every chapter switch, and a paid Oracle Report
  // vanishing because someone glanced at the Library is a bug a customer
  // reported in exactly those words. Scope first — a different birth clears
  // the keep, so one chart's reading can never resurface under another.
  const scopeKey = JSON.stringify(birth ?? null);
  scopeArcanaSession(scopeKey);

  const [tab, setTab] = useSessionState<Tab>(
    // Chapters VI/VII open straight to their own tab; chapter II remembers
    // where the reader was.
    `tab:${initialTab ?? "ii"}`, initialTab ?? "natal");

  const [sig, setSig] = useState<NatalArcanaSignature | null>(null);
  const [reading, setReading] = useSessionState<TarotReadingResponse | null>("reading", null);
  const [forecast, setForecast] = useSessionState<ArcanaForecastResponse | null>("forecast", null);
  const [path, setPath] = useState<LearningPathResponse | null>(null);
  const [artifact, setArtifact] = useState<Artifact | null>(null);
  const [deckArt, setDeckArt] = useState<DeckArtResponse | null>(null);
  const [deckCard, setDeckCard] = useState<string>("");   // "" = whole soul deck
  const [deck, setDeck] = useState<DeckEntry[]>([]);       // all 78, for the picker
  const [oracle, setOracle] = useSessionState<OracleReportResponse | null>("oracle", null);
  const [oracleLoading, setOracleLoading] = useState(false);
  // The Course — premium curriculum over the learning path (Classroom tab).
  const [course, setCourse] = useSessionState<CourseResponse | null>("course", null);
  const [courseLoading, setCourseLoading] = useState(false);
  // The curriculum as it streams in, shown until the done frame replaces it.
  const [coursePartial, setCoursePartial] = useState("");
  const [courseFocus, setCourseFocus] = useSessionState("courseFocus", "a foundation in reading my own chart");
  // Deck-art plates (P3) — rendered images keyed by card id.
  const [plates, setPlates] = useState<Record<string, PlateResponse>>({});
  const [plateLoading, setPlateLoading] = useState<string | null>(null);
  // The exact (date, generated-at) context of the Oracle session — the Personal
  // Report must echo the same local date or the server's seed check rejects it.
  const [oracleCtx, setOracleCtx] = useSessionState<{ date: string | null; generatedAt: string } | null>("oracleCtx", null);
  const [personal, setPersonal] = useSessionState<PersonalReportResponse | null>("personal", null);
  const [personalLoading, setPersonalLoading] = useState(false);
  // PDF-2 — the deluxe edition's separate purchase rail (per-session claim).
  const [reportToken, setReportToken] = useState<string | null>(null);
  const [purchaseTx, setPurchaseTx] = useState("");
  const [purchasing, setPurchasing] = useState(false);
  // Deluxe price + whether the card rail exists at all. Null until known, so
  // the card option simply doesn't render on an instance without Stripe.
  const [pricing, setPricing] = useState<Pricing | null>(null);

  // R-4: constellation path — a star stays lit once a reflection is kept for
  // its lesson (loaded from the journal when the path arrives; keeping one in
  // the margin lights it on the next visit).
  const [walked, setWalked] = useState<Set<number>>(new Set());

  const [spread, setSpread] = useSessionState<SpreadType>("spread", "three_card");
  // Session 25 — the interactive draw: which positions have been turned over.
  // Reset on every fresh deal so each spread starts face-down.
  const [revealed, setRevealed] = useSessionState<Record<string, boolean>>("revealed", {});
  const [source, setSource] = useSessionState<SourceSystem>("source", "golden_dawn");
  const [question, setQuestion] = useSessionState("question", "What do I need to understand right now?");
  const [useAi, setUseAi] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Reset cached arcana state whenever the underlying chart CHANGES — a
  // report belongs to one chart and must never be shown against another.
  //
  // The guard is load-bearing, not an optimisation. This modal remounts on
  // every chapter switch, so an unguarded `[chart]` effect also fires on
  // arrival, which would wipe the very state `useSessionState` just restored
  // and put the disappearing-reading bug back. Compare the birth IDENTITY
  // rather than the chart object: a remount produces an equal chart that is
  // not the same reference.
  const lastScope = useRef<string | null>(null);
  useEffect(() => {
    if (lastScope.current === scopeKey) return;
    const first = lastScope.current === null;
    lastScope.current = scopeKey;
    if (first) return;   // arriving, not switching charts
    setSig(null);
    setReading(null);
    setForecast(null);
    setPath(null);
    setDeckArt(null);
    setOracle(null);
    setOracleCtx(null);
    setPersonal(null);
    setReportToken(null);   // claims bind to a session seed, not the chart
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey]);

  // The deluxe price + whether cards are accepted here. Fetched once; a failure
  // is silent — the crypto rail and the free tier stand on their own.
  useEffect(() => {
    let live = true;
    getPricing().then((p) => { if (live) setPricing(p); }).catch(() => {});
    return () => { live = false; };
  }, []);

  // Chapter VI opens straight to the classroom — fire its lazy load on mount
  // (the tab-click handler that normally does this never ran).
  useEffect(() => {
    if (initialTab === "classroom" && chart && !path) loadPath();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart]);

  // Which path lessons carry a kept reflection — those stars stay lit.
  useEffect(() => {
    if (!path) { setWalked(new Set()); return; }
    let stale = false;
    journalForSeed(`path:${path.anchor}→${path.growth_edge}`)
      .then((es) => {
        if (stale) return;
        const orders = es
          .map((e) => parseInt(e.position ?? "", 10))
          .filter((n) => Number.isFinite(n));
        setWalked(new Set(orders));
      })
      .catch(() => undefined);
    return () => { stale = true; };
  }, [path]);

  // Load the natal signature once a chart exists; on-device if the backend is down.
  useEffect(() => {
    if (chart && !sig) {
      fetchNatalArcana(chart)
        .then(setSig)
        .catch(async () => {
          try { setSig(await localNatalArcana(chart)); }
          catch (e2) { setErr(String(e2)); }
        });
    }
  }, [chart, sig]);

  // The Studio can brief any of the 78 — /deck-art has always taken a minor's
  // id as readily as a trump's — so the picker loads the whole deck the first
  // time the tab is opened, and not on app boot. Failure is silent on purpose:
  // the signature group alone is still a working picker, and this is a
  // dropdown, not a reading.
  useEffect(() => {
    if (tab !== "studio" || deck.length) return;
    let alive = true;
    deckCatalog().then((d) => { if (alive) setDeck(d); }).catch(() => {});
    return () => { alive = false; };
  }, [tab, deck.length]);

  // The signature group, merged by CARD rather than listed per BODY. Two bodies
  // can carry the same trump — the Ascendant and Midheaven fall through to their
  // SIGN's card, and Aquarius's card is `star`, which is also the North Node's
  // (always present) — so a per-body listing offers that id twice and breaks the
  // picker's "each of the 78, exactly once" contract. See lib/arcanaPicker.ts.
  const signatureOptions = useMemo(() => mergeSignatureByCard(sig?.links), [sig]);

  // The rest of the deck, grouped for that picker: the trumps this chart does
  // NOT carry (the ones it does sit in their own group above, labelled by the
  // bodies carrying them, so no id appears twice), then the four suits.
  const deckGroups = useMemo(() => {
    if (!deck.length) return [];
    const inSignature = new Set(sig?.links.map((l) => l.card.id) ?? []);
    return [
      {
        label: "Major Arcana",
        cards: deck.filter((c) => c.arcana === "major" && !inSignature.has(c.id)),
      },
      ...SUIT_GROUPS.map(({ suit, label }) => ({
        label, cards: deck.filter((c) => c.suit === suit),
      })),
    ].filter((g) => g.cards.length > 0);
  }, [deck, sig]);

  // Restore previously collected plates from the Gallery so the Studio shows
  // the deck you've built so far, not just this session's fresh renders.
  useEffect(() => {
    let alive = true;
    galleryByKind("plate")
      .then((items) => {
        if (!alive) return;
        const restored: Record<string, PlateResponse> = {};
        for (const it of items) {
          if (!it.cardId) continue;
          restored[it.cardId] = {
            card_id: it.cardId,
            title: it.title,
            prompt: "",
            image_b64: it.data.replace(/^data:image\/png;base64,/, ""),
            model: String(it.meta?.model ?? ""),
            size: String(it.meta?.size ?? ""),
            quality: String(it.meta?.quality ?? ""),
            ai_source: "openai",
            disclaimer: "",
          };
        }
        setPlates((prev) => ({ ...restored, ...prev })); // fresh renders win
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, []);

  async function draw() {
    if (!chart) return;
    setLoading(true); setErr(null);
    // Session 25: a fresh deal lands face-down — every card waits for its tap.
    setRevealed({});
    try {
      const wantAi = useAi && isSupporter;
      const r = await fetchTarotReading(chart, spread, question, {
        includeAi: wantAi, entitlement, source,
      });
      setReading(r);
      trackEvent("arcana_draw", { spread, ai: wantAi, source });
    } catch (e) {
      // Offline: deal the same cards on-device (the backend's offline reading,
      // minus AI/lesson enrichment). AI-gated 402s still surface normally.
      if (e instanceof ApiError && e.status === 402) {
        setErr(String(e));
      } else {
        try {
          setReading(await localTarotReading(chart, spread, question, { source }));
          trackEvent("arcana_draw", { spread, ai: false, source, offline: true });
        } catch {
          setErr(String(e));
        }
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadForecast() {
    if (!chart) return;
    setLoading(true); setErr(null);
    try {
      const f = await fetchArcanaForecast(chart, 7, entitlement, { source });
      setForecast(f);
      trackEvent("arcana_forecast_opened");
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function loadPath() {
    if (!chart) return;
    setLoading(true); setErr(null);
    try {
      const p = await fetchLearningPath(chart, { source });
      setPath(p);
      trackEvent("arcana_learning_path", { source });
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function loadDeckArt() {
    if (!chart) return;
    setLoading(true); setErr(null);
    try {
      const d = await fetchDeckArt(chart, {
        cardId: deckCard || undefined, source, entitlement,
      });
      setDeckArt(d);
      trackEvent("arcana_deck_art", { card: deckCard || "soul_deck", source });
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function paintPlate(cardId: string) {
    if (!chart || plateLoading) return;
    setPlateLoading(cardId); setErr(null);
    try {
      // One plate per call — each render is a paid image generation.
      const p = await renderPlate(chart, cardId, { source, entitlement });
      setPlates((prev) => ({ ...prev, [cardId]: p }));
      trackEvent("plate_rendered", { card: cardId, source, quality: p.quality });
      // Persist to the Gallery so the plate is a permanent, collectible
      // artifact (chapter VII / the physical deck) — not lost when the modal
      // closes. One image per card per deck source: re-rendering replaces it.
      const artifact = {
        id: `plate:${source}:${cardId}`,
        kind: "plate" as const,
        cardId,
        title: p.title || cardId,
        mime: "image/png",
        data: `data:image/png;base64,${p.image_b64}`,
        source,
        seed: null,
        meta: { quality: p.quality, model: p.model, size: p.size },
      };
      void gallerySave(artifact).catch(() => undefined);
      // ...and tell every other surface at once. A plate is paid for once and
      // belongs everywhere the card appears: this draw, chapter II's reading,
      // and the card of the day — without a reload, and free from then on.
      rememberPlate(artifact);
    } catch (e) {
      if (e instanceof ApiError && e.status === 402) {
        setErr("Oracle tier required — rendering a plate is a paid image " +
               "generation. Support at the oracle level to unlock it.");
        openSupport(true);
        trackEvent("plate_gated", { card: cardId });
      } else if (e instanceof ApiError && e.status === 503) {
        setErr("The image layer isn't configured on this observatory — the " +
               "prompt itself is yours to paint with any image tool.");
      } else {
        setErr(String(e));
      }
    } finally {
      setPlateLoading(null);
    }
  }

  function downloadPlate(p: PlateResponse) {
    const a = document.createElement("a");
    a.href = `data:image/png;base64,${p.image_b64}`;
    a.download = `astra-plate-${p.card_id}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function loadCourse() {
    if (!chart || courseLoading) return;
    setCourseLoading(true); setErr(null);
    try {
      // Fable writes the curriculum over the deterministic learning path;
      // the backend degrades to the offline compiler with honest provenance.
      //
      // STREAMED, because a course takes ~125s to compose and Cloudflare hands
      // the browser a 524 if an origin has not answered in 100 — production
      // logged `POST /api/v1/course 200 125534ms`, i.e. composed, billed, and
      // then thrown away. Bytes in flight reset that timer. The partial text
      // is shown as it arrives and is REPLACED by the authoritative course in
      // the done frame, which is what carries the offline edition when the AI
      // layer declines part-way.
      setCoursePartial("");
      // A box, not a bare `let`: TypeScript cannot see that onDone runs, so a
      // local would narrow to `never` after the await and every field access
      // below would fail to compile.
      const box: { value: CourseResponse | null } = { value: null };
      await fetchCourseStream(
        chart, { source, focus: courseFocus, entitlement },
        {
          onChunk: (t) => setCoursePartial((prev) => prev + t),
          onDone: (c) => { box.value = c; },
          onError: (m) => setErr(m),
        },
      );
      setCoursePartial("");
      const r = box.value;
      // No done frame means no course, however much text arrived — the stream
      // already reported why, so leave the error standing and add nothing.
      if (!r) return;
      setCourse(r);
      // Bookshelf: a generated course is a paid artifact — shelve it like an
      // Oracle session, keyed by its deterministic course identity.
      shelfSaveOracle({
        seed: `course:${r.course_id}`,
        question: `Course — ${r.focus}`,
        spread: "course", source: r.source, lineage: r.lineage, date: null,
        ai_source: r.ai_source, model: r.model ?? null,
        report: r.course, birth: birth ?? null,
      }).catch(() => undefined);
      trackEvent("course_generated", {
        source, lessons: r.lessons, ai: r.ai_source, model: r.model ?? "offline",
      });
    } catch (e) {
      if (e instanceof ApiError && e.status === 402) {
        setErr("Oracle tier required — the Course is a premium curriculum " +
               "composed for your chart by Claude Fable 5. Support at the " +
               "oracle level to unlock it.");
        openSupport(true);
        trackEvent("course_gated", { source });
      } else {
        setErr(String(e));
      }
    } finally {
      setCourseLoading(false);
    }
  }

  async function loadOracleReport() {
    if (!chart || oracleLoading) return;
    setOracleLoading(true); setErr(null);
    try {
      // Reuses the Draw tab's spread/lineage/question controls; the backend
      // rebuilds the full deterministic substrate itself, so this works with
      // or without a prior draw. Fable 5 reports can take a while — the
      // dedicated oracleLoading flag keeps the Draw button usable meanwhile.
      // Pass the local date explicitly so we can capture the EXACT session
      // context — the Personal Report must echo it for the server's seed check.
      const date = spread === "daily" ? localToday() : null;
      const r = await fetchOracleReport(chart, question, {
        spread, source, entitlement, date: date ?? undefined,
      });
      setOracle(r);
      setOracleCtx({ date, generatedAt: localToday() });
      setPersonal(null);   // a deluxe edition compiles ONE session — clear stale
      setReportToken(loadReportToken(r.seed));   // restore this session's claim
      // Bookshelf (B2): every Oracle session shelves itself — paid readings
      // become a permanent local library. Fire-and-forget.
      shelfSaveOracle({
        seed: r.seed, question: r.question, spread: r.spread, source: r.source,
        lineage: r.lineage, date, ai_source: r.ai_source, model: r.model ?? null,
        report: r.report, birth: birth ?? null,
      }).catch(() => undefined);
      trackEvent("oracle_report", {
        spread, source, ai: r.ai_source, model: r.model ?? "offline",
      });
    } catch (e) {
      if (e instanceof ApiError && e.status === 402) {
        // Tier gate (server-side source of truth): route to the support flow.
        setErr("Oracle tier required — the Oracle Report is the observatory's " +
               "deepest paid reading (Claude Fable 5). Support at the oracle " +
               "level to unlock it.");
        openSupport(true);
        trackEvent("oracle_report_gated", { spread, source });
      } else {
        setErr(String(e));
      }
    } finally {
      setOracleLoading(false);
    }
  }

  async function loadPersonalReport() {
    if (!chart || !oracle || personalLoading) return;
    setPersonalLoading(true); setErr(null);
    try {
      // PDF-4: sigil formation notes, derived deterministically from the SAME
      // construction the printed codex draws (chaos method over the question's
      // consonants) — so the notes, the prompt, and the printed sigil agree.
      // Extended with the gematria/kamea reading the Oracle module teaches.
      const profile = deriveSoulProfile(chart);
      const letters = chaosLetters(oracle.question);
      const gv = wordValue(oracle.question);
      const sigilNotes = letters.length >= 2
        ? `Chaos method: the querent's question was distilled to its unique ` +
          `consonants (${letters.join(" · ").toUpperCase()}) and traced as a ` +
          `single unbroken line on a ${letters.length}-point ring. ` +
          `Gematria: the question's letters sum to ${gv}, reducing to the root ` +
          `digit ${reduceDigit(gv)}. Kamea method: the same intention can be ` +
          `traced on the ${planetToKamea(profile.dominantPlanet)} magic square — ` +
          `the planetary kamea answering the chart's dominant ${profile.dominantPlanet}.`
        : undefined;
      // Module inserts: the observatory's other Astra surfaces, woven into the
      // deluxe edition. All client-derived symbolic text — no raw birth data
      // (the life path is a reduced digit; the soul profile is chart-derived).
      const soulProfile =
        `${profile.soulType} (${profile.archetype}) — "${profile.tagline}" ` +
        `${profile.description} Dominant planet: ${profile.dominantPlanet} ` +
        `${profile.dominantGlyph}. ${profile.manifestation} Life themes: ` +
        profile.lifeThemes.map((t) =>
          `House ${t.house} (${t.planets.join(", ")}): ${t.theme} — ${t.focus}`).join("; ") + ".";
      const lpNum = computeLifePath(birth);
      const lp = LIFE_PATH_DATA[lpNum];
      const lifePath = lp
        ? `Life Path ${lpNum} ${lp.glyph} — ${lp.name}. "${lp.tagline}" ` +
          `${lp.frequency} Gift: ${lp.gift} Shadow: ${lp.shadow} ` +
          `Resonance with the dominant element (${profile.dominantElement}): ` +
          getResonance(lpNum, profile.dominantElement)
        : undefined;
      const reflectionSummary = aiResult?.interpretation?.trim()
        ? aiResult.interpretation.trim().slice(0, 1600)
        : undefined;
      const p = await fetchPersonalReport(chart, oracle, {
        date: oracleCtx?.date ?? null,
        generatedAt: oracleCtx?.generatedAt,
        sigilNotes,
        soulProfile,
        lifePath,
        reflectionSummary,
        entitlement,
        reportToken,
      });
      setPersonal(p);
      // Bookshelf: the deluxe edition attaches to its session's shelf entry.
      shelfAttachPersonal(p.seed, {
        report_markdown: p.report_markdown, short_seed: p.short_seed,
        oracle_date: p.oracle_date, ai_source: p.ai_source,
        model: p.model ?? null, spread: p.spread,
      }).catch(() => undefined);
      trackEvent("personal_report", {
        spread: p.spread, source: p.source, ai: p.ai_source, model: p.model ?? "offline",
      });
    } catch (e) {
      if (e instanceof ApiError && e.status === 402 && e.message.includes("purchase")) {
        // PDF-2 gate: the deluxe edition is a separate one-time purchase. A
        // stored claim that bounced is stale (expired/foreign) — drop it so
        // the purchase rail reappears.
        if (reportToken && oracle) { saveReportToken(oracle.seed, null); setReportToken(null); }
        setErr("The deluxe edition is a separate one-time purchase per Oracle "
               + "session — verify your contribution below to unlock it.");
        trackEvent("personal_report_purchase_gated", { spread, source });
      } else if (e instanceof ApiError && e.status === 402) {
        setErr("Oracle tier required — the Personal Report is an optional deluxe "
               + "edition compiled from your Oracle session.");
        openSupport(true);
        trackEvent("personal_report_gated", { spread, source });
      } else if (e instanceof ApiError && e.status === 409) {
        // Post-Oracle gate: the session no longer matches this chart/controls.
        setErr("This Oracle session no longer matches the current chart — "
               + "generate a fresh Oracle Report, then compile the deluxe edition.");
      } else {
        setErr(String(e));
      }
    } finally {
      setPersonalLoading(false);
    }
  }

  // PDF-2 — verify the separate deluxe purchase: the tx hash is checked by the
  // server (on-chain when an RPC is configured) and, if it meets the product
  // price, a report claim bound to THIS Oracle session's seed comes back.
  async function purchaseDeluxe() {
    if (!oracle || purchasing || !purchaseTx.trim()) return;
    setPurchasing(true); setErr(null);
    try {
      const r = await purchasePersonalReport(purchaseTx.trim(), oracle.seed, { entitlement });
      saveReportToken(oracle.seed, r.report_token.token);
      setReportToken(r.report_token.token);
      setPurchaseTx("");
      trackEvent("personal_report_purchase", { verified: r.report_token.verified });
    } catch (e) {
      if (e instanceof ApiError && e.status === 402) {
        setErr("Purchase not verified — " + e.message.replace(/^402:\s*/, ""));
      } else {
        setErr(String(e));
      }
    } finally {
      setPurchasing(false);
    }
  }

  // Phase 4.3 — the same deluxe purchase on the card rail. Stripe is a redirect
  // flow, so we stash which Oracle session this buys BEFORE leaving: the raw
  // seed ends with the question and never travels to Stripe (only its hash
  // rides in the session metadata), which means the browser has to carry it
  // across the redirect itself. The store's completeCheckoutReturn claims it
  // on the way back.
  async function buyDeluxeWithCard() {
    if (!oracle || purchasing) return;
    setPurchasing(true); setErr(null);
    try {
      const { url, session_id } = await reportCheckout(oracle.seed, { entitlement });
      stashPendingReportSeed(session_id, oracle.seed);
      trackEvent("checkout_started", { kind: "deluxe", rail: "card" });
      window.location.href = url;
    } catch (e) {
      if (e instanceof ApiError && e.status === 503) {
        setErr("Card payments aren't enabled on this instance — the crypto rail below still works.");
      } else if (e instanceof ApiError && e.status === 402) {
        setErr("Oracle tier required before the deluxe edition can be purchased.");
      } else {
        setErr(String(e));
      }
      setPurchasing(false);
    }
  }

  // PDF-3 — "Your Personal Audio Companion": narrate the Synthesis + Practices
  // from the deluxe edition. speech.speak routes to ElevenLabs when configured
  // (supporter voice; tts.py sentence-chunks under the 5000-char limit
  // server-side) or the free browser voice otherwise.
  function narrateCompanion() {
    if (!personal) return;
    const parts = personal.report_markdown.split(/\n(?=# )/g);
    const pick = (kw: string) =>
      parts.filter((p) => p.slice(0, 90).toLowerCase().includes(kw));
    // The Oracle core carries "## V. Synthesis"; extract just that subsection.
    const oraclePart = pick("oracle report").join("\n");
    const synthesis = oraclePart
      .split(/\n(?=## )/g)
      .filter((s) => s.slice(0, 40).toLowerCase().includes("synthesis"))
      .join("\n");
    const practices = pick("practices").join("\n");
    const text = [synthesis, practices].filter(Boolean).join("\n\n")
      || parts[parts.length - 1];   // fallback: closing part
    speech.speak(speakableText(text));
    trackEvent("personal_report_narrate", { engine: speech.engine });
  }

  async function printPersonalReport() {
    if (!personal) return;
    // Shared with the Bookshelf's reprint path (lib/tomePrint.ts) — the live
    // chart is reused here; a shelved session re-casts it on-device.
    const ok = await printSessionTome({
      reportMarkdown: personal.report_markdown,
      seed: personal.seed,
      spread: personal.spread,
      source: oracle?.source ?? source,
      question: oracle?.question || "astra arcana",
      lineage: oracle?.lineage,
      date: oracleCtx?.date ?? null,
      oracleDate: personal.oracle_date,
      birth: birth ?? null,
      chart,
    });
    if (!ok) setErr("Popup blocked — allow popups for this site to print the report.");
    else trackEvent("personal_report_print", { spread: personal.spread });
  }

  function downloadMarkdown(md: string, name: string) {
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function exportCalendar(kind: "ritual" | "journal") {
    if (!chart) return;
    setErr(null);
    try {
      await downloadArcanaCalendar(chart, { days: 7, source, kind, entitlement });
      trackEvent("arcana_calendar_export", { kind, source });
    } catch (e) {
      setErr(String(e));
    }
  }

  function copy(text: string) {
    navigator.clipboard?.writeText(text).catch(() => undefined);
  }

  // Geometry for the spread that was actually DEALT, not the one the picker is
  // showing — changing the picker after a draw must not re-arrange the cards on
  // the cloth in front of you.
  const drawLayout = reading ? layoutFor(reading.spread) : null;

  return (
    <div className="arcana-modal">
        <div className="arcana-header">
          <div>
            <h2 className="arcana-title">✶ Astra Arcana</h2>
            <p className="arcana-sub">
              Your chart is the geometry of arrival. The cards are mirrors for translating
              it into action, beauty, and self-knowledge.
            </p>
          </div>
        </div>

        <div className="arcana-tabs">
          {([
            ["natal", "Natal Arcana"],
            ["draw", "Draw"],
            ["transit", "Transit Cards"],
            ["classroom", "Classroom"],
            ["studio", "Studio"],
          ] as [Tab, string][]).map(([id, label]) => (
            <button
              key={id}
              className={`arcana-tab ${tab === id ? "is-active" : ""}`}
              onClick={() => {
                setTab(id);
                if (id === "transit" && !forecast) loadForecast();
                if (id === "classroom" && !path) loadPath();
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="arcana-body">
          {!chart && <p className="arc-empty">Cast your chart first to open the Arcana.</p>}
          {err && <p className="arc-error">{err}</p>}

          {/* ── Natal Arcana ─────────────────────────────────────────── */}
          {tab === "natal" && sig && (
            <div className="arc-natal">
              {/* The day's card leads the chapter: it is the one reading that
                  is true right now without anyone asking for it, and it is the
                  same draw the morning notification and the home-screen widget
                  show. Deterministic from (chart, date) — see dailyOracle.ts. */}
              <DailyCardPanel />
              <div className="arc-meta">
                <span>Dominant element: <b>{sig.dominant_element}</b></span>
                <span>Modality: <b>{sig.dominant_modality}</b></span>
              </div>
              <div className="arc-link-grid">
                {sig.links.map((l) => (
                  <div key={l.body} className="arc-link-card mg-sel"
                       onClick={() => setMargin({
                         title: l.card.name,
                         subtitle: l.body,
                         chips: [
                           ...(l.sign ? [l.sign] : []),
                           ...(l.house ? [`house ${l.house}`] : []),
                         ],
                         body: [l.note],
                       })}>
                    <div className="arc-link-body">{l.body}</div>
                    <CardChip name={l.card.name} />
                    <div className="arc-link-note">{l.note}</div>
                  </div>
                ))}
              </div>
              <div className="arc-themes">
                <p><b>Strongest archetypes:</b> {sig.themes.join(", ")}</p>
                <p><b>Growth-ward / quieter:</b> {sig.shadows.join(", ") || "in balance"}</p>
              </div>
            </div>
          )}

          {/* ── Draw ─────────────────────────────────────────────────── */}
          {tab === "draw" && chart && (
            <div className="arc-draw">
              <div className="arc-draw-controls">
                <label>Spread
                  <select value={spread} onChange={(e) => setSpread(e.target.value as SpreadType)}>
                    {SPREAD_GROUPS.map((g) => (
                      <optgroup key={g} label={g}>
                        {SPREADS.filter((s) => s.group === g).map((s) =>
                          <option key={s.id} value={s.id}>{s.label}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </label>
                <label>Lineage
                  <select value={source} onChange={(e) => setSource(e.target.value as SourceSystem)}>
                    {(Object.keys(SOURCE_LABELS) as SourceSystem[]).map((s) =>
                      <option key={s} value={s}>{SOURCE_LABELS[s]}</option>)}
                  </select>
                </label>
                <label className="arc-q">Question
                  <input value={question} onChange={(e) => setQuestion(e.target.value)} />
                </label>
                <label className="arc-ai-toggle" title={isSupporter ? "" : "Supporter feature"}>
                  <input type="checkbox" checked={useAi && isSupporter}
                         disabled={!isSupporter}
                         onChange={(e) => {
                           if (!isSupporter) { openSupport(true); return; }
                           setUseAi(e.target.checked);
                         }} />
                  AI reading {isSupporter ? "" : "🔒"}
                </label>
                <button className="arc-draw-btn" onClick={draw} disabled={loading}>
                  {loading ? "Drawing…" : "Draw"}
                </button>
              </div>

              {reading && (
                <div className="arc-reading">
                  <div
                    className={`arc-cards-row${drawLayout ? " arc-cards-row--geo" : ""}`}
                    style={drawLayout ? gridStyle(drawLayout) : undefined}
                  >
                    {reading.cards.map((c, ci) => (
                      <TarotCard
                        key={c.position}
                        gridArea={drawLayout?.cells[ci]}
                        landscape={drawLayout?.landscape?.includes(ci)}
                        position={c.position}
                        revealed={!!revealed[c.position]}
                        onReveal={() => {
                          setRevealed((p) => ({ ...p, [c.position]: true }));
                          trackEvent("arcana_card_turned", { position: c.position, spread });
                          // Turning a card is also selecting it — publish to
                          // the margin in the same intent, no second tap owed.
                          setMargin({
                            title: `${c.card.name}${c.reversed ? " (reversed)" : ""}`,
                            subtitle: c.position,
                            body: [c.meaning],
                            action: c.activity ?? undefined,
                            journal: {
                              seed: reading.seed, position: c.position,
                              prompt: c.journal_prompt ?? null,
                              cardName: c.card.name, question: reading.question,
                            },
                          });
                        }}
                      >
                      <div className="arc-drawn mg-sel"
                           onClick={() => setMargin({
                             title: `${c.card.name}${c.reversed ? " (reversed)" : ""}`,
                             subtitle: c.position,
                             body: [c.meaning],
                             action: c.activity ?? undefined,
                             journal: {
                               seed: reading.seed, position: c.position,
                               prompt: c.journal_prompt ?? null,
                               cardName: c.card.name, question: reading.question,
                             },
                           })}>
                        <div className="arc-drawn-pos">{c.position}</div>
                        <CardChip name={c.card.name} reversed={c.reversed} />
                        {/* The plate, if this card has ever been rendered —
                            free, offline, and the same image the Studio made.
                            Offers to paint one when it hasn't. */}
                        <CardPlate
                          cardId={c.card.id}
                          cardName={c.card.name}
                          source={source}
                          reversed={c.reversed}
                          onRender={() => void paintPlate(c.card.id)}
                          rendering={plateLoading === c.card.id}
                        />
                        <p className="arc-drawn-meaning">{c.meaning}</p>
                        {c.weight_sources.length > 0 && (
                          <div className="arc-why" style={{ marginTop: 6, fontSize: "0.72rem", opacity: 0.78 }}
                               title="Why this card was likely — from the actual draw weights">
                            <div style={{ textTransform: "uppercase", letterSpacing: "0.08em", fontSize: "0.6rem", opacity: 0.7 }}>why this card</div>
                            <ul style={{ margin: "2px 0 0", paddingLeft: 14 }}>
                              {c.weight_sources.map((w, i) => (
                                <li key={i}>{w.label}{w.weight ? ` (+${w.weight.toFixed(2)})` : ""}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {c.activity && <p className="arc-drawn-act">✦ {c.activity}</p>}
                        {c.journal_prompt && <p className="arc-drawn-journal">✎ {c.journal_prompt}</p>}
                        {c.journal_prompt && reading && (
                          <JournalPad
                            seed={reading.seed}
                            position={c.position}
                            prompt={c.journal_prompt}
                            cardName={c.card.name}
                            question={reading.question}
                          />
                        )}
                      </div>
                      </TarotCard>
                    ))}
                    {drawLayout && <p className="arc-geo-note">{drawLayout.note}</p>}
                  </div>
                  <div className="arc-interp">
                    <div className="arc-interp-head">
                      Reading · <span className="arc-lineage" style={{ opacity: 0.8, fontWeight: 400 }}>{SOURCE_LABELS[reading.source]}</span>
                      {reading.ai_source === "llm" && <span className="arc-badge">AI</span>}
                      {reading.ai_source === "offline" && <span className="arc-badge arc-badge--off">offline</span>}
                    </div>
                    <pre className="arc-interp-text">{reading.interpretation}</pre>
                    <button className="ghost arc-copy" onClick={() => copy(reading.interpretation)}>copy</button>
                  </div>
                  {/* R-4 voice sweep: the per-module disclaimers collapsed into
                      the chapter refrain footer — one line, said the way the
                      instrument means it. */}
                </div>
              )}

              {/* ── Oracle Report — the deepest offering (oracle tier) ── */}
              <div className="arc-oracle" style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.12)" }}>
                {!oracle && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <button className={`arc-draw-btn ${oracleLoading ? "is-live" : ""}`} onClick={loadOracleReport} disabled={oracleLoading}>
                      {oracleLoading ? "Consulting the Oracle… (this can take a minute)" : "✧ Generate Oracle Report"}
                    </button>
                    <span style={{ opacity: 0.7, fontSize: "0.78rem" }}>
                      The observatory's deepest reading — a long-form Claude Fable&nbsp;5 synthesis
                      of your signature, spread, and learning path. <b>Oracle tier only.</b> Uses
                      the spread, lineage, and question above.
                    </span>
                  </div>
                )}

                {oracle && (
                  <div className="arc-oracle-report">
                    <div className="arc-interp-head">
                      Oracle Report ·{" "}
                      <span className="arc-lineage" style={{ opacity: 0.8, fontWeight: 400 }}>{oracle.lineage}</span>
                      {oracle.ai_source === "llm" && (
                        <span className="arc-badge" title={`Served by ${oracle.model ?? "AI"}`}>
                          {ORACLE_MODEL_LABELS[oracle.model ?? ""] ?? oracle.model ?? "AI"}
                        </span>
                      )}
                      {oracle.ai_source === "offline" && (
                        <span className="arc-badge arc-badge--off"
                              title="The AI layer was unavailable — this report was assembled entirely by the deterministic engine.">
                          Deterministic offline report
                        </span>
                      )}
                    </div>

                    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", margin: "6px 0 10px", fontSize: "0.75rem", opacity: 0.8 }}>
                      <span>
                        seed&nbsp;
                        <code style={{ userSelect: "all", wordBreak: "break-all" }}>{oracle.seed}</code>
                      </span>
                      <button className="ghost" title="Copy the deterministic seed — the draw is reproducible from it"
                              onClick={() => copy(oracle.seed)}>copy seed</button>
                    </div>

                    <Interpretation
                      text={oracle.report}
                      onSpeak={(body) => speech.speak(speakableText(body))}
                    />

                    <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                      <button className="ghost arc-copy" onClick={() => copy(oracle.report)}>copy report</button>
                      {speech.supported && (
                        speech.speaking
                          ? <button className="ghost" onClick={() => speech.stop()}>■ stop</button>
                          : <button className="ghost" onClick={() => speech.speak(speakableText(oracle.report))}>🔊 speak report</button>
                      )}
                      <button className="ghost" onClick={loadOracleReport} disabled={oracleLoading}>
                        {oracleLoading ? "Consulting…" : "regenerate"}
                      </button>
                    </div>

                    {/* ── Deluxe Edition — optional post-Oracle product ── */}
                    <div className="arc-personal" style={{ marginTop: 14, paddingTop: 12, borderTop: "1px dashed rgba(255,255,255,0.18)" }}>
                      {!personal && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          <span style={{ opacity: 0.7, fontSize: "0.78rem" }}>
                            <b>Deluxe Compiled Edition</b> — an optional post-Oracle product,
                            purchased separately per Oracle session: your session expanded into a
                            research-paper-style personal report (natal deep-dive, tarot layout,
                            career & relationship inserts, practices, appendix) as PDF-ready markdown.
                          </span>
                          {/* PDF-2 — the separate purchase rail. The server is the source of
                              truth (402 without a valid claim); dev/admin tokens compile
                              directly via the ghost button below. */}
                          {!reportToken && (
                            <>
                              {/* Phase 4.3 — the card rail, beside the original
                                  crypto one. Hidden entirely when Stripe isn't
                                  configured, rather than 503ing on click. */}
                              {pricing?.card_available && (
                                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                  <button
                                    className={`arc-draw-btn deluxe-buy-card ${purchasing ? "is-live" : ""}`}
                                    onClick={buyDeluxeWithCard}
                                    disabled={purchasing}
                                  >
                                    {purchasing
                                      ? "Opening checkout…"
                                      : `✦ Buy with card · $${pricing.report_usd}`}
                                  </button>
                                  <span style={{ opacity: 0.6, fontSize: "0.72rem" }}>
                                    One-time, for this Oracle session. You'll return here unlocked.
                                  </span>
                                </div>
                              )}
                              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                <input
                                  value={purchaseTx}
                                  onChange={(e) => setPurchaseTx(e.target.value)}
                                  placeholder="contribution tx hash (0x…)"
                                  style={{ flex: "1 1 220px", minWidth: 180 }}
                                />
                                <button className="arc-draw-btn" onClick={purchaseDeluxe}
                                        disabled={purchasing || !purchaseTx.trim()}>
                                  {purchasing ? "Verifying…" : "✧ Verify deluxe purchase"}
                                </button>
                                <button className="ghost" onClick={loadPersonalReport} disabled={personalLoading}
                                        title="If your entitlement already carries deluxe access, compile directly.">
                                  {personalLoading ? "Compiling…" : "already unlocked? compile"}
                                </button>
                              </div>
                              <span style={{ opacity: 0.6, fontSize: "0.72rem" }}>
                                {pricing?.card_available && <>Or pay in crypto: s</>}
                                {!pricing?.card_available && <>S</>}end the deluxe-edition
                                contribution to the observatory treasury (the <b>♥ Support</b>{" "}
                                panel has the address), then paste the tx hash here. The claim
                                unlocks <i>this</i> Oracle session's edition.
                              </span>
                            </>
                          )}
                          {reportToken && (
                            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                              <button className={`arc-draw-btn ${personalLoading ? "is-live" : ""}`} onClick={loadPersonalReport} disabled={personalLoading}>
                                {personalLoading ? "Compiling the deluxe edition… (this can take minutes)" : "✦ Compile Personal Report"}
                              </button>
                              <span style={{ opacity: 0.7, fontSize: "0.76rem", color: "var(--gold-soft)" }}>
                                ✓ deluxe purchase verified for this session
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {personal && (
                        <div className="arc-personal-report">
                          <div className="arc-interp-head">
                            Personal Report ·{" "}
                            <span className="arc-lineage" style={{ opacity: 0.8, fontWeight: 400 }}>{personal.lineage}</span>
                            {personal.ai_source === "llm" && (
                              <span className="arc-badge" title={`Served by ${personal.model ?? "AI"}`}>
                                {ORACLE_MODEL_LABELS[personal.model ?? ""] ?? personal.model ?? "AI"}
                              </span>
                            )}
                            {personal.ai_source === "offline" && (
                              <span className="arc-badge arc-badge--off"
                                    title="The AI layer was unavailable — this edition was compiled entirely by the deterministic engine.">
                                Deterministic offline edition
                              </span>
                            )}
                          </div>
                          <p style={{ fontSize: "0.75rem", opacity: 0.75, margin: "4px 0 8px" }}>
                            Compiled from your Oracle session of {personal.oracle_date} · seed{" "}
                            <code style={{ userSelect: "all" }}>{personal.short_seed || personal.seed.slice(0, 12)}</code>
                          </p>

                          {/* Top-level part preview — the full render is the PDF pipeline's job. */}
                          <div style={{ maxHeight: 320, overflowY: "auto", fontSize: "0.82rem" }}>
                            {personal.report_markdown.split(/\n(?=# )/g).map((part, i) => {
                              const nl = part.indexOf("\n");
                              const title = part.startsWith("# ") ? part.slice(2, nl === -1 ? undefined : nl) : "Preamble";
                              const body = part.startsWith("# ") && nl !== -1 ? part.slice(nl + 1) : part;
                              return (
                                <details key={i} open={i === 0}>
                                  <summary style={{ cursor: "pointer", color: "var(--gold-soft)" }}>{title}</summary>
                                  <pre className="arc-interp-text" style={{ whiteSpace: "pre-wrap" }}>{body}</pre>
                                </details>
                              );
                            })}
                          </div>

                          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                            <button className="ghost arc-copy" onClick={printPersonalReport}
                                    title="Styled print document — use the dialog's 'Save as PDF'">
                              ⎙ print / save as PDF
                            </button>
                            <button className="ghost arc-copy"
                                    onClick={() => downloadMarkdown(personal.report_markdown,
                                      `astra-personal-report-${personal.oracle_date}.md`)}>
                              ↓ download .md
                            </button>
                            <button className="ghost" onClick={() => copy(personal.report_markdown)}>copy markdown</button>
                            {speech.supported && (
                              speech.speaking || speech.loading
                                ? <button className="ghost" onClick={() => speech.stop()}>■ stop narration</button>
                                : <button className="ghost" onClick={narrateCompanion}
                                          title="Narrates the Synthesis and Practices — your Personal Audio Companion">
                                    🔊 audio companion
                                  </button>
                            )}
                            <button className="ghost" onClick={loadPersonalReport} disabled={personalLoading}>
                              {personalLoading ? "Compiling…" : "recompile"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Transit Cards (Phase 7) ──────────────────────────────── */}
          {tab === "transit" && (
            <div className="arc-transit">
              {forecast && forecast.cards.length > 0 && (
                <div className="arc-cal-export" style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
                  <span style={{ opacity: 0.75, fontSize: "0.8rem" }}>Export to calendar (.ics):</span>
                  <button className="ghost" onClick={() => exportCalendar("ritual")}>✦ Rituals</button>
                  <button className="ghost" onClick={() => exportCalendar("journal")}>✎ Journal prompts</button>
                </div>
              )}
              {loading && <p className="arc-empty">Reading the sky…</p>}
              {forecast && forecast.cards.length === 0 && (
                <p className="arc-empty">No notable activations in the next {forecast.days} days.</p>
              )}
              {forecast?.cards.map((d) => (
                <div key={d.date} className="arc-day mg-sel"
                     onClick={() => setMargin({
                       title: `${d.card.name}${d.reversed ? " (reversed)" : ""}`,
                       subtitle: `${d.date} · ${d.transit_summary}`,
                       body: [d.lesson],
                       action: d.alignment_action,
                       journal: {
                         seed: `arcana-day:${d.date}`, position: d.date,
                         prompt: d.journal_prompt, cardName: d.card.name,
                         question: d.transit_summary,
                       },
                     })}>
                  <div className="arc-day-head">
                    <span className="arc-day-date">{d.date}</span>
                    <span className="arc-day-transit">{d.transit_summary}</span>
                    <CardChip name={d.card.name} reversed={d.reversed} />
                  </div>
                  <p className="arc-day-lesson">{d.lesson}</p>
                  <p className="arc-day-action">✦ {d.alignment_action}</p>
                  <p className="arc-drawn-journal">✎ {d.journal_prompt}</p>
                </div>
              ))}
            </div>
          )}

          {/* ── Classroom (Phase 5) ──────────────────────────────────── */}
          {tab === "classroom" && (
            <div className="arc-classroom">
              {/* Generated learning path — a chart-anchored archetypal sequence. */}
              {loading && !path && <p className="arc-empty">Charting your path…</p>}
              {path && (
                <div className="arc-path" style={{ marginBottom: 18 }}>
                  <div className="arc-path-head" style={{ marginBottom: 8 }}>
                    <b>Your learning path</b>{" "}
                    <span style={{ opacity: 0.75 }}>
                      — {path.anchor} → {path.growth_edge} · {path.lineage}
                    </span>
                  </div>
                  {/* R-4: the path drawn like sky, not listed like homework.
                      A star's lesson opens in the margin; a kept reflection
                      lights it on the next visit. */}
                  <ConstellationPath
                    stars={path.steps.map((s) => ({
                      order: s.order, stage: s.stage, name: s.card.name,
                      walked: walked.has(s.order),
                    }))}
                    onSelect={(order) => {
                      const s = path.steps.find((st) => st.order === order);
                      if (!s) return;
                      setMargin({
                        title: s.card.name,
                        subtitle: `${s.stage} · step ${s.order} of ${path.steps.length}`,
                        body: [s.focus],
                        action: s.practice,
                        journal: {
                          seed: `path:${path.anchor}→${path.growth_edge}`,
                          position: `${s.order} · ${s.card.name}`,
                          prompt: s.journal, cardName: s.card.name,
                        },
                      });
                    }}
                  />
                  <p className="cp-hint">
                    select a star — its lesson opens in the margin; keep a
                    reflection there and the star stays lit
                  </p>

                  {/* ── The Course — Fable-written curriculum over this path ── */}
                  <hr style={{ opacity: 0.2, margin: "14px 0" }} />
                  <div className="arc-course">
                    <div style={{ opacity: 0.7, fontSize: "0.8rem", marginBottom: 6 }}>
                      The Course — your path, taught. Claude Fable 5 writes a personal
                      curriculum over these steps (oracle tier; works offline as a
                      deterministic study guide).
                    </div>
                    <div className="arc-draw-controls">
                      <label style={{ flex: 1 }}>Focus
                        <input
                          value={courseFocus}
                          onChange={(e) => setCourseFocus(e.target.value)}
                          placeholder="what should this course teach you?"
                        />
                      </label>
                      <button className={`arc-draw-btn ${courseLoading ? "is-live" : ""}`} onClick={loadCourse} disabled={courseLoading}>
                        {courseLoading ? "Composing…" : "✶ Compose my course"}
                      </button>
                    </div>
                    {courseLoading && (
                      <p className="arc-empty">
                        {coursePartial
                          ? "Composing your curriculum — it is being written below…"
                          : "Composing your curriculum — a full course takes a few minutes…"}
                      </p>
                    )}
                    {courseLoading && coursePartial && (
                      // The curriculum as it arrives. Deliberately plain text
                      // rather than the rendered Interpretation: half a document
                      // formats badly, and a heading that reformats itself as the
                      // next line lands reads as a glitch. The done frame swaps
                      // this for the finished, rendered course.
                      <div className="arc-oracle-report" style={{ marginTop: 10, opacity: 0.75 }}>
                        <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{coursePartial}</p>
                      </div>
                    )}
                    {course && (
                      <div className="arc-oracle-report" style={{ marginTop: 10 }}>
                        <div className="arc-interp-head">
                          ✶ {course.anchor} → {course.growth_edge} · {course.lessons} lessons
                          <span className="arc-badge" style={{ marginLeft: 8 }}>
                            {course.ai_source === "llm"
                              ? (ORACLE_MODEL_LABELS[course.model ?? ""] ?? course.model)
                              : "offline study guide"}
                          </span>
                          <button className="ghost arc-copy" onClick={() => copy(course.course)}>copy</button>
                        </div>
                        <Interpretation text={course.course} />
                      </div>
                    )}
                  </div>

                  <hr style={{ opacity: 0.2, margin: "14px 0" }} />
                  <div style={{ opacity: 0.7, fontSize: "0.8rem", marginBottom: 6 }}>Archetype reference</div>
                </div>
              )}
              {CLASSROOM.map((l) => (
                <details key={l.title} className="arc-lesson">
                  <summary>{l.title} — <i>{l.summary}</i></summary>
                  <p><b>Symbol:</b> {l.symbolic}</p>
                  <p><b>Astrology:</b> {l.astrology}</p>
                  <p><b>Tarot:</b> {l.tarot}</p>
                  <p><b>Shadow:</b> {l.shadow}</p>
                  <p><b>Balanced:</b> {l.balanced}</p>
                  <p><b>Practice:</b> {l.practice}</p>
                  <p className="arc-drawn-journal">✎ {l.journal}</p>
                </details>
              ))}
            </div>
          )}

          {/* ── Studio (Phase 6) ─────────────────────────────────────── */}
          {tab === "studio" && sig && (
            <div className="arc-studio">
              <div className="arc-studio-btns">
                {EXPRESSION_KINDS.map((k) => (
                  <button key={k.kind} className="ghost"
                          onClick={() => { setArtifact(generateArtifact(k.kind, sig)); trackEvent("arcana_artifact", { kind: k.kind }); }}>
                    {k.label}
                  </button>
                ))}
              </div>
              {artifact && (
                <div className="arc-artifact">
                  <div className="arc-interp-head">{artifact.title}
                    <button className="ghost arc-copy" onClick={() => copy(artifact.body)}>copy</button>
                  </div>
                  <pre className="arc-interp-text">{artifact.body}</pre>
                </div>
              )}

              {/* ── Deck-art prompts (Phase 4) — deterministic, prompt-only ── */}
              <hr style={{ opacity: 0.2, margin: "16px 0" }} />
              <div style={{ opacity: 0.7, fontSize: "0.8rem", marginBottom: 6 }}>
                Deck-art prompts — art-direction briefs from your chart, for the image tool of your choice
              </div>
              <div className="arc-draw-controls">
                <label>Card
                  <select value={deckCard} onChange={(e) => setDeckCard(e.target.value)}>
                    <option value="">Whole soul deck</option>
                    <optgroup label="Your signature">
                      {signatureOptions.map((o) => (
                        <option key={o.id} value={o.id}>{signatureOptionLabel(o)}</option>
                      ))}
                    </optgroup>
                    {deckGroups.map((g) => (
                      <optgroup key={g.label} label={g.label}>
                        {g.cards.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>
                <label>Lineage
                  <select value={source} onChange={(e) => setSource(e.target.value as SourceSystem)}>
                    {(Object.keys(SOURCE_LABELS) as SourceSystem[]).map((s) =>
                      <option key={s} value={s}>{SOURCE_LABELS[s]}</option>)}
                  </select>
                </label>
                <button className="arc-draw-btn" onClick={loadDeckArt} disabled={loading}>
                  {loading ? "Composing…" : "Compose prompts"}
                </button>
              </div>
              {deckArt && (
                <div className="arc-deck-art">
                  <div style={{ opacity: 0.75, fontSize: "0.8rem", margin: "8px 0" }}>
                    {deckArt.lineage} · {deckArt.prompts.length} prompt{deckArt.prompts.length === 1 ? "" : "s"}
                  </div>
                  {deckArt.prompts.map((p) => (
                    <div key={p.card.id} className="arc-artifact" style={{ marginBottom: 10 }}>
                      <div className="arc-interp-head">{p.title}
                        <button className="ghost arc-copy" onClick={() => copy(p.prompt)}>copy</button>
                        <button
                          className={`ghost arc-copy ${plateLoading === p.card.id ? "is-live" : ""}`}
                          title="Paint this brief into a card plate (oracle tier; paid image generation)"
                          onClick={() => paintPlate(p.card.id)}
                          disabled={plateLoading !== null}
                        >
                          {plateLoading === p.card.id ? "painting…" : "◈ render plate"}
                        </button>
                      </div>
                      <pre className="arc-interp-text">{p.prompt}</pre>
                      {p.natal_context && (
                        <p className="arc-drawn-act" style={{ margin: "4px 0 0" }}>✦ {p.natal_context}</p>
                      )}
                      <p style={{ opacity: 0.6, fontSize: "0.72rem", margin: "4px 0 0" }}>
                        avoid: {p.negative_prompt}
                      </p>
                      {plates[p.card.id] && (
                        <div className="arc-plate" style={{ marginTop: 8 }}>
                          <img
                            src={`data:image/png;base64,${plates[p.card.id].image_b64}`}
                            alt={plates[p.card.id].title}
                            style={{ width: "100%", maxWidth: 340, borderRadius: 8,
                                     border: "1px solid var(--amethyst, #7a5cc4)" }}
                          />
                          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
                            <span style={{ opacity: 0.6, fontSize: "0.72rem" }}>
                              {plates[p.card.id].model} · {plates[p.card.id].size} · {plates[p.card.id].quality}
                            </span>
                            <button className="ghost arc-copy" onClick={() => downloadPlate(plates[p.card.id])}>
                              ↓ save .png
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
    </div>
  );
};
