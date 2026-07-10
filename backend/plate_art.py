"""
plate_art.py
============
Deck-art plates (NEXT_ARC P3): render the Studio's deterministic art briefs
into actual card images through the OpenAI Images API.

Division of labor mirrors the AI text layer: deck_art.py's PROMPT is the
deterministic, offline, zero-cost artifact — a pure function of (natal
signature, card, source). This module is the removable, network-only paint
layer on top: no key (or any failure) leaves the Studio exactly as it was,
prompts intact. There is no "offline image"; honesty over pretense.

Cost posture: one plate is real money (~$0.03–0.25 depending on quality), so
the endpoint sits behind the oracle tier and the oracle rate bucket, exactly
like the Fable reports. The raw HTTP API is used via httpx (already a
dependency) — no OpenAI SDK.

Env:
    AAE_OPENAI_API_KEY   enables the plate layer (unset => 503, prompts still work)
    AAE_IMAGE_MODEL      default gpt-image-1
    AAE_IMAGE_SIZE       default 1024x1536 (portrait — a card plate)
    AAE_IMAGE_QUALITY    default medium (low|medium|high — cost dial)
"""

from __future__ import annotations

import logging
import os
from typing import Literal, Optional

import httpx
from pydantic import BaseModel

import deck_art as DA
import tarot as TAROT
from models import ChartResponse
from tarot_models import DISCLAIMER, SourceSystem

_log = logging.getLogger("aae.plate_art")

_OPENAI_KEY = os.environ.get("AAE_OPENAI_API_KEY", "").strip()
_IMAGE_MODEL = os.environ.get("AAE_IMAGE_MODEL", "gpt-image-1")
_IMAGE_SIZE = os.environ.get("AAE_IMAGE_SIZE", "1024x1536")
_IMAGE_QUALITY = os.environ.get("AAE_IMAGE_QUALITY", "medium")
_TIMEOUT_S = float(os.environ.get("AAE_IMAGE_TIMEOUT", "180"))

_API_URL = "https://api.openai.com/v1/images/generations"


class PlateRequest(BaseModel):
    chart: ChartResponse
    card_id: str                           # one plate per call — each is paid
    source: SourceSystem = "golden_dawn"
    entitlement: Optional[str] = None      # REQUIRED in practice: oracle tier only


class PlateResponse(BaseModel):
    card_id: str
    title: str
    prompt: str                            # the deterministic brief that was painted
    image_b64: str                         # PNG, base64 — the client builds a data URL
    model: str
    size: str
    quality: str
    ai_source: Literal["openai"]           # provenance: plates are always network-painted
    disclaimer: str = DISCLAIMER


def plates_available() -> bool:
    """Whether the paint layer is configured (key present)."""
    return bool(_OPENAI_KEY)


async def render_plate(req: PlateRequest) -> PlateResponse:
    """Build the deterministic brief, then paint it. Raises RuntimeError when
    the layer is unconfigured and ValueError for an unknown card — the caller
    maps those to 503 / 400."""
    if not _OPENAI_KEY:
        raise RuntimeError(
            "plate layer not configured — set AAE_OPENAI_API_KEY to render "
            "images (the deterministic prompts in the Studio work without it)"
        )
    signature = TAROT.build_natal_arcana_signature(req.chart)
    brief = DA.build_card_prompt(req.card_id, signature, req.source)  # ValueError on bad id

    # The negative prompt folds into the instruction — the Images API takes a
    # single prompt string.
    prompt = f"{brief.prompt} Avoid: {brief.negative_prompt}."
    async with httpx.AsyncClient(timeout=_TIMEOUT_S) as client:
        r = await client.post(
            _API_URL,
            headers={"Authorization": f"Bearer {_OPENAI_KEY}"},
            json={
                "model": _IMAGE_MODEL,
                "prompt": prompt,
                "size": _IMAGE_SIZE,
                "quality": _IMAGE_QUALITY,
                "n": 1,
            },
        )
    if r.status_code != 200:
        # Log the body (it explains quota/policy declines); surface a generic
        # error — the caller wraps it for the client.
        _log.warning("plate render failed %s: %s", r.status_code, r.text[:500])
        raise RuntimeError(f"image API returned {r.status_code}")
    data = r.json()
    b64 = data["data"][0].get("b64_json", "")
    if not b64:
        raise RuntimeError("image API returned no image data")
    return PlateResponse(
        card_id=req.card_id,
        title=brief.title,
        prompt=brief.prompt,
        image_b64=b64,
        model=str(data.get("model") or _IMAGE_MODEL),
        size=_IMAGE_SIZE,
        quality=_IMAGE_QUALITY,
        ai_source="openai",
    )
