// App.tsx — the observatory shell.
import React, { useEffect, useMemo, useState } from "react";
import { useStore } from "./store/useStore";
import { Controls } from "./components/Controls";
import { ChartWheel } from "./components/ChartWheel";
import { DetailPanel } from "./components/DetailPanel";
import { TransitSlider } from "./components/TransitSlider";
import { SupportModal } from "./components/SupportModal";
import { GlossaryPanel } from "./components/GlossaryPanel";
import { SoulProfileModal } from "./components/SoulProfileModal";
import { OracleModal } from "./components/OracleModal";
import { Starfield } from "./components/Starfield";
import { CeremonyModal } from "./components/CeremonyModal";
import { ForecastPanel } from "./components/ForecastPanel";
import { ArcanaModal } from "./components/ArcanaModal";
import { BookshelfModal } from "./components/BookshelfModal";
import { LibraryVault } from "./components/LibraryVault";
import { GalleryPanel } from "./components/GalleryPanel";
import { TomeMeter } from "./components/TomeMeter";
import { RelationshipModal } from "./components/RelationshipModal";
import { PredictiveModal } from "./components/PredictiveModal";
import { AdvancedModal } from "./components/AdvancedModal";
import { AdminPanel } from "./components/AdminPanel";
import { InstallPrompt } from "./components/InstallPrompt";
import { MorningPanel } from "./components/MorningPanel";
import { ChapterDial, type Chapter, CHAPTERS } from "./components/ChapterDial";
import { deriveSoulProfile } from "./lib/archetypes";
import { trackEvent } from "./api/client";

export const App: React.FC = () => {
  const generate = useStore((s) => s.generate);
  const chart = useStore((s) => s.chart);
  const chartFromCache = useStore((s) => s.chartFromCache);
  const chartFromLocal = useStore((s) => s.chartFromLocal);
  const isSupporter = useStore((s) => s.isSupporter);
  const openSupport = useStore((s) => s.openSupport);
  const validateEntitlement = useStore((s) => s.validateEntitlement);
  const flushAskQueue = useStore((s) => s.flushAskQueue);
  const queuedAsks = useStore((s) => s.queuedAsks);
  const setMargin = useStore((s) => s.setMargin);
  const completeCheckoutReturn = useStore((s) => s.completeCheckoutReturn);
  const checkoutNote = useStore((s) => s.checkoutNote);
  const checkoutBusy = useStore((s) => s.checkoutBusy);
  const setCheckoutNote = useStore((s) => s.setCheckoutNote);
  const isCurrentSky = useStore((s) => s.isCurrentSky);
  const birth = useStore((s) => s.birth);
  // Track R (R-1): the seven masthead module buttons became the chapter dial.
  // Chapter I = the wheel at home; II–VIII mount the former modals' content
  // in the stage, unchanged (their chrome retires in R-2).
  const [chapter, setChapter] = useState<Chapter>("I");
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  // Track E-1: the ceremony is a door, not a toll gate. It no longer opens
  // itself on a first visit — the live sky does the arguing first, and this
  // opens when the visitor asks for their own chart.
  const [ceremonyOpen, setCeremonyOpen] = useState(false);
  const soulProfile = useMemo(() => (chart ? deriveSoulProfile(chart) : null), [chart]);
  // The moment the arrival wheel is cast for, in the visitor's own clock —
  // said plainly so "right now" is checkable rather than asserted.
  const showThreshold = chapter === "I" && isCurrentSky;
  const skyMoment = useMemo(
    () =>
      new Date(birth.year, birth.month - 1, birth.day, birth.hour, birth.minute)
        .toLocaleString(undefined, { day: "numeric", month: "long", hour: "numeric", minute: "2-digit" }),
    [birth],
  );

  // Cast the default chart on first mount so the observatory is alive immediately.
  useEffect(() => {
    if (!chart) generate();
    validateEntitlement();
    // Returning from Stripe? The params were captured + scrubbed at module
    // load; this settles the mint (no-op on an ordinary visit).
    completeCheckoutReturn();
    // Deep-link: /#support opens the support panel directly (shareable).
    if (window.location.hash === "#support") openSupport(true);
    if (window.location.hash === "#admin") setAdminOpen(true);
    // Fire any asks queued while offline, now and whenever the network returns.
    flushAskQueue();
    const onOnline = () => flushAskQueue();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openChapter = (ch: Chapter) => {
    setChapter(ch);
    // A margin selection belongs to the chapter that published it — leaving
    // the chapter clears it, and chapter I falls back to chart detail.
    setMargin(null);
    trackEvent("chapter_opened", { chapter: ch });
  };

  // R-3: Soul Profile and the Oracle are chapter II surfaces now — the old
  // launcher buttons deep-scroll to them inside the Reading chapter.
  const openReadingAt = (selector: string) => {
    openChapter("II");
    window.setTimeout(() => {
      document.querySelector(selector)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);
  };

  // Ergonomic law: hands on keys. 1–8 jump chapters, Esc is always home,
  // "/" focuses Ask in the margin's foot. Never hijacked while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (e.key === "Escape") { setChapter("I"); setMargin(null); return; }
      if (e.key === "/") {
        e.preventDefault();
        document.getElementById("margin-ask")?.focus();
        return;
      }
      const i = "12345678".indexOf(e.key);
      if (i >= 0) openChapter(CHAPTERS[i].ch);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
    <Starfield />
    {ceremonyOpen && (
      <CeremonyModal
        onClose={() => {
          localStorage.setItem("aae.ceremony_shown", "1");
          setCeremonyOpen(false);
        }}
      />
    )}
    <div className={`app${showThreshold ? " has-threshold" : ""}`}>
      <header className="masthead">
        <h1>☤ Astra</h1>
        <div className="sub">
          Natal observatory · celestial cartography · oracle
        </div>
        <div className="masthead-actions">
          {/* Track R (R-3): the masthead pill is identity — support & unlock
              live in the Library (chapter VIII) now; 402 gates still open the
              support overlay directly. */}
          <button
            className={`support-pill ${isSupporter ? "is-supporter" : ""}`}
            title="Support & unlock lives in the Library"
            onClick={() => openChapter("VIII")}
          >
            {isSupporter ? "✦ Supporter" : "☤ Support / Unlock"}
          </button>
          {isSupporter && (
            <button
              className="ghost"
              style={{ fontSize: 10, padding: "2px 8px", width: "auto", opacity: 0.45 }}
              title="Observatory stats (oracle)"
              onClick={() => setAdminOpen(true)}
            >
              ⊙ stats
            </button>
          )}
        </div>
      </header>

      <SupportModal />
      {glossaryOpen && <GlossaryPanel onClose={() => setGlossaryOpen(false)} />}
      {adminOpen && <AdminPanel onClose={() => setAdminOpen(false)} />}

      {/* E-1b: the arrival privacy BANNER retires. The disclosure does not —
          it moves into the threshold's fine print below, where it is read
          rather than dismissed, and the birth-data claim (the one people are
          actually anxious about) moves to the ceremony's birth-time field.
          The dead `href="#"` link went with it: a link that goes nowhere is
          worse than plain text. M3 gives these a real /legal page. */}

      <Controls
        onOpenGlossary={() => { setGlossaryOpen(true); trackEvent("glossary_opened"); }}
        onOpenSoul={() => { openReadingAt(".soul-modal"); trackEvent("soul_profile_opened"); }}
        onOpenOracle={() => { openReadingAt(".oracle-modal"); trackEvent("oracle_opened"); }}
        onOpenForecast={() => openChapter("III")}
        onNewChart={() => setCeremonyOpen(true)}
      />

      {/* The Stripe redirect lands back here. Outside the chapter switch so the
          verdict is visible wherever the customer returns to. */}
      {(checkoutNote || checkoutBusy) && (
        <div className={`checkout-note ${checkoutBusy ? "is-live" : ""}`} role="status">
          <span>{checkoutBusy ? "Confirming your purchase with Stripe…" : checkoutNote}</span>
          {!checkoutBusy && (
            <button className="ghost checkout-note-ok" onClick={() => setCheckoutNote(null)}>
              OK
            </button>
          )}
        </div>
      )}

      {/* Track E-1, the threshold. The instrument is already running below it;
          this says what it is and offers the one door. It retires the moment
          the wheel becomes somebody's own chart. */}
      {showThreshold && (
        <div className="threshold">
          <div className="threshold-say">
            <p className="threshold-title">The sky right now</p>
            <p className="threshold-sub">
              Computed on your device — <span className="th-live">live</span>, no
              account, nothing sent anywhere. This is the real sky over {skyMoment}.
            </p>
          </div>
          <div className="threshold-do">
            <button
              className="threshold-primary"
              onClick={() => { setCeremonyOpen(true); trackEvent("threshold_enter"); }}
            >
              Show me my sky →
            </button>
            <button
              className="ghost threshold-second"
              onClick={() => { setGlossaryOpen(true); trackEvent("threshold_glossary"); }}
            >
              What am I looking at?
            </button>
          </div>
          <p className="threshold-fine">
            Free forever — the unlock is for the written work, never the maths.
            Usage is counted anonymously (which features get used, never your
            chart or your questions); no personal identity is stored.
          </p>
        </div>
      )}

      {/* E-1b: not on the threshold. A stranger meeting today's tarot card
          before they have a chart is the esoteric-first door E-1 exists to
          move; the panel greets people who have one. */}
      {chapter === "I" && !isCurrentSky && <MorningPanel />}

      <div className={`wheel-area ${chapter !== "I" ? "has-chapter" : ""}`}>
        {chapter === "I" ? (
          <>
            {chartFromCache && (
              <div className="offline-note" role="status">
                {chartFromLocal
                  ? "☾ offline — cast on your device"
                  : "☾ offline — showing your last cast"}
              </div>
            )}
            {queuedAsks > 0 && (
              <div className="offline-note queued-note" role="status">
                ✎ {queuedAsks} {queuedAsks === 1 ? "reflection" : "reflections"} queued — will send when you reconnect
              </div>
            )}
            <ChartWheel size={720} />
          </>
        ) : (
          // R-4: keyed by chapter — every open is one 240ms bloom (the only
          // motion of the intent; the surfaces' own entrances retire).
          <div className="chapter-host" key={chapter}>
            {/* R-2: chapters are bare surfaces — the modal chrome retired.
                Esc / the dial navigate home; ForecastPanel's onHome is real
                navigation (jump/Ask land on the wheel). Distinct keys force
                clean remounts between the three Arcana-backed chapters. */}
            {chapter === "II" && (
              <>
                <ArcanaModal key="ch-ii" />
                {/* R-3: the Reading chapter gathers everything that answers a
                    question — the soul profile and the Oracle fold in below. */}
                <SoulProfileModal />
                <OracleModal profile={soulProfile} />
              </>
            )}
            {chapter === "III" && (
              <>
                <ForecastPanel onHome={() => setChapter("I")} />
                <PredictiveModal />
              </>
            )}
            {chapter === "IV" && <RelationshipModal />}
            {chapter === "V" && <AdvancedModal />}
            {chapter === "VI" && <ArcanaModal key="ch-vi" initialTab="classroom" />}
            {chapter === "VII" && <ArcanaModal key="ch-vii" initialTab="studio" />}
            {chapter === "VIII" && (
              <>
                <TomeMeter />
                <BookshelfModal />
                <GalleryPanel />
                <LibraryVault />
              </>
            )}
            {/* The voice canon, set small and constant — a running footer,
                one refrain instead of five clinical disclaimers. */}
            <p className="chapter-refrain">
              Nothing Astra produces is a life sentence — it is a life poem.
            </p>
          </div>
        )}
        <ChapterDial active={chapter} onSelect={openChapter} />
      </div>

      <DetailPanel />

      {(chapter === "I" || chapter === "III") && <TransitSlider />}
    </div>
    <InstallPrompt />
    </>
  );
};
