"""
main.py
=======
FastAPI surface for the Astrological Analysis Environment.

Endpoints:
  GET  /api/health              – liveness + ephemeris + AI + TTS status
  POST /api/generate-chart      – full natal chart (planets, houses, aspects, patterns)
  POST /api/transits            – transiting positions + aspects to a natal chart
  POST /api/ai-ask              – reflective interpretation (non-streaming)
  POST /api/ai-ask-stream       – same, streamed as SSE
  POST /api/suggestions         – navigational questions for the most-tenanted house
  POST /api/forecast            – upcoming stations, sky aspects, personal transits
  POST /api/natal-arcana        – deterministic natal tarot signature (no AI)
  POST /api/tarot-reading       – chart-weighted spread + optional AI enrichment
  POST /api/arcana-forecast     – daily transit card overlay (Phase 7)
  POST /api/learning-path       – deterministic archetypal learning path (Classroom)
  POST /api/arcana-calendar     – export forecast as an .ics calendar (ritual/journal)
  POST /api/oracle-report       – Fable 5 long-form report (oracle tier; offline fallback)
  POST /api/course              – Fable-designed personal curriculum (oracle tier)
  POST /api/personal-report     – deluxe compiled edition (optional post-Oracle product)
  POST /api/personal-report/purchase – separate purchase rail: mint a report claim (PDF-2)
  POST /api/deck-art            – deterministic deck-art prompts (Studio)
  POST /api/deck-art-image      – render one plate via OpenAI images (oracle tier)
  POST /api/synastry            – two-chart inter-aspects + house grid
  POST /api/composite           – midpoint composite chart
  POST /api/davison             – Davison time/space midpoint chart
  POST /api/synastry-tarot      – relationship tarot bond
  POST /api/progressed-chart    – secondary progressions (day for a year)
  POST /api/solar-return        – solar return chart for a given year
  POST /api/eclipse-timeline    – upcoming eclipses + natal activations
  POST /api/harmonic-chart      – Nth-harmonic chart
  POST /api/midpoint-tree       – Ebertin midpoint tree (90° dial)
  POST /api/fixed-stars         – natal conjunctions to fixed stars
  GET  /api/tts/voices          – available ElevenLabs voices
  POST /api/tts                 – synthesize speech (MP3); supporter feature
  GET  /api/treasury            – funding allocation + EVM treasury address
  POST /api/donate/verify       – verify a tx hash and mint an entitlement token
  GET  /api/entitlement         – validate an entitlement token (?token=...)
  POST /api/telemetry/event     – ingest a UI feature event (fire-and-forget)
  GET  /api/admin/stats         – admin summary (dev token required)

Run:  uvicorn main:app --reload --port 8787
"""

from __future__ import annotations

import os
from typing import Optional

# Load .env BEFORE importing modules that read configuration at import time
# (ai.py / ephemeris.py capture env vars when first imported).
try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:  # dotenv is optional
    pass

import json as _json

from fastapi import FastAPI, Header, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

import asyncio
import datetime as dt
import logging

import ephemeris as E
import entitlements as ENT
import ratelimit as RL
import receipts as RCPT
import telemetry as TEL
import treasury as TR
import tts as T
from ai import ai_status, interpret, interpret_arcana, interpret_stream
from forecast import generate_forecast
from models import (
    AIRequest,
    ChartRequest,
    ChartResponse,
    TransitRequest,
    TransitResponse,
)
import tarot as TAROT
import arcana_calendar as CAL
import course as COURSE
import deck_art as DA
import plate_art as PLATE
import oracle_report as ORACLE
import personal_report as PERSONAL
from tarot_models import (
    ArcanaCalendarRequest,
    ArcanaForecastRequest,
    ArcanaForecastResponse,
    CourseRequest,
    CourseResponse,
    DeckArtRequest,
    DeckArtResponse,
    LearningPathRequest,
    LearningPathResponse,
    NatalArcanaSignature,
    OracleReportRequest,
    OracleReportResponse,
    PersonalReportRequest,
    PersonalReportResponse,
    TarotReadingRequest,
    TarotReadingResponse,
)
from tarot_prompts import ARCANA_SYSTEM, build_arcana_user_prompt
import synastry as SYN
from synastry import (
    CompositeChart,
    DavisonChart,
    SynastryRequest,
    SynastryResponse,
    SynastryTarotResponse,
)
import predictive as PRED
from predictive import (
    EclipseRequest,
    EclipseTimelineResponse,
    ProgressedChart,
    ProgressedRequest,
    SolarReturnChart,
    SolarReturnRequest,
)
import advanced as ADV
from advanced import (
    FixedStarRequest,
    FixedStarResponse,
    HarmonicChart,
    HarmonicRequest,
    MidpointRequest,
    MidpointTreeResponse,
)

# Refuse to boot on an insecure production configuration (fail closed):
# production + trust mode enabled, or production + default HMAC secret.
ENT.assert_safe_boot()

app = FastAPI(title="Astrological Analysis Environment", version="1.0.0")

# Vite dev server + any local origin during development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.environ.get("AAE_CORS", "*").split(",") if o.strip()],
    # Token auth uses localStorage (not cookies), so credentialed CORS is
    # unnecessary — and the wildcard origin above is invalid when paired with it.
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

_log = logging.getLogger("aae")


def _client_error(label: str, exc: Exception, status: int = 400) -> HTTPException:
    """Log the full exception server-side; hand the client only a generic label
    (raw exception text can leak paths/config/internals — issue #54 §3.4)."""
    _log.exception("%s: %s", label, exc)
    return HTTPException(status_code=status, detail=label)



@app.middleware("http")
async def _security_headers(request, call_next):
    """Set defensive response headers on every response. The API serves JSON/audio
    (never HTML), so a locked-down CSP is safe; HSTS is a no-op over plain HTTP."""
    resp = await call_next(request)
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("X-Frame-Options", "DENY")
    resp.headers.setdefault("Content-Security-Policy",
                            "default-src 'none'; frame-ancestors 'none'")
    resp.headers.setdefault("Referrer-Policy", "no-referrer")
    resp.headers.setdefault("Strict-Transport-Security",
                            "max-age=63072000; includeSubDomains")
    return resp


def _spawn(coro) -> None:
    """Fire-and-forget a background coroutine (telemetry) WITHOUT silently
    swallowing its exception — an unretrieved task exception is logged, not lost."""
    task = asyncio.create_task(coro)

    def _done(t: "asyncio.Task") -> None:
        if not t.cancelled() and t.exception() is not None:
            _log.warning("background task failed: %r", t.exception())

    task.add_done_callback(_done)


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "personal_mode": ENT.personal_mode(),
        "ephemeris": "swiss-files" if E._USING_FILES else "moshier",
        # ai_status probes local providers (up to ~1.5s each on a cache miss)
        # — keep it off the event loop.
        "ai": await asyncio.to_thread(ai_status),
        "tts": T.tts_status(),
    }


@app.post("/api/generate-chart", response_model=ChartResponse)
async def generate_chart(req: ChartRequest, entitlement: Optional[str] = None):
    try:
        # Swiss computation off the event loop — a synchronous calculate_chart
        # here serializes every concurrent request (issue #54 §3.2).
        result = await asyncio.to_thread(E.calculate_chart, req)
        tier = ENT.entitlement_status(entitlement).get("tier", "free")
        _spawn(TEL.log_chart(req.model_dump(), tier=tier))
        return result
    except Exception as exc:  # surface a clean error to the client
        raise _client_error("chart calculation failed", exc)


def _compute_transits(req: TransitRequest) -> TransitResponse:
    jd = E.julian_day_from_iso(req.transit_iso)
    natal = E.calculate_chart(req.natal)
    transiting = E.calculate_transiting_planets(jd, req.natal)
    cross = E.aspects_between(natal.planets, transiting)
    return TransitResponse(
        transiting=transiting, aspects_to_natal=cross, transit_iso=req.transit_iso
    )


@app.post("/api/transits", response_model=TransitResponse)
async def transits(req: TransitRequest):
    try:
        return await asyncio.to_thread(_compute_transits, req)
    except Exception as exc:
        raise _client_error("transit calculation failed", exc)


@app.post("/api/ai-ask")
async def ai_ask(req: AIRequest, request: Request):
    RL.check(request, "ai", req.entitlement)
    if req.depth == "deep":
        _require_supporter(req.entitlement)
    tier = ENT.entitlement_status(req.entitlement).get("tier", "free")
    result = await interpret(
        query=req.query,
        chart=req.chart.model_dump(),
        lens=req.lens,
        selected_type=req.selected_type,
        selected_id=req.selected_id,
        depth=req.depth,
        tier=tier,
    )
    _spawn(TEL.log_ai(
        tier=tier, lens=req.lens, depth=req.depth, query=req.query,
        provider=result.get("provider", ""), model=result.get("model", ""),
        response_len=len(result.get("interpretation", "")),
        source=result.get("source", "llm"),
        sel_type=req.selected_type, sel_id=req.selected_id,
    ))
    return result


# --------------------------------------------------------------------------- #
# Treasury + open-paywall entitlements
# --------------------------------------------------------------------------- #


@app.get("/api/treasury")
async def get_treasury():
    """Public treasury + funding-allocation info for the support dashboard."""
    return TR.treasury_info()


class DonateVerifyRequest(BaseModel):
    tx_hash: str
    chain: str = "evm"
    amount_usd: Optional[float] = None


@app.post("/api/donate/verify")
async def donate_verify(req: DonateVerifyRequest):
    """
    Verify a support contribution and mint an entitlement token. On EVM we check
    the tx on-chain when an RPC is configured; otherwise trust mode applies.
    """
    if req.chain == "evm":
        ok, verified, note, value_wei = await ENT.verify_eth_payment_details(req.tx_hash)
    else:
        # Non-EVM chains: no on-chain check here — gated behind dev trust mode.
        ok, verified, note = ENT.accept_offchain_payment(req.tx_hash)
        value_wei = 0
    if not ok:
        raise HTTPException(status_code=402, detail=note)
    # Oracle tier only for an on-chain-verified value at/above AAE_ORACLE_MIN_WEI
    # (explicitly configured); everything else — incl. trust mode — is supporter.
    tier = ENT.paid_tier(verified, value_wei)
    ent = ENT.mint_entitlement(tier, ref=req.tx_hash[:18], verified=verified)
    _spawn(TEL.log_tier(
        action="donate_verify", tier=tier, verified=verified, ref=req.tx_hash[:18]
    ))
    return {"granted": True, "tier": tier, "note": note, "entitlement": ent}


class ReportPurchaseRequest(BaseModel):
    tx_hash: str
    chain: str = "evm"
    seed: str                            # the Oracle session the claim binds to
    entitlement: Optional[str] = None    # oracle tier required


@app.post("/api/personal-report/purchase")
async def personal_report_purchase(req: ReportPurchaseRequest, request: Request):
    """PDF-2 — the deluxe edition's SEPARATE purchase rail. Verifies a
    contribution (on-chain when an RPC is configured; dev trust mode otherwise
    — fails closed in production) against the AAE_REPORT_MIN_WEI product price
    and mints a report token bound to ONE Oracle session seed. Oracle tier is
    still required: the product only exists post-Oracle.
    """
    RL.check(request, "oracle", req.entitlement)   # shares the paid-path budget
    tier = ENT.entitlement_status(req.entitlement).get("tier", "free")
    if tier != "oracle":
        raise HTTPException(
            status_code=402,
            detail="oracle entitlement required — the deluxe edition is an "
                   "optional post-Oracle product",
        )
    if not req.seed.strip():
        raise HTTPException(status_code=400, detail="missing oracle session seed")
    if req.chain == "evm":
        ok, verified, note, value_wei = await ENT.verify_eth_payment_details(req.tx_hash)
    else:
        ok, verified, note = ENT.accept_offchain_payment(req.tx_hash)
        value_wei = 0
    if ok:
        ok, note = ENT.report_purchase_allowed(verified, value_wei)
    if ok:
        # Receipt ledger (closes AUDIT_REGRESSION §6): first redemption wins;
        # re-minting for the SAME session stays allowed, a different session
        # needs its own payment. Fails closed if the ledger is unavailable.
        ok, note = RCPT.claim_tx(req.tx_hash, req.seed, verified=verified, wei=value_wei)
    if not ok:
        raise HTTPException(status_code=402, detail=note)
    tok = ENT.mint_report_token(seed=req.seed, ref=req.tx_hash[:18], verified=verified)
    _spawn(TEL.log_tier(
        action="report_purchase", tier=tier, verified=verified, ref=req.tx_hash[:18]
    ))
    return {"granted": True, "product": "personal_report", "note": note,
            "report_token": tok}


@app.get("/api/entitlement")
async def get_entitlement(token: Optional[str] = None,
                          x_aae_token: Optional[str] = Header(None)):
    """Validate an entitlement token.

    Prefer the X-AAE-Token header — a ?token= query string lands in access
    logs and proxy caches (issue #54 §3.4). The query param remains as a
    deprecated fallback for old links.
    """
    return ENT.entitlement_status(x_aae_token or token)


def _require_supporter(token: Optional[str]) -> None:
    if not ENT.entitlement_status(token)["supporter"]:
        raise HTTPException(status_code=402, detail="supporter entitlement required")


class TTSRequest(BaseModel):
    text: str
    voice_id: Optional[str] = None
    entitlement: Optional[str] = None  # supporter token (premium voice is gated)


@app.get("/api/tts/voices")
async def tts_voices():
    """Available ElevenLabs voices (empty list when TTS is not configured)."""
    try:
        return {"available": T.tts_status()["available"], "voices": await T.list_voices()}
    except Exception as exc:
        raise _client_error("voice list failed", exc, status=502)


@app.post("/api/tts")
async def tts(req: TTSRequest):
    """Synthesize speech; returns audio/mpeg. 503 if TTS is not configured."""
    if not T.tts_status()["available"]:
        raise HTTPException(status_code=503, detail="ElevenLabs TTS not configured")
    _require_supporter(req.entitlement)  # premium neural voice is a supporter feature
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="empty text")
    try:
        audio = await T.synthesize(req.text, req.voice_id)
    except Exception as exc:
        raise _client_error("tts failed", exc, status=502)
    return Response(content=audio, media_type="audio/mpeg",
                    headers={"Cache-Control": "no-store"})


@app.post("/api/ai-ask-stream")
async def ai_ask_stream(req: AIRequest, request: Request):
    """Server-Sent Events stream of Astra's reflection as it is generated."""

    RL.check(request, "ai", req.entitlement)
    if req.depth == "deep":
        _require_supporter(req.entitlement)  # in-depth reading is a supporter feature

    tier = ENT.entitlement_status(req.entitlement).get("tier", "free")

    async def gen():
        final: dict = {}
        char_count = 0
        try:
            async for event, payload in interpret_stream(
                query=req.query, chart=req.chart.model_dump(), lens=req.lens,
                selected_type=req.selected_type, selected_id=req.selected_id,
                depth=req.depth, tier=tier,
            ):
                if event == "chunk":
                    char_count += len(payload)
                elif event == "done":
                    final = payload
                yield f"event: {event}\ndata: {_json.dumps(payload)}\n\n"
        except Exception as exc:  # last-resort guard
            yield f"event: error\ndata: {_json.dumps(str(exc))}\n\n"
        _spawn(TEL.log_ai(
            tier=tier, lens=req.lens, depth=req.depth, query=req.query,
            provider=final.get("provider", ""), model=final.get("model", ""),
            response_len=char_count, source=final.get("source", "llm"),
            sel_type=req.selected_type, sel_id=req.selected_id,
        ))

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# --------------------------------------------------------------------------- #
# Telemetry — frontend events + admin dashboard
# --------------------------------------------------------------------------- #
# Operator surfaces are gated via ENT.is_operator: the dev token
# (constant-time compare) — or every request when the instance runs in
# personal mode (Edition P).


class FeatureEvent(BaseModel):
    name: str
    props: Optional[dict] = None
    session_id: Optional[str] = None


@app.post("/api/telemetry/event", status_code=204)
async def telemetry_event(ev: FeatureEvent):
    """Accept a UI event from the frontend — fire-and-forget, never blocks."""
    _spawn(TEL.log_feature(ev.name, ev.props, ev.session_id))


@app.get("/api/admin/stats")
async def admin_stats(token: Optional[str] = None,
                      x_aae_token: Optional[str] = Header(None)):
    """Admin summary. Token via X-AAE-Token header (query param deprecated —
    it leaks into access logs)."""
    if not ENT.is_operator(x_aae_token or token):
        raise HTTPException(status_code=403, detail="forbidden")
    return await asyncio.to_thread(TEL.summary)


# --------------------------------------------------------------------------- #
# Forecast
# --------------------------------------------------------------------------- #

_NATAL_EXCLUDE = {"Descendant", "Imum Coeli", "South Node", "Part of Fortune",
                  "Vertex", "Lilith"}


def _tropical_natal_map(planets, meta) -> dict[str, float]:
    """
    Natal longitudes for the forecast scanner, in the TROPICAL frame — the
    scanner's transiting positions are tropical, so feeding it a sidereal
    chart's longitudes would sit every aspect an ayanamsha (~24°) off. The
    frame offset is recovered from the chart itself: tropical Sun at the
    chart's Julian Day minus the chart's Sun longitude (0 for tropical charts).
    """
    shift = 0.0
    if meta.get("zodiac") == "sidereal":
        sun = next((p for p in planets if p.id == "Sun"), None)
        jd_s = meta.get("julian_day")
        if sun is not None and jd_s:
            shift = (E.tropical_longitude(float(jd_s), "Sun") - sun.longitude) % 360.0
    return {p.id: (p.longitude + shift) % 360.0
            for p in planets if p.id not in _NATAL_EXCLUDE}


class ForecastRequest(BaseModel):
    natal: ChartRequest
    days: int = 90
    include_natal: bool = True
    include_transit_transit: bool = True
    min_sig: str = "medium"   # "high" | "medium" | "low"


@app.post("/api/forecast")
async def get_forecast(req: ForecastRequest):
    """
    Return upcoming astrological events (stations, sky aspects, transits to
    natal chart) over the next `days` days (max 180).
    """
    try:
        days = min(max(req.days, 7), 180)
        chart = E.calculate_chart(req.natal)

        natal_positions: dict[str, float] = {}
        if req.include_natal:
            natal_positions = _tropical_natal_map(chart.planets, chart.meta)

        start = dt.date.today()
        events = await asyncio.to_thread(
            generate_forecast,
            natal_positions if req.include_natal else {},
            start,
            days,
            req.min_sig,
        )
        return {
            "events": events,
            "start": start.isoformat(),
            "days": days,
            "natal_count": len(natal_positions),
        }
    except Exception as exc:
        raise _client_error("forecast failed", exc)


# --------------------------------------------------------------------------- #
# Astra Arcana — natal tarot (symbolic mirror, never deterministic prediction)
# --------------------------------------------------------------------------- #


@app.post("/api/natal-arcana", response_model=NatalArcanaSignature)
async def natal_arcana(req: ChartResponse):
    """Deterministic natal arcana signature. No AI, works fully offline."""
    try:
        return TAROT.build_natal_arcana_signature(req)
    except Exception as exc:
        raise _client_error("natal arcana failed", exc)


@app.post("/api/tarot-reading", response_model=TarotReadingResponse)
async def tarot_reading(req: TarotReadingRequest, request: Request):
    """
    Chart-weighted, deterministic tarot reading. The core (signature, draw,
    static meanings/lessons/activities) is AI-free and offline. When
    `include_ai` is set, an enriched interpretation is layered on for paid tiers,
    falling back silently to the deterministic prose on any failure.
    """
    if req.include_ai:
        # Only the AI-enriched path costs money — the deterministic draw stays
        # unthrottled (offline-first invariant: free reflection is never gated).
        RL.check(request, "ai", req.entitlement)
    try:
        reading = TAROT.build_reading_core(req)
    except Exception as exc:
        raise _client_error("tarot reading failed", exc)

    tier = ENT.entitlement_status(req.entitlement).get("tier", "free")
    if req.include_ai and tier in ("supporter", "oracle"):
        sig = reading.signature
        drawn = [{
            "position": c.position, "name": c.card.name,
            "orientation": "reversed" if c.reversed else "upright",
            "natal_link": c.natal_link or "",
        } for c in reading.cards]
        user = build_arcana_user_prompt(
            question=req.question, spread=req.spread,
            dominant_element=sig.dominant_element, dominant_modality=sig.dominant_modality,
            themes=sig.themes, shadows=sig.shadows,
            signature_lines=[l.note for l in sig.links], drawn=drawn,
            source_lens=TAROT.source_meta(req.source)["lens"],
        )
        ai = await interpret_arcana(ARCANA_SYSTEM, user, tier=tier)
        if ai.get("source") == "llm" and ai.get("text"):
            reading.interpretation = ai["text"]
            reading.ai_source = "llm"
        else:
            reading.ai_source = "offline"
        _spawn(TEL.log_ai(
            tier=tier, lens="arcana", depth="deep", query=req.question,
            provider=str(ai.get("provider", "")), model=str(ai.get("model", "")),
            response_len=len(reading.interpretation), source=reading.ai_source or "offline",
            sel_type="spread", sel_id=req.spread,
        ))
    return reading


@app.post("/api/arcana-forecast", response_model=ArcanaForecastResponse)
async def arcana_forecast(req: ArcanaForecastRequest):
    """Daily transit card overlay — a thin tarot layer over the forecast engine."""
    try:
        days = min(max(req.days, 1), 30)
        natal_positions = _tropical_natal_map(req.chart.planets, req.chart.meta)
        # The querent's local day is the unit of meaning — resolve from an explicit
        # start_date or an IANA timezone, not the server clock.
        start = TAROT.resolve_local_date(req.start_date, req.timezone)
        events = await asyncio.to_thread(
            generate_forecast, natal_positions, start, days, req.min_sig
        )
        signature = TAROT.build_natal_arcana_signature(req.chart)
        cards = TAROT.daily_arcana_from_events(
            events, start.isoformat(), days, signature
        )
        return {"start": start.isoformat(), "days": days, "cards": cards}
    except Exception as exc:
        raise _client_error("arcana forecast failed", exc)


@app.post("/api/learning-path", response_model=LearningPathResponse)
async def learning_path(req: LearningPathRequest):
    """A deterministic archetypal learning path (Classroom) from chart + source."""
    try:
        return TAROT.build_learning_path(req)
    except Exception as exc:
        raise _client_error("learning path failed", exc)


@app.post("/api/oracle-report", response_model=OracleReportResponse)
async def oracle_report(req: OracleReportRequest, request: Request):
    """The paid Oracle Report — Fable 5 enriched synthesis over the deterministic
    substrate. ORACLE TIER ONLY (the reading fee): fails closed with 402 before
    any work — no substrate is built and the AI layer is never attempted for
    lower tiers. Falls back to a deterministic offline report (honest ai_source)
    if the AI layer is unavailable or the model chain refuses.
    """
    RL.check(request, "oracle", req.entitlement)   # cost cap before any work
    tier = ENT.entitlement_status(req.entitlement).get("tier", "free")
    if tier != "oracle":
        raise HTTPException(
            status_code=402,
            detail="oracle entitlement required — the Oracle Report is a paid reading",
        )
    try:
        result = await ORACLE.generate_oracle_report(req)
    except Exception as exc:
        raise _client_error("oracle report failed", exc)
    _spawn(TEL.log_ai(
        tier=tier, lens="oracle_report", depth="report", query=req.question,
        provider="anthropic" if result.ai_source == "llm" else "offline",
        model=str(result.model or ""), response_len=len(result.report),
        source=result.ai_source, sel_type="spread", sel_id=req.spread,
    ))
    return result


@app.post("/api/course", response_model=CourseResponse)
async def course(req: CourseRequest, request: Request):
    """The Course — a Fable-designed personal curriculum over the chart's
    learning path (anchor → growth edge). ORACLE TIER ONLY, same posture as
    the Oracle Report: 402 before any work, deterministic offline curriculum
    with honest ai_source when the AI layer is unavailable or refuses.
    """
    RL.check(request, "oracle", req.entitlement)   # cost cap before any work
    tier = ENT.entitlement_status(req.entitlement).get("tier", "free")
    if tier != "oracle":
        raise HTTPException(
            status_code=402,
            detail="oracle entitlement required — the Course is a premium "
                   "curriculum composed for your chart",
        )
    try:
        result = await COURSE.generate_course(req)
    except Exception as exc:
        raise _client_error("course failed", exc)
    _spawn(TEL.log_ai(
        tier=tier, lens="course", depth="report", query=req.focus,
        provider="anthropic" if result.ai_source == "llm" else "offline",
        model=str(result.model or ""), response_len=len(result.course),
        source=result.ai_source, sel_type="path", sel_id=result.anchor,
    ))
    return result


@app.post("/api/personal-report", response_model=PersonalReportResponse)
async def personal_report(req: PersonalReportRequest, request: Request):
    """The Astra Arcana Personal Report — deluxe compiled edition, an OPTIONAL
    post-Oracle product. Gated three times, fail closed: (1) oracle tier only
    (402); (2) PDF-2 — the edition is a SEPARATE purchase, so a report token
    minted by /api/personal-report/purchase and bound to this exact session
    seed is required (402; dev/admin token exempt); (3) the referenced Oracle
    session must be genuine — its seed is re-derived from (chart, spread,
    question, date, source) and a mismatch is rejected (409). Falls back to a
    deterministic compiled edition with honest provenance when the AI layer is
    unavailable.
    """
    RL.check(request, "oracle", req.entitlement)   # cost cap before any work
    tier = ENT.entitlement_status(req.entitlement).get("tier", "free")
    if tier != "oracle":
        raise HTTPException(
            status_code=402,
            detail="oracle entitlement required — the Personal Report is an "
                   "optional deluxe edition compiled from your Oracle session",
        )
    if not ENT.is_operator(req.entitlement) and \
            ENT.verify_report_token(req.report_token, req.oracle.seed) is None:
        raise HTTPException(
            status_code=402,
            detail="deluxe purchase required — the Personal Report is a separate "
                   "one-time purchase per Oracle session; verify your "
                   "contribution at /api/personal-report/purchase to unlock it",
        )
    try:
        result = await PERSONAL.generate_personal_report(req)
    except ValueError as exc:
        # Post-Oracle gate: fabricated/foreign session reference.
        raise HTTPException(status_code=409, detail=str(exc))
    except Exception as exc:
        raise _client_error("personal report failed", exc)
    _spawn(TEL.log_ai(
        tier=tier, lens="personal_report", depth="report", query=req.oracle.question,
        provider="anthropic" if result.ai_source == "llm" else "offline",
        model=str(result.model or ""), response_len=len(result.report_markdown),
        source=result.ai_source, sel_type="spread", sel_id=req.oracle.spread,
    ))
    return result


@app.post("/api/deck-art", response_model=DeckArtResponse)
async def deck_art(req: DeckArtRequest):
    """Deck-Art Prompt Studio — deterministic image PROMPTS (no image generation).

    One card when `card_id` is set, else the soul deck (every natal-signature
    trump). Stable per (chart, card, source system); lineage shapes the imagery.
    """
    try:
        return DA.build_deck_art(req)
    except ValueError as exc:
        # Controlled validation message (e.g. unknown card id) — safe to show.
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise _client_error("deck art failed", exc)


@app.post("/api/deck-art-image", response_model=PLATE.PlateResponse)
async def deck_art_image(req: PLATE.PlateRequest, request: Request):
    """Render ONE deck-art plate (NEXT_ARC P3) — the Studio's deterministic
    brief painted through the OpenAI Images API. ORACLE TIER ONLY (each plate
    is real money); 503 when the image layer is unconfigured — the prompts
    themselves stay free and offline.
    """
    RL.check(request, "oracle", req.entitlement)   # cost cap before any work
    tier = ENT.entitlement_status(req.entitlement).get("tier", "free")
    if tier != "oracle":
        raise HTTPException(
            status_code=402,
            detail="oracle entitlement required — rendering a plate is a paid "
                   "image generation",
        )
    if not PLATE.plates_available():
        raise HTTPException(
            status_code=503,
            detail="image layer not configured — set AAE_OPENAI_API_KEY; the "
                   "deterministic prompts in the Studio work without it",
        )
    try:
        result = await PLATE.render_plate(req)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise _client_error("plate render failed", exc)
    _spawn(TEL.log_ai(
        tier=tier, lens="deck_art_image", depth="image", query=req.card_id,
        provider="openai", model=result.model, response_len=len(result.image_b64),
        source="llm", sel_type="card", sel_id=req.card_id,
    ))
    return result


@app.post("/api/arcana-calendar")
async def arcana_calendar(req: ArcanaCalendarRequest):
    """Export the arcana forecast as an .ics calendar (one ritual/journal per day).

    Event dates are the querent's local dates (start_date / timezone, Phase 1.4).
    """
    try:
        days = min(max(req.days, 1), 30)
        natal_positions = _tropical_natal_map(req.chart.planets, req.chart.meta)
        start = TAROT.resolve_local_date(req.start_date, req.timezone)
        events = await asyncio.to_thread(
            generate_forecast, natal_positions, start, days, req.min_sig
        )
        signature = TAROT.build_natal_arcana_signature(req.chart)
        cards = TAROT.daily_arcana_from_events(events, start.isoformat(), days, signature)
        ics = CAL.build_ics(cards, kind=req.kind, calendar_name="Astra Arcana")
    except Exception as exc:
        raise _client_error("arcana calendar failed", exc)
    filename = f"astra-arcana-{start.isoformat()}.ics"
    return Response(
        content=ics,
        media_type="text/calendar; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )


# --------------------------------------------------------------------------- #
# Relationship astrology — synastry / composite / Davison (symbolic, not fate)
# --------------------------------------------------------------------------- #


@app.post("/api/synastry", response_model=SynastryResponse)
async def synastry(req: SynastryRequest):
    """Two natal charts: inter-aspects + house-overlay grid."""
    try:
        return await asyncio.to_thread(SYN.compute_synastry, req)
    except Exception as exc:
        raise _client_error("synastry failed", exc)


@app.post("/api/composite", response_model=CompositeChart)
async def composite(req: SynastryRequest):
    """Midpoint composite chart (planets, houses, internal aspects, patterns).

    house_method="derived" uses the derived-MC method at the geographic-midpoint
    latitude instead of midpointing each cusp.
    """
    try:
        a = E.calculate_chart(req.person_a)
        b = E.calculate_chart(req.person_b)
        geo_lat, _lng = SYN._geographic_midpoint(
            req.person_a.lat, req.person_a.lng, req.person_b.lat, req.person_b.lng
        )
        return SYN.composite_midpoints(
            a, b, house_method=req.house_method, geo_lat=geo_lat
        )
    except Exception as exc:
        raise _client_error("composite failed", exc)


@app.post("/api/davison", response_model=DavisonChart)
async def davison(req: SynastryRequest):
    """Davison chart — great-circle geographic + temporal midpoint, real ephemeris."""
    try:
        return await asyncio.to_thread(SYN.davison_chart, req.person_a, req.person_b)
    except Exception as exc:
        raise _client_error("davison failed", exc)


@app.post("/api/synastry-tarot", response_model=SynastryTarotResponse)
async def synastry_tarot(req: SynastryRequest):
    """Relationship tarot: both natal arcana signatures + a weighted bond card."""
    try:
        a = E.calculate_chart(req.person_a)
        b = E.calculate_chart(req.person_b)
        return SYN.synastry_tarot(a, b)
    except Exception as exc:
        raise _client_error("synastry tarot failed", exc)


# --------------------------------------------------------------------------- #
# Predictive timing — progressions / solar returns / eclipses (symbolic)
# --------------------------------------------------------------------------- #


@app.post("/api/progressed-chart", response_model=ProgressedChart)
async def progressed_chart(req: ProgressedRequest):
    """Secondary ('day for a year') progressed chart + aspects to natal."""
    try:
        return await asyncio.to_thread(PRED.progressed_chart, req.natal, req.target_iso)
    except Exception as exc:
        raise _client_error("progression failed", exc)


@app.post("/api/solar-return", response_model=SolarReturnChart)
async def solar_return(req: SolarReturnRequest):
    """Solar return chart for the given year (optionally relocated)."""
    try:
        return await asyncio.to_thread(
            PRED.solar_return, req.natal, req.year, req.lat, req.lng
        )
    except Exception as exc:
        raise _client_error("solar return failed", exc)


@app.post("/api/eclipse-timeline", response_model=EclipseTimelineResponse)
async def eclipse_timeline(req: EclipseRequest):
    """Upcoming solar/lunar eclipses and the natal points they activate."""
    try:
        return await asyncio.to_thread(
            PRED.eclipse_timeline, req.natal, req.start_iso, req.count
        )
    except Exception as exc:
        raise _client_error("eclipse timeline failed", exc)


# --------------------------------------------------------------------------- #
# Advanced techniques — harmonics / midpoint trees / fixed stars (symbolic)
# --------------------------------------------------------------------------- #


@app.post("/api/harmonic-chart", response_model=HarmonicChart)
async def harmonic_chart(req: HarmonicRequest):
    """Nth-harmonic chart (positions × N mod 360) + harmonic conjunctions."""
    try:
        return await asyncio.to_thread(ADV.harmonic_chart, req.natal, req.harmonic)
    except Exception as exc:
        raise _client_error("harmonic chart failed", exc)


@app.post("/api/midpoint-tree", response_model=MidpointTreeResponse)
async def midpoint_tree(req: MidpointRequest):
    """Ebertin 90° dial midpoint tree: bodies sitting on planetary midpoints."""
    try:
        return await asyncio.to_thread(ADV.midpoint_tree, req.natal, req.orb)
    except Exception as exc:
        raise _client_error("midpoint tree failed", exc)


@app.post("/api/fixed-stars", response_model=FixedStarResponse)
async def fixed_stars(req: FixedStarRequest):
    """Conjunctions of natal bodies to major fixed stars (precession-adjusted)."""
    try:
        return await asyncio.to_thread(ADV.fixed_star_hits, req.natal, req.orb)
    except Exception as exc:
        raise _client_error("fixed stars failed", exc)


@app.post("/api/suggestions")
async def suggestions(req: AIRequest, request: Request):
    """
    Navigational suggestions: find the most-tenanted house, then ask Astra for
    introspective questions + one exercise grounded in that house's themes.
    """
    RL.check(request, "ai", req.entitlement)
    chart = req.chart
    counts: dict[int, int] = {}
    for p in chart.planets:
        if p.id in {"Ascendant", "Midheaven", "Descendant", "Imum Coeli"}:
            continue
        counts[p.house] = counts.get(p.house, 0) + 1
    focal = max(counts, key=counts.get) if counts else 1
    query = (
        f"My most tenanted house is the {focal}th. Offer 3 introspective questions "
        f"and 1 actionable growth exercise grounded in its themes."
    )
    result = await interpret(
        query=query, chart=chart.model_dump(), lens=req.lens,
        selected_type="house", selected_id=str(focal),
    )
    result["focal_house"] = focal
    return result
