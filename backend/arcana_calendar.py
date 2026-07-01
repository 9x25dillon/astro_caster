"""
arcana_calendar.py
==================
Phase 3.2 — Arcana calendar (.ics) export.

Serializes a list of ArcanaDay dicts (from tarot.daily_arcana_from_events) into a
minimal but RFC 5545-correct iCalendar document: one all-day VEVENT per day, with
the drawn card as the summary and a ritual (or journal) prompt in the description.

Kept dependency-free and deterministic: given the same days + kind, byte-for-byte
identical output except DTSTAMP (the generation instant), so re-exports are stable.
UIDs are derived from a stable hash of (date, card, kind), not random, so a
re-imported calendar updates existing events instead of duplicating them.
"""

from __future__ import annotations

import datetime as _dt
import hashlib
from typing import Dict, List, Optional

_PRODID = "-//Astra Arcana//Arcana Calendar//EN"
_UID_DOMAIN = "astra-arcana"


def _escape(text: str) -> str:
    """Escape TEXT per RFC 5545 §3.3.11 (backslash, semicolon, comma, newline)."""
    return (
        (text or "")
        .replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\r\n", "\\n")
        .replace("\n", "\\n")
        .replace("\r", "\\n")
    )


def _fold(line: str) -> str:
    """Fold a content line to <=75 octets per RFC 5545 §3.1, splitting on UTF-8
    character boundaries (a continuation line begins with a single space)."""
    raw = line.encode("utf-8")
    if len(raw) <= 75:
        return line
    out = bytearray()
    count = 0
    first = True
    for ch in line:
        chb = ch.encode("utf-8")
        limit = 75 if first else 74  # continuation lines carry a leading space
        if count + len(chb) > limit:
            out += b"\r\n "
            count = 1  # the leading space
            first = False
        out += chb
        count += len(chb)
    return out.decode("utf-8")


def _uid(date_iso: str, card_id: str, kind: str) -> str:
    h = hashlib.sha256(f"{date_iso}|{card_id}|{kind}".encode()).hexdigest()[:24]
    return f"{h}@{_UID_DOMAIN}"


def build_ics(
    days: List[Dict],
    kind: str = "ritual",
    calendar_name: str = "Astra Arcana",
    now: Optional[_dt.datetime] = None,
) -> str:
    """Render ArcanaDay dicts into an .ics document.

    `kind` selects which prompt anchors the event body: "ritual" leads with the
    alignment action, "journal" leads with the journal prompt. Both include the
    card meaning and the symbolic-mirror framing.
    """
    stamp = (now or _dt.datetime.now(_dt.timezone.utc)).strftime("%Y%m%dT%H%M%SZ")
    lines: List[str] = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        f"PRODID:{_PRODID}",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{_escape(calendar_name)}",
    ]
    for day in days:
        date_iso = day["date"]
        d = _dt.date.fromisoformat(date_iso)
        card = day.get("card", {})
        card_name = card.get("name", "Arcana")
        reversed_flag = day.get("reversed", False)
        orient = " (reversed)" if reversed_flag else ""
        card_id = card.get("id", "card")

        summary = f"✶ {card_name}{orient}"
        primary = (day.get("alignment_action") if kind == "ritual"
                   else day.get("journal_prompt")) or ""
        secondary = (day.get("journal_prompt") if kind == "ritual"
                     else day.get("alignment_action")) or ""
        body_parts = [
            day.get("transit_summary", ""),
            day.get("best_expression", ""),
            (f"Practice: {primary}" if primary else ""),
            (f"Journal: {secondary}" if secondary else ""),
            "Astra Arcana is a symbolic mirror for reflection, not a prediction.",
        ]
        description = "\n".join(p for p in body_parts if p)

        # All-day event: DTSTART;VALUE=DATE and DTEND on the next day (exclusive).
        dtend = (d + _dt.timedelta(days=1)).strftime("%Y%m%d")
        lines += [
            "BEGIN:VEVENT",
            f"UID:{_uid(date_iso, card_id, kind)}",
            f"DTSTAMP:{stamp}",
            f"DTSTART;VALUE=DATE:{d.strftime('%Y%m%d')}",
            f"DTEND;VALUE=DATE:{dtend}",
            f"SUMMARY:{_escape(summary)}",
            f"DESCRIPTION:{_escape(description)}",
            "TRANSP:TRANSPARENT",
            "END:VEVENT",
        ]
    lines.append("END:VCALENDAR")
    # RFC 5545 mandates CRLF line endings; fold each content line first.
    return "\r\n".join(_fold(ln) for ln in lines) + "\r\n"
