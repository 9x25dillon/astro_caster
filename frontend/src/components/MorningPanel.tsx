// MorningPanel — the at-a-glance boot surface (NEXT_ARC Track 3, P2): today's
// transit arcana card beside the day's tightest transits. Pure composition
// over engines that already exist on both stacks: /api/arcana-forecast (or
// its parity-locked on-device fallback) for the card, /api/forecast (or the
// on-device scanner) for the events. Dismissal is remembered per local date,
// so the panel greets each new day once.
import React, { useEffect, useState } from "react";
import { useStore } from "../store/useStore";
import {
  fetchArcanaForecast,
  localArcanaForecast,
  fetchForecast,
  localForecast,
  localToday,
  trackEvent,
  type ArcanaDay,
  type ForecastEvent,
} from "../api/client";

const DISMISS_KEY = "aae.morning_dismissed";
const TRANSIT_COUNT = 3;

export function morningDismissedToday(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === localToday();
  } catch {
    return false;
  }
}

export const MorningPanel: React.FC = () => {
  const birth = useStore((s) => s.birth);
  const chart = useStore((s) => s.chart);
  const [dismissed, setDismissed] = useState(morningDismissedToday);
  const [card, setCard] = useState<ArcanaDay | null>(null);
  const [transits, setTransits] = useState<ForecastEvent[] | null>(null);
  const [onDevice, setOnDevice] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!chart || dismissed) return;
    let cancelled = false;
    const today = localToday();

    // Today's card: the 1-day transit overlay, falling back on-device the same
    // way the modals do (the local engine deals the identical trump).
    (async () => {
      let day: ArcanaDay | null = null;
      let local = false;
      try {
        const f = await fetchArcanaForecast(chart, 1);
        day = f.cards[0] ?? null;
      } catch {
        try {
          const f = await localArcanaForecast(birth, 1);
          day = f.cards[0] ?? null;
          local = true;
        } catch {
          /* card unavailable — the transits row may still land */
        }
      }
      if (cancelled) return;
      setCard(day);
      if (local) setOnDevice(true);
      if (!day) setFailed(true);
    })();

    // Today's tightest transits: a 2-day scan (events dated today), sorted by
    // orb so the most exact contacts lead.
    (async () => {
      let events: ForecastEvent[] | null = null;
      let local = false;
      try {
        const r = await fetchForecast(birth, 2, "medium");
        events = r.events;
      } catch {
        try {
          const r = await localForecast(birth, 2, "medium");
          events = r.events;
          local = true;
        } catch {
          /* transits unavailable */
        }
      }
      if (cancelled) return;
      if (events) {
        setTransits(
          events
            .filter((e) => e.date === today)
            .sort((a, b) => (a.orb ?? 99) - (b.orb ?? 99))
            .slice(0, TRANSIT_COUNT)
        );
      }
      if (local) setOnDevice(true);
    })();

    trackEvent("morning_panel_shown");
    return () => {
      cancelled = true;
    };
    // Re-run when a new chart is cast (new birth data ⇒ new card + transits).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart, dismissed]);

  if (!chart || dismissed) return null;
  // Nothing arrived at all (both engines down) — stay out of the way.
  if (failed && transits === null) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, localToday());
    } catch {
      /* private mode — dismissal just won't persist */
    }
    setDismissed(true);
    trackEvent("morning_panel_dismissed");
  };

  return (
    <section className="morning-panel" aria-label="Morning panel">
      <div className="morning-head">
        <span className="morning-title">☼ This morning</span>
        <span className="morning-date">{localToday()}</span>
        <button
          className="morning-dismiss"
          onClick={dismiss}
          aria-label="Dismiss morning panel"
          title="Dismiss for today"
        >
          ✕
        </button>
      </div>

      {onDevice && (
        <p className="arc-ondevice">☾ offline — computed on your device</p>
      )}

      <div className="morning-body">
        <div className="morning-card">
          {card ? (
            <>
              <div className="morning-card-name">
                {card.card.name}
                {card.reversed && <span className="morning-reversed"> · reversed</span>}
              </div>
              <div className="morning-card-summary">{card.transit_summary}</div>
              {card.natal_link && (
                <div className="morning-card-link">linked to natal {card.natal_link}</div>
              )}
              {card.best_expression && (
                <div className="morning-card-lesson">{card.best_expression}</div>
              )}
            </>
          ) : (
            <div className="morning-card-summary">Dealing today's card…</div>
          )}
        </div>

        <div className="morning-transits">
          {transits === null ? (
            <div className="morning-transit">Scanning today's sky…</div>
          ) : transits.length === 0 ? (
            <div className="morning-transit">Quiet sky — an integration day.</div>
          ) : (
            transits.map((e, i) => (
              <div className="morning-transit" key={i}>
                <span className="morning-transit-summary">{e.summary}</span>
                {e.type !== "station" && (
                  <span className="morning-transit-orb"> · orb {e.orb}°</span>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
};
