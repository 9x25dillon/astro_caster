"""
tts.py
======
Premium server-side text-to-speech via ElevenLabs. Optional and pluggable: if
ELEVENLABS_API_KEY is unset, the API reports tts as unavailable and the frontend
transparently falls back to the browser's Web Speech voice.

Env:
    ELEVENLABS_API_KEY    your key (absent -> feature disabled)
    ELEVENLABS_VOICE_ID   default "21m00Tcm4TlvDq8ikWAM" (Rachel — warm, calm)
    ELEVENLABS_MODEL      default "eleven_multilingual_v2"
"""

from __future__ import annotations

import os
import re
from typing import List, Optional
from urllib.parse import quote

import httpx

_BASE = "https://api.elevenlabs.io/v1"
_API_KEY = os.environ.get("ELEVENLABS_API_KEY", "").strip()
_VOICE_ID = os.environ.get("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM").strip()
_MODEL = os.environ.get("ELEVENLABS_MODEL", "eleven_multilingual_v2").strip()

# ElevenLabs accepts up to 5000 chars per request; we stay safely under.
_CHUNK_CHARS = 4800
# Hard cap on total synthesized text to avoid runaway billing.
_MAX_TOTAL_CHARS = 25_000

# Last successful /voices payload. ElevenLabs occasionally drops a connection
# mid-request (observed live: RemoteProtocolError, "server disconnected");
# the voice list changes rarely, so serving the last-known-good list beats
# surfacing a 502 for a picker dropdown.
_voices_cache: List[dict] = []

# ElevenLabs voice ids are short base62 tokens. voice_id arrives from the
# request body and lands in the upstream URL path — an unvalidated value
# could steer the request at a different ElevenLabs endpoint (partial SSRF).
_VOICE_ID_RE = re.compile(r"^[A-Za-z0-9]{8,64}$")


def _safe_voice_id(voice_id: Optional[str]) -> str:
    vid = (voice_id or _VOICE_ID).strip()
    if not _VOICE_ID_RE.fullmatch(vid):
        raise ValueError("invalid voice id")
    return vid


def tts_status() -> dict:
    return {
        "available": bool(_API_KEY),
        "default_voice_id": _VOICE_ID if _API_KEY else None,
        "model": _MODEL if _API_KEY else None,
    }


def speakable(text: str) -> str:
    """Strip Astra's light markdown so the spoken output reads naturally."""
    text = re.sub(r"^##\s*(.+)$", r"\1. ", text, flags=re.MULTILINE)
    text = re.sub(r"\*\*(.*?)\*\*", r"\1", text)
    text = re.sub(r"^[-•]\s*", ", ", text, flags=re.MULTILINE)
    text = re.sub(r"[#*_`>]", "", text)
    text = re.sub(r"\n{2,}", ". ", text)
    text = re.sub(r"\s*\n\s*", " ", text)
    text = re.sub(r"\s{2,}", " ", text)
    return text.strip()[:_MAX_TOTAL_CHARS]


def _sentence_chunks(text: str, max_chars: int) -> List[str]:
    """Split at sentence boundaries to stay under ElevenLabs' per-request limit."""
    sentences = re.split(r'(?<=[.!?])\s+', text)
    chunks: List[str] = []
    current = ""
    for s in sentences:
        if not s:
            continue
        if len(current) + len(s) + 1 <= max_chars:
            current = (current + " " + s).strip() if current else s
        else:
            if current:
                chunks.append(current)
            # Sentence longer than limit — hard split
            while len(s) > max_chars:
                chunks.append(s[:max_chars])
                s = s[max_chars:]
            current = s
    if current:
        chunks.append(current)
    return chunks or [text[:max_chars]]


async def synthesize(text: str, voice_id: Optional[str] = None) -> bytes:
    """
    Return MP3 audio bytes for the given text. For long readings the text is
    split into sentence-boundary chunks and the audio segments are concatenated,
    so the full reading is always spoken regardless of length.
    Raises on misconfig or upstream error.
    """
    if not _API_KEY:
        raise RuntimeError("ElevenLabs not configured")
    vid = quote(_safe_voice_id(voice_id), safe="")
    headers = {"xi-api-key": _API_KEY, "Content-Type": "application/json", "Accept": "audio/mpeg"}
    voice_settings = {"stability": 0.62, "similarity_boost": 0.82, "style": 0.35}

    chunks = _sentence_chunks(speakable(text), _CHUNK_CHARS)
    audio_parts: List[bytes] = []
    prev_request_id: Optional[str] = None

    async with httpx.AsyncClient(timeout=90.0) as client:
        for chunk in chunks:
            payload: dict = {
                "text": chunk,
                "model_id": _MODEL,
                "voice_settings": voice_settings,
            }
            # Chain requests so ElevenLabs can maintain prosodic continuity
            # across chunk boundaries (no audible stitch between segments).
            if prev_request_id:
                payload["previous_request_id"] = prev_request_id
            try:
                r = await client.post(
                    f"{_BASE}/text-to-speech/{vid}", headers=headers, json=payload
                )
            except httpx.TransportError:
                # Transient drop (connection reset, mid-request disconnect):
                # one retry so a single upstream blip doesn't waste the
                # already-synthesized chunks. Auth/quota errors are HTTP
                # statuses, not transport errors — they still raise below.
                r = await client.post(
                    f"{_BASE}/text-to-speech/{vid}", headers=headers, json=payload
                )
            r.raise_for_status()
            audio_parts.append(r.content)
            prev_request_id = r.headers.get("request-id") or r.headers.get("x-request-id")

    return b"".join(audio_parts)


async def list_voices() -> List[dict]:
    """Return [{voice_id, name, category}] or [] if unavailable.

    Transport-level failures (connection dropped, reset, timed out) retry
    once, then fall back to the last successful list — the picker degrades
    to stale-or-empty instead of erroring. Real HTTP errors (bad key, quota)
    still raise so misconfiguration stays visible.
    """
    global _voices_cache
    if not _API_KEY:
        return []
    headers = {"xi-api-key": _API_KEY}
    async with httpx.AsyncClient(timeout=20.0) as client:
        try:
            try:
                r = await client.get(f"{_BASE}/voices", headers=headers)
            except httpx.TransportError:
                r = await client.get(f"{_BASE}/voices", headers=headers)
        except httpx.TransportError:
            return _voices_cache
        r.raise_for_status()
        data = r.json()
    _voices_cache = [
        {"voice_id": v["voice_id"], "name": v.get("name", "?"), "category": v.get("category", "")}
        for v in data.get("voices", [])
    ]
    return _voices_cache
