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
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const [soulOpen, setSoulOpen] = useState(false);
  const [oracleOpen, setOracleOpen] = useState(false);
  const [forecastOpen, setForecastOpen] = useState(false);
  const [arcanaOpen, setArcanaOpen] = useState(false);
  const [shelfOpen, setShelfOpen] = useState(false);
  const [relOpen, setRelOpen] = useState(false);
  const [predOpen, setPredOpen] = useState(false);
  const [advOpen, setAdvOpen] = useState(false);
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
          <button
            className="arcana-pill"
            title="Astra Arcana — natal tarot"
            onClick={() => { setArcanaOpen(true); trackEvent("arcana_opened"); }}
          >
            ✶ Arcana
          </button>
          <button className="arcana-pill" title="Relationship astrology"
            onClick={() => { setRelOpen(true); trackEvent("relationship_opened"); }}>⚭ Relate</button>
          <button className="ghost masthead-btn"
            onClick={() => { setShelfOpen(true); trackEvent("bookshelf_opened"); }}>❖ Shelf</button>
          <button className="arcana-pill" title="Predictive timing"
            onClick={() => { setPredOpen(true); trackEvent("predictive_opened"); }}>◷ Timing</button>
          <button className="arcana-pill" title="Advanced techniques"
            onClick={() => { setAdvOpen(true); trackEvent("advanced_opened"); }}>✴ Advanced</button>
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
      {forecastOpen && <ForecastPanel onClose={() => setForecastOpen(false)} />}
      {arcanaOpen && <ArcanaModal onClose={() => setArcanaOpen(false)} />}
      {shelfOpen && <BookshelfModal onClose={() => setShelfOpen(false)} />}
      {relOpen && <RelationshipModal onClose={() => setRelOpen(false)} />}
      {predOpen && <PredictiveModal onClose={() => setPredOpen(false)} />}
      {advOpen && <AdvancedModal onClose={() => setAdvOpen(false)} />}
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
        onOpenForecast={() => { setForecastOpen(true); trackEvent("forecast_opened"); }}
        onNewChart={() => setCeremonyOpen(true)}
      />

      <MorningPanel />

      <div className="wheel-area">
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
      </div>

      <DetailPanel />

      <TransitSlider />
    </div>
    <InstallPrompt />
    </>
  );
};
