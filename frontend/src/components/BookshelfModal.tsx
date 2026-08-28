// BookshelfModal.tsx — B2: the local report library. Every Oracle session
// (and its deluxe edition) shelves itself; here they reopen, reprint (fully
// offline — chart re-cast + plates re-dealt on-device), or burn.
// Track R (R-2): a chapter surface (VIII · Library), not a modal — no overlay,
// no ✕; Esc and the dial navigate home via the App shell.
import React, { useEffect, useState } from "react";
import {
  journalDelete, journalForSeed, journalMarkdown,
  shelfAttachPersonal, shelfDelete, shelfList,
  type JournalEntry, type ShelfEntry,
} from "../lib/bookshelf";
import { sessionFromShelf } from "../lib/oracleSession";
import { loadReportToken } from "../lib/reportTokens";
import { JournalPad } from "./JournalPad";
import { printSessionTome } from "../lib/tomePrint";
import { Interpretation } from "./DetailPanel";
import { ApiError, fetchPersonalReport, trackEvent } from "../api/client";
import { useStore } from "../store/useStore";

const SPREAD_LABEL: Record<string, string> = {
  daily: "Daily", three_card: "Three-Card", elemental_balance: "Elemental",
  planetary_seven: "Planetary Seven", twelve_house: "Twelve Houses",
  relationship: "Relationship", transit_pressure: "Transit Pressure",
  shadow_integration: "Shadow", creative_expression: "Creative",
  celtic_cross: "Celtic Cross", horseshoe: "Horseshoe", tree_of_life: "Tree of Life",
  course: "✶ Course",   // curriculum entries shelve beside the readings
};

export const BookshelfModal: React.FC = () => {
  const setMargin = useStore((s) => s.setMargin);   // R-2: publish selections to the margin glass
  const [entries, setEntries] = useState<ShelfEntry[] | null>(null);
  const chart = useStore((s) => s.chart);
  const entitlement = useStore((s) => s.entitlement);
  const [openSeed, setOpenSeed] = useState<string | null>(null);
  const [compiling, setCompiling] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [journal, setJournal] = useState<JournalEntry[]>([]);

  const load = () => shelfList().then(setEntries).catch(() => setEntries([]));
  useEffect(() => { load(); }, []);

  // Reflections for the opened session.
  useEffect(() => {
    if (!openSeed) { setJournal([]); return; }
    journalForSeed(openSeed).then(setJournal).catch(() => setJournal([]));
  }, [openSeed]);
  const refreshJournal = () => {
    if (openSeed) journalForSeed(openSeed).then(setJournal).catch(() => undefined);
  };

  async function exportJournal() {
    const md = await journalMarkdown();
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `astra-journal-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function reprint(e: ShelfEntry) {
    if (!e.personal) return;
    const ok = await printSessionTome({
      reportMarkdown: e.personal.report_markdown,
      seed: e.seed,
      spread: e.personal.spread || e.spread,
      source: e.source,
      question: e.question,
      lineage: e.lineage,
      date: e.date,
      oracleDate: e.personal.oracle_date,
      birth: e.birth,
      chart: null, // re-cast on-device from the saved birth
    });
    setMsg(ok ? "" : "Popup blocked — allow popups for this site.");
    if (ok) trackEvent("bookshelf_reprint", { spread: e.spread });
  }

  /** Compile the deluxe edition for a SHELVED session.
   *
   *  The deluxe purchase is bound to a session seed, and sessions live here —
   *  so this is where an unspent claim must be spendable. Before this existed
   *  the only route was the Oracle tab, which meant a claim survived only as
   *  long as the browser tab that made it: a $5.50 edition was paid for on
   *  2026-08-28 and never compiled, because Stripe's return reloaded the page
   *  and the session went with it.
   *
   *  The seed is VERIFIED LOCALLY first. The server re-derives it from the
   *  chart it is sent and 409s on a mismatch, and a mismatch is easy to cause
   *  honestly: the seed folds in longitudes rounded to 0.01°, so a chart cast
   *  under a different ephemeris can round a body the other way and produce a
   *  different seed for the same birth (28.8% of charts across the v1.0.3 →
   *  v1.0.4 data-file change). Checking here turns a bewildering 409 into a
   *  sentence that says which chart to load. */
  async function compileDeluxe(e: ShelfEntry) {
    if (compiling) return;
    if (!chart) { setMsg("Cast a chart first — the edition compiles from it."); return; }
    const token = loadReportToken(e.seed);
    if (!token) {
      setMsg("No deluxe claim found on this device for this session. If you " +
             "purchased one, open the session in the Oracle tab and enter the " +
             "payment reference to restore the claim.");
      return;
    }
    setCompiling(e.seed); setMsg("");
    try {
      const { defaultSeed } = await import("@astra/core");
      const expected = defaultSeed(chart, e.spread, e.question, e.date, e.source);
      if (expected !== e.seed) {
        setMsg("This session was cast from a different chart than the one " +
               "loaded. Load that chart and try again — the deluxe edition " +
               "compiles only its own session.");
        return;
      }
      const session = sessionFromShelf(e);
      const p = await fetchPersonalReport(chart, session.oracle, {
        date: session.ctx.date,
        generatedAt: session.ctx.generatedAt,
        entitlement,
        reportToken: token,
      });
      await shelfAttachPersonal(e.seed, {
        report_markdown: p.report_markdown,
        short_seed: p.short_seed,
        oracle_date: p.oracle_date,
        ai_source: p.ai_source,
        model: p.model ?? null,
        spread: e.spread,
      });
      load();
      setMsg("Deluxe edition compiled and shelved. ⎙ Reprint tome is ready.");
      trackEvent("bookshelf_deluxe_compiled", { spread: e.spread, ai: p.ai_source });
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        setMsg("The claim was refused — oracle tier and a deluxe purchase for " +
               "this session are both required.");
      } else if (err instanceof ApiError && err.status === 409) {
        setMsg("The server did not recognise this session as its own.");
      } else {
        setMsg(String(err));
      }
    } finally {
      setCompiling(null);
    }
  }

  async function burn(e: ShelfEntry) {
    if (!window.confirm("Remove this session from the shelf? The reading cannot be re-generated for free.")) return;
    await shelfDelete(e.seed);
    if (openSeed === e.seed) setOpenSeed(null);
    load();
  }

  const dateOf = (e: ShelfEntry) => e.updatedAt.slice(0, 10);

  return (
    <div className="shelf-modal">
        <div className="shelf-header">
          <h2>❖ The Bookshelf</h2>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button className="ghost shelf-journal-export" style={{ width: "auto", fontSize: 11, padding: "3px 10px" }}
                    title="Every reflection you've kept, as one markdown file (built locally)"
                    onClick={exportJournal}>
              ✎ Journal .md
            </button>
          </div>
        </div>
        <p className="shelf-sub">
          Every Oracle session shelves itself here — reopen a reading, reprint
          its tome (computed on your device, works offline), or burn it.
          Vault exports carry the shelf.
        </p>
        {msg && <p className="shelf-msg">{msg}</p>}

        {entries === null && <p className="muted">Opening the shelf…</p>}
        {entries?.length === 0 && (
          <p className="muted" style={{ fontStyle: "italic" }}>
            The shelf is empty — generate an Oracle Report and it will appear here.
          </p>
        )}

        <div className="shelf-list">
          {entries?.map((e) => (
            <div key={e.seed} className={`shelf-item ${openSeed === e.seed ? "open" : ""}`}>
              <div className="shelf-row" onClick={() => {
                const opening = openSeed !== e.seed;
                setOpenSeed(opening ? e.seed : null);
                // R-2: an opened session is the Library's selection.
                setMargin(opening ? {
                  title: e.question,
                  subtitle: `${dateOf(e)} · ${SPREAD_LABEL[e.spread] ?? e.spread}`,
                  chips: [
                    ...(e.personal ? ["✶ deluxe"] : []),
                    e.ai_source === "llm" ? (e.model ?? "live") : "offline",
                  ],
                  journal: { seed: e.seed, question: e.question },
                } : null);
              }}>
                <span className="shelf-date">{dateOf(e)}</span>
                <span className="shelf-q">{e.question}</span>
                <span className="shelf-chips">
                  <span className="chip">{SPREAD_LABEL[e.spread] ?? e.spread}</span>
                  {e.personal && <span className="chip gilt">✶ deluxe</span>}
                  <span className={`chip ${e.ai_source === "llm" ? "" : "dim"}`}>
                    {e.ai_source === "llm" ? (e.model?.split("-").slice(1, 3).join(" ") || "live") : "offline"}
                  </span>
                </span>
              </div>
              {openSeed === e.seed && (
                <div className="shelf-body">
                  <div className="shelf-actions">
                    {e.personal && (
                      <button className="ghost" onClick={() => reprint(e)}>
                        ⎙ Reprint tome
                      </button>
                    )}
                    {/* An unspent deluxe claim is spendable HERE, because the
                        claim is bound to this session and this is where the
                        session lives. Shown only when a claim for this exact
                        seed exists on the device — it is never an offer to
                        buy, so it cannot be mistaken for one. */}
                    {!e.personal && loadReportToken(e.seed) && (
                      <button className="ghost" disabled={compiling === e.seed}
                              title="You purchased a deluxe edition for this session — compile it now"
                              onClick={() => void compileDeluxe(e)}>
                        {compiling === e.seed ? "Compiling…" : "✶ Compile deluxe edition"}
                      </button>
                    )}
                    <button className="ghost shelf-burn" onClick={() => burn(e)}>
                      🜂 Burn
                    </button>
                  </div>
                  <Interpretation text={e.report} />
                  <div className="shelf-journal">
                    <div className="shelf-journal-head">✎ Reflections</div>
                    {journal.filter((j) => j.position).map((j) => (
                      <div key={j.id} className="shelf-journal-entry">
                        <div className="shelf-journal-meta">
                          {j.position}{j.cardName ? ` — ${j.cardName}` : ""}
                          <button className="ghost jr-del" title="remove"
                                  onClick={() => journalDelete(j.id).then(refreshJournal)}>✕</button>
                        </div>
                        {j.prompt && <div className="shelf-journal-prompt">✎ {j.prompt}</div>}
                        <p className="shelf-journal-text">{j.text}</p>
                      </div>
                    ))}
                    {journal.filter((j) => !j.position).map((j) => (
                      <div key={j.id} className="shelf-journal-entry">
                        <div className="shelf-journal-meta">
                          Reflection · {j.createdAt.slice(0, 16).replace("T", " ")}
                          <button className="ghost jr-del" title="remove"
                                  onClick={() => journalDelete(j.id).then(refreshJournal)}>✕</button>
                        </div>
                        <p className="shelf-journal-text">{j.text}</p>
                      </div>
                    ))}
                    <JournalPad seed={e.seed} question={e.question} freeform onSaved={refreshJournal} />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
    </div>
  );
};
