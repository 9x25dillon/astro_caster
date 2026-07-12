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
  // Track R (R-1): the seven masthead module buttons became the chapter dial.
  // Chapter I = the wheel at home; II–VIII mount the former modals' content
  // in the stage, unchanged (their chrome retires in R-2).
  const [chapter, setChapter] = useState<Chapter>("I");
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const [soulOpen, setSoulOpen] = useState(false);
  const [oracleOpen, setOracleOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [privacyDismissed, setPrivacyDismissed] = useState(
    () => !!localStorage.getItem("aae.privacy_ack")
  );
  const [ceremonyOpen, setCeremonyOpen] = useState(
    () => !localStorage.getItem("aae.ceremony_shown")
  );
  const soulProfile = useMemo(() => (chart ? deriveSoulProfile(chart) : null), [chart]);

  // Cast the default chart on first mount so the observatory is alive immediately.
  useEffect(() => {
    if (!chart) generate();
    validateEntitlement();
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

  // Ergonomic law: hands on keys. 1–8 jump chapters, Esc is always home.
  // Never hijacked while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (e.key === "Escape") { setChapter("I"); setMargin(null); return; }
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
    <div className="app">
      <header className="masthead">
        <h1>☤ Astra</h1>
        <div className="sub">
          Natal observatory · celestial cartography · oracle
        </div>
        <div className="masthead-actions">
          {/* Track R (R-1): module pills retired — the chapter dial navigates.
              The masthead keeps identity, entitlement, and admin only. */}
          <button
            className={`support-pill ${isSupporter ? "is-supporter" : ""}`}
            onClick={() => openSupport(true)}
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
      {soulOpen && <SoulProfileModal onClose={() => setSoulOpen(false)} />}
      {oracleOpen && <OracleModal onClose={() => setOracleOpen(false)} profile={soulProfile} />}
      {adminOpen && <AdminPanel onClose={() => setAdminOpen(false)} />}

      {!privacyDismissed && (
        <div className="privacy-banner">
          <span>
            This observatory collects anonymized usage data (chart patterns, feature interactions)
            to improve the experience.{" "}
            <a href="#" onClick={(e) => { e.preventDefault(); }} style={{ color: "var(--gold-soft)" }}>
              No personal identity is stored.
            </a>
          </span>
          <button
            className="ghost"
            style={{ fontSize: 11, padding: "2px 10px", width: "auto", marginLeft: 12 }}
            onClick={() => {
              localStorage.setItem("aae.privacy_ack", "1");
              setPrivacyDismissed(true);
              trackEvent("privacy_acknowledged");
            }}
          >
            OK
          </button>
        </div>
      )}

      <Controls
        onOpenGlossary={() => { setGlossaryOpen(true); trackEvent("glossary_opened"); }}
        onOpenSoul={() => { setSoulOpen(true); trackEvent("soul_profile_opened"); }}
        onOpenOracle={() => { setOracleOpen(true); trackEvent("oracle_opened"); }}
        onOpenForecast={() => openChapter("III")}
        onNewChart={() => setCeremonyOpen(true)}
      />

      {chapter === "I" && <MorningPanel />}

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
          <div className="chapter-host">
            {/* R-2: chapters are bare surfaces — the modal chrome retired.
                Esc / the dial navigate home; ForecastPanel's onHome is real
                navigation (jump/Ask land on the wheel). Distinct keys force
                clean remounts between the three Arcana-backed chapters. */}
            {chapter === "II" && <ArcanaModal key="ch-ii" />}
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
            {chapter === "VIII" && <BookshelfModal />}
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
