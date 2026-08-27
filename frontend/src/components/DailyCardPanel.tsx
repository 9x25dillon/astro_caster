// DailyCardPanel.tsx — today's card, and the switch that has it arrive.
//
// The same draw three surfaces show: this panel, the 8am notification, and
// (next) the home-screen widget. All three read `dailyOracle`, which is a pure
// function of (chart, date) — so the card here is the card the notification
// named this morning, not a fresh deal that happens to look similar. That
// agreement is the whole point; a reader who is told The Tower at 8am and
// shown The Star at noon has been lied to about something they take seriously.
//
// Nothing here is fetched. The draw is computed on-device from the chart
// already in the store, which is why the panel works in airplane mode and why
// enabling notifications sends nothing anywhere.
import React, { useEffect, useMemo, useState } from "react";
import { useStore } from "../store/useStore";
import { dailyDrawFor, localDateKey } from "../lib/dailyOracle";
import {
  DEFAULT_PREFS,
  isSupported,
  readPrefs,
  rescheduleDaily,
  writePrefs,
  type DailyNotificationPrefs,
} from "../lib/dailyNotifications";
import { canPinWidget, requestPinWidget } from "../lib/widgetBridge";
import { ApiError, renderPlate, trackEvent } from "../api/client";
import { gallerySave } from "../lib/bookshelf";
import { rememberPlate } from "../lib/plateCache";
import { CardPlate } from "./CardPlate";

/** "Tuesday, 12 August" — the day named, so the card is anchored to it. */
function longDate(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export const DailyCardPanel: React.FC = () => {
  const chart = useStore((s) => s.chart);
  const setMargin = useStore((s) => s.setMargin);
  const entitlement = useStore((s) => s.entitlement);
  const openSupport = useStore((s) => s.openSupport);
  const [painting, setPainting] = useState(false);

  const [prefs, setPrefs] = useState<DailyNotificationPrefs>(DEFAULT_PREFS);
  const [canNotify, setCanNotify] = useState(false);
  const [canPin, setCanPin] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  /** Paint today's card. Once painted it is kept forever and shown on every
   *  surface that card appears on — this panel, the draw, chapter II's reading
   *  — so the cost is paid once per card, not once per day. There are 78
   *  cards, so a reader's deck fills in and the daily card is increasingly
   *  already illustrated. */
  async function paintToday() {
    if (!chart || !draw || painting) return;
    setPainting(true); setNote("");
    try {
      const source = "golden_dawn";
      const pl = await renderPlate(chart, draw.cardId, { source, entitlement });
      const artifact = {
        id: `plate:${source}:${draw.cardId}`,
        kind: "plate" as const,
        cardId: draw.cardId,
        title: pl.title || draw.cardName,
        mime: "image/png",
        data: `data:image/png;base64,${pl.image_b64}`,
        source,
        seed: null,
        meta: { quality: pl.quality, model: pl.model, size: pl.size },
      };
      void gallerySave(artifact).catch(() => undefined);
      rememberPlate(artifact);
      trackEvent("plate_rendered", { card: draw.cardId, source, surface: "daily" });
    } catch (e) {
      if (e instanceof ApiError && e.status === 402) {
        setNote("Oracle tier required — painting a card is a paid image generation.");
        openSupport(true);
      } else if (e instanceof ApiError && e.status === 503) {
        setNote("The image layer isn't configured on this observatory.");
      } else {
        setNote(String(e));
      }
    } finally {
      setPainting(false);
    }
  }

  useEffect(() => {
    setPrefs(readPrefs());
    void isSupported().then(setCanNotify);
    void canPinWidget().then(setCanPin);
  }, []);

  // Recomputed when the day rolls over or the chart changes — not memoised on
  // [] , or a phone left open past midnight would keep yesterday's card.
  const today = localDateKey();
  const draw = useMemo(
    () => (chart ? dailyDrawFor(chart, today) : null),
    [chart, today]
  );

  if (!chart || !draw) return null;

  const apply = async (next: DailyNotificationPrefs) => {
    setPrefs(next);
    writePrefs(next);
    if (!canNotify) return;
    setBusy(true);
    setNote("");
    try {
      const n = await rescheduleDaily(chart, next);
      if (n === -1) {
        // A refusal is final until they change it in system settings. Say so
        // once, plainly, and leave the toggle where they put it rather than
        // silently flipping it back — the preference is theirs, the permission
        // is Android's, and conflating the two is how a setting starts lying.
        setNote("Android is blocking notifications for Astra. Turn them on in system settings, then flip this again.");
      } else if (n > 0) {
        setNote(`Scheduled — the next ${n} mornings.`);
      } else if (!next.enabled) {
        setNote("Daily card notifications are off.");
      }
    } catch {
      setNote("Couldn't set the schedule just now. Nothing was changed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="lib-surface daily-panel">
      <div className="daily-head">
        <h3 className="lib-subtitle">☼ Today's card</h3>
        <span className="daily-date muted">{longDate(draw.date)}</span>
      </div>

      <div
        className="arc-drawn mg-sel daily-card"
        role="button"
        tabIndex={0}
        onClick={() =>
          setMargin({
            title: draw.title,
            subtitle: "Today",
            body: [draw.line],
          })
        }
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setMargin({ title: draw.title, subtitle: "Today", body: [draw.line] });
          }
        }}
      >
        <div className="arc-drawn-pos">Today</div>
        <span className={`arc-chip ${draw.reversed ? "arc-chip--rev" : ""}`}>
          ✦ {draw.cardName}{draw.reversed ? " ⤓" : ""}
        </span>
        {/* Today's card, illustrated. Free and offline once the card has been
            painted anywhere; offers to paint it when it hasn't. */}
        <CardPlate
          cardId={draw.cardId}
          cardName={draw.cardName}
          source="golden_dawn"
          reversed={draw.reversed}
          onRender={() => void paintToday()}
          rendering={painting}
          size={200}
        />
        <p className="arc-drawn-meaning">{draw.line}</p>
        {draw.natalLink && (
          <p className="arc-drawn-act">✦ Drawn toward your {draw.natalLink}</p>
        )}
      </div>

      {canNotify && (
        <div className="daily-notify">
          <label className="daily-notify-row">
            <input
              type="checkbox"
              className="daily-notify-toggle"
              checked={prefs.enabled}
              disabled={busy}
              onChange={(e) => void apply({ ...prefs, enabled: e.target.checked })}
            />
            <span>Send it to me each morning</span>
          </label>
          {prefs.enabled && (
            <label className="daily-notify-row">
              <span className="muted">at</span>
              <input
                type="time"
                className="daily-notify-time"
                value={`${String(prefs.hour).padStart(2, "0")}:${String(prefs.minute).padStart(2, "0")}`}
                disabled={busy}
                onChange={(e) => {
                  const [h, m] = e.target.value.split(":").map(Number);
                  if (Number.isFinite(h) && Number.isFinite(m)) {
                    void apply({ ...prefs, hour: h, minute: m });
                  }
                }}
              />
            </label>
          )}
          {note && (
            <p className="muted daily-notify-note" role="status">{note}</p>
          )}
          <p className="muted daily-notify-fine">
            Computed on this device and scheduled here — the card is drawn from
            your chart, and nothing about it is sent anywhere.
          </p>
        </div>
      )}

      {canPin && (
        <div className="daily-widget-offer">
          <button
            className="ghost daily-widget-btn"
            onClick={async () => {
              const asked = await requestPinWidget();
              // The launcher owns the confirmation and never tells us the
              // outcome, so this says what was ASKED, not what happened —
              // claiming "added" when the reader may have cancelled would be
              // the app asserting something it cannot know.
              setNote(
                asked
                  ? "Asked your launcher to add it — confirm on the home screen."
                  : "Your launcher wouldn't take the request. You can still add it by long-pressing the home screen."
              );
            }}
          >
            {/* ✦ rather than a box-drawing glyph: EB Garamond has no U+25EB
                and it rendered as tofu on the device. Verified on hardware —
                the browser substituted a fallback font and hid it. */}
            ✦ Put the wheel on my home screen
          </button>
          <p className="muted daily-notify-fine">
            The widget shows your wheel and this card. It redraws when you open
            Astra — nothing runs in the background.
          </p>
        </div>
      )}
    </div>
  );
};
