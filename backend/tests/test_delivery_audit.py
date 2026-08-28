"""
The standing question: did the people who paid receive what they paid for?

On 2026-08-28 the answer was no and nothing was asking. A deluxe Personal
Report was bought at 03:07:59 — verified receipt on the ledger — while the
delivery count for that product stood at zero, ever, by anybody. The number was
queryable the whole time. This module is that query, made permanent.

The tests below are mostly about NOT crying wolf and NOT staying silent, in
that order of danger:

  · a purchase with no delivery after it must be CRITICAL — that is the exact
    2026-08-28 shape, and it is silent from every other vantage point;
  · a paid capability that has never delivered ONCE must be CRITICAL even with
    no purchases, because it means the path has never been walked;
  · an OFFLINE fallback must not count as a delivery, or a permanently
    degraded API key looks healthy;
  · a delivery with no purchase before it must NOT be a finding — operator
    generations and comped sessions look exactly like that, and an audit that
    fires on them gets muted, which is how the next real one is missed.
"""
import os
import sqlite3
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import delivery_audit as DA  # noqa: E402

NOW = 1_800_000_000
HOUR = 3600


def ev(lens, ts, source="llm"):
    return {"ts": ts, "lens": lens, "tier": "oracle", "source": source,
            "model": "claude-fable-5", "response_len": 1000}


def rc(created):
    return {"tx_hash": f"pi_{created}", "seed": "s", "ref": "r", "created": created}


def _all_lenses(ts=NOW - HOUR):
    """One genuine delivery of every paid capability, so a test can isolate the
    one thing it is actually about instead of drowning in NEVER findings."""
    return [ev(d.lens, ts) for d in DA.PAID_DELIVERABLES]


# ------------------------------------------------------------- reconciliation

def test_reconcile_matches_each_purchase_to_a_later_delivery():
    matched, unmatched = DA.reconcile([100, 200], [150, 250])
    assert matched == [(100, 150), (200, 250)]
    assert unmatched == []


def test_reconcile_will_not_reuse_one_delivery_for_two_purchases():
    # Two people paid, one product was made. One of them is owed something.
    _matched, unmatched = DA.reconcile([100, 110], [150])
    assert unmatched == [110]


def test_reconcile_ignores_deliveries_that_precede_every_purchase():
    # A delivery before the purchase cannot be that purchase's product.
    _matched, unmatched = DA.reconcile([200], [100])
    assert unmatched == [200]


def test_reconcile_allows_a_small_clock_skew():
    # The receipt is written by the webhook and the delivery by the app; a few
    # seconds of skew between two writers must not manufacture a finding.
    _matched, unmatched = DA.reconcile([200], [190], grace_s=300)
    assert unmatched == []


def test_reconcile_is_quiet_when_nothing_was_ever_bought():
    assert DA.reconcile([], [100, 200]) == ([], [])


# ------------------------------------------------------------ the 08-28 shape

def test_a_paid_report_that_was_never_delivered_is_critical():
    rep = DA.build_report(
        receipts=[rc(NOW - 2 * HOUR)],
        # Every capability has delivered — but all of it BEFORE the purchase,
        # so nothing here can be the product this customer paid for.
        events=_all_lenses(ts=NOW - 3 * HOUR),
        now=NOW,
    )
    assert rep.undelivered == [NOW - 2 * HOUR]
    assert not rep.ok
    assert any("never handed over" in c for c in rep.critical)


def test_the_exact_2026_08_28_state_fails_loudly():
    # One verified purchase; personal_report has NEVER been produced.
    events = [e for e in _all_lenses() if e["lens"] != "personal_report"]
    rep = DA.build_report(receipts=[rc(NOW - HOUR)], events=events, now=NOW)
    assert not rep.ok
    assert any("NEVER delivered" in c and "personal_report" in c for c in rep.critical)
    assert rep.undelivered == [NOW - HOUR]


def test_a_delivered_purchase_is_clean():
    rep = DA.build_report(
        receipts=[rc(NOW - 2 * HOUR)],
        events=_all_lenses(ts=NOW - 2 * HOUR) + [ev("personal_report", NOW - HOUR)],
        now=NOW,
    )
    assert rep.undelivered == []
    assert rep.ok, rep.critical


# ----------------------------------------------------------------- liveness

def test_a_capability_that_never_delivered_is_critical_even_with_no_sales():
    # No money involved yet — and this is still the state the deluxe edition
    # was in on the day it took its first payment.
    rep = DA.build_report(receipts=[], events=[], now=NOW)
    assert not rep.ok
    lenses = {d.lens for d in DA.PAID_DELIVERABLES}
    for lens in lenses:
        assert any(lens in c and "NEVER" in c for c in rep.critical), lens


def test_an_offline_fallback_is_not_a_delivery():
    # The honest degradation is not the paid product. Counting it would let a
    # dead API key — every reading silently falling back — look healthy.
    rep = DA.build_report(
        receipts=[rc(NOW - 2 * HOUR)],
        events=[ev(d.lens, NOW - HOUR, source="offline") for d in DA.PAID_DELIVERABLES],
        now=NOW,
    )
    assert rep.undelivered == [NOW - 2 * HOUR]
    assert any("NEVER delivered" in c for c in rep.critical)


def test_a_capability_gone_quiet_warns_but_is_not_critical():
    # Worked once, then stopped: a different failure from never having worked,
    # and it gets a softer word so the CRITICAL list stays worth reading.
    rep = DA.build_report(receipts=[], events=_all_lenses(ts=NOW - 90 * 86400),
                          now=NOW, window_days=30)
    assert rep.ok, rep.critical
    assert len(rep.warnings) == len(DA.PAID_DELIVERABLES)
    assert all("nothing delivered in 30d" in w for w in rep.warnings)


def test_deliveries_without_purchases_are_not_findings():
    # Operator generations, dev tokens and comped sessions all look like this.
    # An audit that fires on them gets muted, and a muted audit is how the next
    # real non-delivery is missed.
    rep = DA.build_report(receipts=[], events=_all_lenses(), now=NOW)
    assert rep.ok, rep.critical
    assert rep.undelivered == []


def test_the_unauditable_surface_is_stated_not_omitted():
    # /api/tts records a metrics counter only. A paid capability the audit
    # CANNOT see must be named, or its absence reads as a clean bill.
    rep = DA.build_report(receipts=[], events=_all_lenses(), now=NOW)
    assert any("tts" in n for n in rep.notes)


# --------------------------------------------------------------- the plumbing

def test_a_missing_database_is_itself_critical(tmp_path):
    # An audit that cannot read the ledger proves nothing, and must never
    # report that as "all clear".
    rep = DA.audit_paths(tmp_path / "nope.db", tmp_path / "also-nope.db", now=NOW)
    assert not rep.ok
    assert any("not found" in c for c in rep.critical)


def test_end_to_end_over_real_sqlite_files(tmp_path):
    rdb, tdb = tmp_path / "receipts.db", tmp_path / "telemetry.db"
    with sqlite3.connect(rdb) as c:
        c.execute("CREATE TABLE report_receipts (tx_hash TEXT, seed TEXT, ref TEXT, "
                  "verified INT, wei INT, created INT)")
        c.execute("INSERT INTO report_receipts VALUES ('pi_a','s','r',1,550,?)",
                  (NOW - 2 * HOUR,))
        # An UNVERIFIED receipt is not proof of payment and must not be
        # reconciled — otherwise a failed payment invents a finding.
        c.execute("INSERT INTO report_receipts VALUES ('pi_b','s2','r2',0,550,?)",
                  (NOW - HOUR,))
    with sqlite3.connect(tdb) as c:
        c.execute("CREATE TABLE ai_events (id INTEGER PRIMARY KEY, ts INT, tier TEXT, "
                  "lens TEXT, depth TEXT, query_len INT, query_preview TEXT, "
                  "provider TEXT, model TEXT, response_len INT, source TEXT, "
                  "sel_type TEXT, sel_id TEXT)")
        for d in DA.PAID_DELIVERABLES:
            c.execute("INSERT INTO ai_events (ts, tier, lens, provider, model, "
                      "response_len, source) VALUES (?,?,?,?,?,?,?)",
                      (NOW - HOUR, "oracle", d.lens, "anthropic", "m", 10, "llm"))

    rep = DA.audit_paths(rdb, tdb, now=NOW)
    assert rep.paid_count == 1, "only the VERIFIED receipt counts"
    assert rep.undelivered == []
    assert rep.ok, rep.critical


def test_the_cli_exits_nonzero_on_critical(tmp_path, capsys):
    # So a cron job or a deploy gate can actually fail on this.
    rc_code = DA.main(["--receipts-db", str(tmp_path / "x.db"),
                       "--telemetry-db", str(tmp_path / "y.db")])
    assert rc_code == 1
    assert "CRITICAL" in capsys.readouterr().out
