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

from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

import asyncio
import datetime as dt

import ephemeris as E
import entitlements as ENT
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
from tarot_models import (
    ArcanaForecastRequest,
    ArcanaForecastResponse,
    NatalArcanaSignature,
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

app = FastAPI(title="Astrological Analysis Environment", version="1.0.0")

# Vite dev server + any local origin during development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("AAE_CORS", "*").split(","),
    # Token auth uses localStorage (not cookies), so credentialed CORS is
    # unnecessary — and the wildcard origin above is invalid when paired with it.
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "ephemeris": "swiss-files" if E._USING_FILES else "moshier",
        "ai": ai_status(),
        "tts": T.tts_status(),
    }


@app.post("/api/generate-chart", response_model=ChartResponse)
async def generate_chart(req: ChartRequest, entitlement: Optional[str] = None):
    try:
        result = E.calculate_chart(req)
        tier = ENT.entitlement_status(entitlement).get("tier", "free")
        asyncio.create_task(TEL.log_chart(req.model_dump(), tier=tier))
        return result
    except Exception as exc:  # surface a clean error to the client
        raise HTTPException(status_code=400, detail=f"chart calculation failed: {exc}")


@app.post("/api/transits", response_model=TransitResponse)
async def transits(req: TransitRequest):
    try:
        jd = E.julian_day_from_iso(req.transit_iso)
        natal = E.calculate_chart(req.natal)
        transiting = E.calculate_transiting_planets(jd, req.natal)
        cross = E.aspects_between(natal.planets, transiting)
        return TransitResponse(
            transiting=transiting, aspects_to_natal=cross, transit_iso=req.transit_iso
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"transit calculation failed: {exc}")


@app.post("/api/ai-ask")
async def ai_ask(req: AIRequest):
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
    asyncio.create_task(TEL.log_ai(
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
        ok, verified, note = await ENT.verify_eth_payment(req.tx_hash)
    else:
        # Non-EVM chains: honour-system trust mode (flagged unverified).
        ok, verified, note = (bool(req.tx_hash.strip()), False, "accepted in trust mode")
    if not ok:
        raise HTTPException(status_code=402, detail=note)
    ent = ENT.mint_entitlement("supporter", ref=req.tx_hash[:18], verified=verified)
    asyncio.create_task(TEL.log_tier(
        action="donate_verify", tier="supporter", verified=verified, ref=req.tx_hash[:18]
    ))
    return {"granted": True, "note": note, "entitlement": ent}


@app.get("/api/entitlement")
async def get_entitlement(token: Optional[str] = None):
    """Validate an entitlement token (passed as ?token=...)."""
    return ENT.entitlement_status(token)


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
        raise HTTPException(status_code=502, detail=f"voice list failed: {exc}")


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
        raise HTTPException(status_code=502, detail=f"tts failed: {exc}")
    return Response(content=audio, media_type="audio/mpeg",
                    headers={"Cache-Control": "no-store"})


@app.post("/api/ai-ask-stream")
async def ai_ask_stream(req: AIRequest):
    """Server-Sent Events stream of Astra's reflection as it is generated."""

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
        asyncio.create_task(TEL.log_ai(
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

_DEV_TOKEN = os.environ.get("AAE_DEV_TOKEN", "").strip()


class FeatureEvent(BaseModel):
    name: str
    props: Optional[dict] = None
    session_id: Optional[str] = None


@app.post("/api/telemetry/event", status_code=204)
async def telemetry_event(ev: FeatureEvent):
    """Accept a UI event from the frontend — fire-and-forget, never blocks."""
    asyncio.create_task(TEL.log_feature(ev.name, ev.props, ev.session_id))


@app.get("/api/admin/stats")
async def admin_stats(token: Optional[str] = None):
    if not _DEV_TOKEN or token != _DEV_TOKEN:
        raise HTTPException(status_code=403, detail="forbidden")
    return await asyncio.to_thread(TEL.summary)


# --------------------------------------------------------------------------- #
# Forecast
# --------------------------------------------------------------------------- #

_NATAL_EXCLUDE = {"Descendant", "Imum Coeli", "South Node", "Part of Fortune",
                  "Vertex", "Lilith"}


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
            for p in chart.planets:
                if p.id not in _NATAL_EXCLUDE:
                    natal_positions[p.id] = p.longitude

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
        raise HTTPException(status_code=400, detail=f"forecast failed: {exc}")


# --------------------------------------------------------------------------- #
# Astra Arcana — natal tarot (symbolic mirror, never deterministic prediction)
# --------------------------------------------------------------------------- #


@app.post("/api/natal-arcana", response_model=NatalArcanaSignature)
async def natal_arcana(req: ChartResponse):
    """Deterministic natal arcana signature. No AI, works fully offline."""
    try:
        return TAROT.build_natal_arcana_signature(req)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"natal arcana failed: {exc}")


@app.post("/api/tarot-reading", response_model=TarotReadingResponse)
async def tarot_reading(req: TarotReadingRequest):
    """
    Chart-weighted, deterministic tarot reading. The core (signature, draw,
    static meanings/lessons/activities) is AI-free and offline. When
    `include_ai` is set, an enriched interpretation is layered on for paid tiers,
    falling back silently to the deterministic prose on any failure.
    """
    try:
        reading = TAROT.build_reading_core(req)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"tarot reading failed: {exc}")

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
        )
        ai = await interpret_arcana(ARCANA_SYSTEM, user, tier=tier)
        if ai.get("source") == "llm" and ai.get("text"):
            reading.interpretation = ai["text"]
            reading.ai_source = "llm"
        else:
            reading.ai_source = "offline"
        asyncio.create_task(TEL.log_ai(
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
        natal_positions = {
            p.id: p.longitude for p in req.chart.planets if p.id not in _NATAL_EXCLUDE
        }
        start = dt.date.today()
        events = await asyncio.to_thread(
            generate_forecast, natal_positions, start, days, req.min_sig
        )
        cards = TAROT.daily_arcana_from_events(events, start.isoformat(), days)
        return {"start": start.isoformat(), "days": days, "cards": cards}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"arcana forecast failed: {exc}")


# --------------------------------------------------------------------------- #
# Relationship astrology — synastry / composite / Davison (symbolic, not fate)
# --------------------------------------------------------------------------- #


@app.post("/api/synastry", response_model=SynastryResponse)
async def synastry(req: SynastryRequest):
    """Two natal charts: inter-aspects + house-overlay grid."""
    try:
        return await asyncio.to_thread(SYN.compute_synastry, req)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"synastry failed: {exc}")


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
        raise HTTPException(status_code=400, detail=f"composite failed: {exc}")


@app.post("/api/davison", response_model=DavisonChart)
async def davison(req: SynastryRequest):
    """Davison chart — great-circle geographic + temporal midpoint, real ephemeris."""
    try:
        return await asyncio.to_thread(SYN.davison_chart, req.person_a, req.person_b)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"davison failed: {exc}")


@app.post("/api/synastry-tarot", response_model=SynastryTarotResponse)
async def synastry_tarot(req: SynastryRequest):
    """Relationship tarot: both natal arcana signatures + a weighted bond card."""
    try:
        a = E.calculate_chart(req.person_a)
        b = E.calculate_chart(req.person_b)
        return SYN.synastry_tarot(a, b)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"synastry tarot failed: {exc}")


# --------------------------------------------------------------------------- #
# Predictive timing — progressions / solar returns / eclipses (symbolic)
# --------------------------------------------------------------------------- #


@app.post("/api/progressed-chart", response_model=ProgressedChart)
async def progressed_chart(req: ProgressedRequest):
    """Secondary ('day for a year') progressed chart + aspects to natal."""
    try:
        return await asyncio.to_thread(PRED.progressed_chart, req.natal, req.target_iso)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"progression failed: {exc}")


@app.post("/api/solar-return", response_model=SolarReturnChart)
async def solar_return(req: SolarReturnRequest):
    """Solar return chart for the given year (optionally relocated)."""
    try:
        return await asyncio.to_thread(
            PRED.solar_return, req.natal, req.year, req.lat, req.lng
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"solar return failed: {exc}")


@app.post("/api/eclipse-timeline", response_model=EclipseTimelineResponse)
async def eclipse_timeline(req: EclipseRequest):
    """Upcoming solar/lunar eclipses and the natal points they activate."""
    try:
        return await asyncio.to_thread(
            PRED.eclipse_timeline, req.natal, req.start_iso, req.count
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"eclipse timeline failed: {exc}")


# --------------------------------------------------------------------------- #
# Advanced techniques — harmonics / midpoint trees / fixed stars (symbolic)
# --------------------------------------------------------------------------- #


@app.post("/api/harmonic-chart", response_model=HarmonicChart)
async def harmonic_chart(req: HarmonicRequest):
    """Nth-harmonic chart (positions × N mod 360) + harmonic conjunctions."""
    try:
        return await asyncio.to_thread(ADV.harmonic_chart, req.natal, req.harmonic)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"harmonic chart failed: {exc}")


@app.post("/api/midpoint-tree", response_model=MidpointTreeResponse)
async def midpoint_tree(req: MidpointRequest):
    """Ebertin 90° dial midpoint tree: bodies sitting on planetary midpoints."""
    try:
        return await asyncio.to_thread(ADV.midpoint_tree, req.natal, req.orb)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"midpoint tree failed: {exc}")


@app.post("/api/fixed-stars", response_model=FixedStarResponse)
async def fixed_stars(req: FixedStarRequest):
    """Conjunctions of natal bodies to major fixed stars (precession-adjusted)."""
    try:
        return await asyncio.to_thread(ADV.fixed_star_hits, req.natal, req.orb)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"fixed stars failed: {exc}")


@app.post("/api/suggestions")
async def suggestions(req: AIRequest):
    """
    Navigational suggestions: find the most-tenanted house, then ask Astra for
    introspective questions + one exercise grounded in that house's themes.
    """
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
