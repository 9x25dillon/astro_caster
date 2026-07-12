// ForecastPanel.tsx — Upcoming astrological events for the next 90 days.
// Track R (R-2): a chapter surface (III · Timing), not a modal — no overlay,
// no ✕; Esc and the dial navigate home via the App shell. onHome is kept as
// real navigation: jumping to a date or asking Astra returns to chapter I,
// where the wheel and the margin's answer are visible.
import React, { useEffect, useState } from "react";
import { useStore, PLACEHOLDER_BIRTH } from "../store/useStore";
import { fetchForecast, localForecast, localToday, type ForecastEvent } from "../api/client";

const SIG_BADGE: Record<string, string> = {
  high:   "▲",
  medium: "◆",
  low:    "·",
};

const TYPE_LABEL: Record<string, string> = {
  station:         "Station",
  transit_natal:   "Personal",
  transit_transit: "Sky",
};

// Group events by calendar month.
function groupByMonth(events: ForecastEvent[]): [string, ForecastEvent[]][] {
  const map = new Map<string, ForecastEvent[]>();
  for (const ev of events) {
    const key = ev.date.slice(0, 7); // "YYYY-MM"
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(ev);
  }
  return [...map.entries()];
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  const names = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${names[parseInt(m, 10) - 1]} ${y}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso + "T12:00:00Z");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

// ── Filters bar ───────────────────────────────────────────────────────────────

interface Filters {
  types: Set<string>;
  sig: "all" | "high" | "medium";
  harmony: "all" | "harmonious" | "challenging";
}

const DEFAULT_FILTERS: Filters = {
  types: new Set(["station", "transit_natal", "transit_transit"]),
  sig: "all",
  harmony: "all",
};

// Build a natural-language query from a forecast event for Astra to interpret.
function buildAstraQuery(ev: ForecastEvent): string {
  const d = formatDate(ev.date);
  if (ev.type === "station") {
    const dir = ev.direction === "retrograde" ? "stations retrograde" : "stations direct";
    return `On ${d}, ${ev.planet} ${dir} (${ev.summary}). Given my natal chart, what does this station mean for me personally? Which areas of my life does it most activate, and what is the wisest way to work with this energy?`;
  }
  if (ev.type === "transit_natal") {
    const action = {
      Conjunction: "conjuncts",
      Opposition:  "opposes",
      Square:      "squares",
      Trine:       "trines",
      Sextile:     "sextiles",
    }[ev.aspect ?? ""] ?? "aspects";
    return `On ${d}, transiting ${ev.planet} ${action} my natal ${ev.target}. How is this transit likely to show up in my life given everything else in my chart? What does it want from me, and what can I do to meet it well?`;
  }
  // transit_transit
  return `On ${d}, ${ev.summary} in the sky. Given my natal chart, how does this collective transit intersect with my personal themes? Which parts of my chart does it activate, and what patterns or shifts might I notice around this time?`;
}

// ── Bookmark persistence ──────────────────────────────────────────────────────

const BM_KEY = "aae.forecast_bookmarks";

function loadBookmarks(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(BM_KEY) || "[]")); }
  catch { return new Set(); }
}

function saveBookmarks(bm: Set<string>): void {
  localStorage.setItem(BM_KEY, JSON.stringify([...bm]));
}

function bmId(ev: ForecastEvent): string {
  return `${ev.date}|${ev.planet}|${ev.type}|${ev.aspect ?? ""}|${ev.target ?? ""}`;
}

// ── Event card ────────────────────────────────────────────────────────────────

const EventCard: React.FC<{
  ev: ForecastEvent;
  bookmarked: boolean;
  onToggleBookmark: (id: string) => void;
  onJump: (iso: string) => void;
  onAsk: (query: string, date: string) => void;
}> = ({ ev, bookmarked, onToggleBookmark, onJump, onAsk }) => {
  const [open, setOpen] = useState(false);
  const setMargin = useStore((s) => s.setMargin);
  const isRx = ev.direction === "retrograde";
  const isDirect = ev.direction === "direct";
  // R-4 ion discipline: an event landing TODAY is live sky.
  const isToday = ev.date === localToday();

  // R-2: expanding an event also publishes it to the margin glass.
  const publish = () =>
    setMargin({
      title: ev.summary,
      subtitle: `${formatDate(ev.date)} · ${TYPE_LABEL[ev.type]}`,
      chips: [ev.significance, ...(ev.harmony ? [ev.harmony] : [])],
      body: ev.meaning ? [ev.meaning] : undefined,
      journal: { seed: `forecast:${bmId(ev)}`, question: ev.summary },
    });

  return (
    <div
      className={`fc-event fc-event--${ev.significance} fc-event--${ev.type} ${isToday ? "fc-event--today" : ""}`}
      style={{ borderLeftColor: ev.color }}
    >
      <div className="fc-event-header" onClick={() => { setOpen((o) => !o); publish(); }}>
        <span className="fc-event-date">{formatDate(ev.date)}</span>
        <span className="fc-event-sig" title={ev.significance}
              style={{ color: ev.color }}>{SIG_BADGE[ev.significance]}</span>
        <span className="fc-event-glyphs">
          <span style={{ color: ev.color }}>{ev.glyph}</span>
          {ev.aspect && (
            <>
              <span className="fc-asp">{ev.aspect[0]}</span>
              <span style={{ color: ev.target_glyph ? ev.color : undefined }}>
                {ev.target_glyph}
              </span>
            </>
          )}
          {isRx && <span className="fc-rx">℞</span>}
          {isDirect && <span className="fc-direct">D</span>}
        </span>
        <span className="fc-event-summary">{ev.summary}</span>
        <span className="fc-type-chip">{TYPE_LABEL[ev.type]}</span>
        <button
          className="fc-jump"
          title="Jump to this date in transit slider"
          onClick={(e) => { e.stopPropagation(); onJump(ev.date + "T12:00"); }}
        >↦</button>
        <button
          className="fc-ask-astra"
          title="Ask Astra about this transit"
          onClick={(e) => { e.stopPropagation(); onAsk(buildAstraQuery(ev), ev.date + "T12:00"); }}
        >✦ Ask</button>
        <button
          className={`fc-bookmark ${bookmarked ? "fc-bookmark--on" : ""}`}
          title={bookmarked ? "Remove bookmark" : "Bookmark this transit"}
          onClick={(e) => { e.stopPropagation(); onToggleBookmark(bmId(ev)); }}
        >{bookmarked ? "★" : "☆"}</button>
        <span className="fc-toggle">{open ? "−" : "+"}</span>
      </div>
      {open && (
        <div className="fc-event-body">
          <p>{ev.meaning}</p>
          {ev.orb > 0 && (
            <p className="fc-orb">Orb at exactness: {ev.orb.toFixed(2)}°</p>
          )}
          <button
            className="fc-ask-astra-expanded"
            onClick={() => onAsk(buildAstraQuery(ev), ev.date + "T12:00")}
          >✦ Ask Astra about this transit</button>
        </div>
      )}
    </div>
  );
};

// ── Main panel ────────────────────────────────────────────────────────────────

export const ForecastPanel: React.FC<{ onHome: () => void }> = ({ onHome }) => {
  const birth = useStore((s) => s.birth);
  const setTransitIso = useStore((s) => s.setTransitIso);
  const ask = useStore((s) => s.ask);
  const transitsOn = useStore((s) => s.layers.transits);
  const toggleLayer = useStore((s) => s.toggleLayer);

  const isDefaultChart =
    birth.year  === PLACEHOLDER_BIRTH.year  &&
    birth.month === PLACEHOLDER_BIRTH.month &&
    birth.day   === PLACEHOLDER_BIRTH.day;

  const [events, setEvents] = useState<ForecastEvent[] | null>(null);
  const [error, setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays]     = useState(90);
  const [minSig, setMinSig] = useState<"high" | "medium" | "low">("medium");
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [search, setSearch] = useState("");
  const [bookmarks, setBookmarks] = useState<Set<string>>(loadBookmarks);

  const [offline, setOffline] = useState(false);

  const load = (d: number, sig: "high" | "medium" | "low") => {
    setLoading(true);
    setError(null);
    fetchForecast(birth, d, sig)
      .then((r) => { setEvents(r.events); setOffline(false); setLoading(false); })
      .catch(async () => {
        // Backend down → scan transits on-device (Sun–Pluto; reduced set).
        try {
          const r = await localForecast(birth, d, sig);
          setEvents(r.events); setOffline(true); setLoading(false);
        } catch (e2) {
          setError((e2 as Error).message); setLoading(false);
        }
      });
  };

  // Initial load
  useEffect(() => { load(days, minSig); /* eslint-disable-next-line */ }, []);

  const handleJump = (iso: string) => {
    setTransitIso(iso);
    // Jumping to a date is only visible on the wheel with the transit layer
    // on — enable it (never disable) so the jump lands somewhere.
    if (!transitsOn) toggleLayer("transits");
    onHome();
  };

  const [askingToast, setAskingToast] = useState(false);

  // Set transit date to event date, kick off AI query, show brief toast,
  // then return home so the wheel (and the margin's answer) become visible.
  const handleAsk = (query: string, iso: string) => {
    setTransitIso(iso);
    ask(query, "deep");
    setAskingToast(true);
    setTimeout(() => { setAskingToast(false); onHome(); }, 900);
  };

  const exportTxt = () => {
    if (!events) return;
    const lines = [`Astra · Forecast — next ${days} days`, "=".repeat(44), ""];
    for (const ev of visible) {
      lines.push(`${formatDate(ev.date)}  ${ev.summary}`);
      if (ev.meaning) lines.push(`  ${ev.meaning}`);
      lines.push("");
    }
    lines.push(`Generated ${new Date().toLocaleString()} by Astra`);
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `astra-forecast-${days}d.txt`; a.click();
    URL.revokeObjectURL(url);
  };

  const exportIcs = () => {
    if (!events) return;
    const esc = (s: string) => s.replace(/[,;\\]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");
    const stamp = new Date().toISOString().replace(/[-:.]/g, "").slice(0, 15) + "Z";
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Astra//Forecast//EN", "CALSCALE:GREGORIAN"];
    for (const ev of visible) {
      const uid = `astra-${ev.date}-${ev.planet}-${ev.type}@aae`;
      lines.push(
        "BEGIN:VEVENT",
        `UID:${uid}`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${ev.date.replace(/-/g, "")}`,
        `SUMMARY:${esc(`${ev.glyph} ${ev.summary}`)}`,
        `DESCRIPTION:${esc(ev.meaning || ev.summary)}`,
        `CATEGORIES:${ev.type === "transit_natal" ? "Personal" : ev.type === "station" ? "Station" : "Sky"}`,
        "END:VEVENT"
      );
    }
    lines.push("END:VCALENDAR");
    const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `astra-forecast-${days}d.ics`; a.click();
    URL.revokeObjectURL(url);
  };

  // Apply filters (personal transits suppressed when no chart has been cast yet)
  const needle = search.trim().toLowerCase();
  const visible = (events ?? []).filter((ev) => {
    if (isDefaultChart && ev.type === "transit_natal") return false;
    if (!filters.types.has(ev.type)) return false;
    if (filters.sig === "high" && ev.significance !== "high") return false;
    if (filters.sig === "medium" && ev.significance === "low") return false;
    if (filters.harmony !== "all" && ev.harmony && ev.harmony !== filters.harmony) return false;
    if (needle && !ev.summary.toLowerCase().includes(needle) &&
        !ev.planet.toLowerCase().includes(needle) &&
        !(ev.target ?? "").toLowerCase().includes(needle)) return false;
    return true;
  });

  const months = groupByMonth(visible);

  const toggleBookmark = (id: string) => {
    setBookmarks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      saveBookmarks(next);
      return next;
    });
  };

  const toggleType = (t: string) => {
    setFilters((f) => {
      const next = new Set(f.types);
      if (next.has(t)) next.delete(t); else next.add(t);
      return { ...f, types: next };
    });
  };

  return (
    <div className="forecast-modal">
        {/* Header */}
        <div className="forecast-header">
          <div>
            <h2 className="forecast-title">☌ Upcoming Transits</h2>
            <p className="forecast-sub">
              Sky events and personal activations for the next {days} days
              {offline && (
                <span className="fc-offline-tag" role="status"> · ☾ on-device (offline)</span>
              )}
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="forecast-controls">
          <div className="fc-ctrl-group">
            <label className="fc-ctrl-label">Range</label>
            {([30, 60, 90, 180] as const).map((d) => (
              <button
                key={d}
                className={`fc-pill ${days === d ? "fc-pill--active" : ""}`}
                onClick={() => { setDays(d); load(d, minSig); }}
              >{d}d</button>
            ))}
          </div>
          <div className="fc-ctrl-group">
            <label className="fc-ctrl-label">Depth</label>
            {(["high", "medium", "low"] as const).map((s) => (
              <button
                key={s}
                className={`fc-pill ${minSig === s ? "fc-pill--active" : ""}`}
                onClick={() => { setMinSig(s); load(days, s); }}
              >{s === "high" ? "Major" : s === "medium" ? "Notable" : "All"}</button>
            ))}
          </div>
          <div className="fc-ctrl-group">
            <label className="fc-ctrl-label">Type</label>
            {(["station", "transit_natal", "transit_transit"] as const).map((t) => (
              <button
                key={t}
                className={`fc-pill ${filters.types.has(t) ? "fc-pill--active" : ""}`}
                onClick={() => toggleType(t)}
              >{TYPE_LABEL[t]}</button>
            ))}
          </div>
          <div className="fc-ctrl-group">
            <label className="fc-ctrl-label">Search</label>
            <input
              className="fc-search"
              placeholder="planet or keyword…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button className="fc-pill" onClick={() => setSearch("")} title="Clear">✕</button>
            )}
          </div>
        </div>

        {/* No personal chart banner */}
        {isDefaultChart && (
          <div className="fc-notice">
            ✦ Cast your chart first to see your personal transits — showing sky events only.
          </div>
        )}

        {/* Astra is reading toast */}
        {askingToast && (
          <div className="fc-toast">Astra is reading this transit…</div>
        )}

        {/* Body */}
        <div className="forecast-body">
          {loading && (
            <div className="fc-loading">
              <span className="fc-loading-glyph">☿</span>
              <span>Scanning the ephemeris…</span>
            </div>
          )}
          {!loading && error && (
            <div className="fc-error">{error}</div>
          )}
          {!loading && !error && months.length === 0 && (
            <p className="muted" style={{ textAlign: "center", marginTop: 40 }}>
              No events found matching these filters.
            </p>
          )}
          {!loading && !error && months.map(([ym, evs]) => (
            <div key={ym} className="fc-month">
              <div className="fc-month-label">{monthLabel(ym)}</div>
              {evs.map((ev, i) => (
                <EventCard key={`${ev.date}-${ev.planet}-${ev.aspect}-${i}`}
                           ev={ev}
                           bookmarked={bookmarks.has(bmId(ev))}
                           onToggleBookmark={toggleBookmark}
                           onJump={handleJump}
                           onAsk={handleAsk} />
              ))}
            </div>
          ))}
        </div>

        {!loading && !error && events && (
          <div className="forecast-footer">
            <span>{visible.length} events · Click to expand · ↦ jumps transit slider</span>
            <span className="fc-export-btns">
              <button className="fc-export" onClick={exportTxt} title="Download as plain text">↓ .txt</button>
              <button className="fc-export" onClick={exportIcs} title="Download as iCalendar">↓ .ics</button>
            </span>
          </div>
        )}
    </div>
  );
};
