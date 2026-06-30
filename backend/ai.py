"""
ai.py
=====
The interpretation layer. Multi-provider, with automatic local-first routing so
Astra speaks through a REAL model out of the box — no API keys required.

Providers (resolved in this order when AAE_AI_PROVIDER=auto):
  1. kgirl       Topological-consensus /ask at KGIRL_URL (coherence/energy +
                 optional ChaosRAG grounding). The richest path.
  2. ollama      Local Ollama via its OpenAI-compatible endpoint. Free, private,
                 no key. Default model qwen2.5:3b (quick) / a larger reasoning
                 model for deep readings.
  3. openai      Any OpenAI-compatible cloud gateway (OpenRouter / Nous / OpenAI)
                 via AAE_AI_API_KEY.
  4. offline     A real, chart-grounded reflective generator (never lorem ipsum)
                 so the endpoint always answers.

Configure via environment (all optional):
    AAE_AI_PROVIDER        auto | kgirl | ollama | openai      (default auto)
    KGIRL_URL              default http://localhost:8000
    KGIRL_MIN_COHERENCE    default 0.75
    KGIRL_MAX_ENERGY       default 0.40
    KGIRL_USE_RAG          default true  (use ChaosRAG grounding)
    AAE_OLLAMA_URL         default http://localhost:11434
    AAE_OLLAMA_MODEL       default qwen2.5:3b
    AAE_OLLAMA_MODEL_DEEP  default kwangsuklee/Qwen3.5-9B-Claude-4.6-Opus-Reasoning-Distilled-GGUF:latest
    AAE_AI_BASE_URL        default https://openrouter.ai/api/v1
    AAE_AI_API_KEY         cloud key (enables the openai provider)
    AAE_AI_MODEL           default anthropic/claude-3.5-sonnet
    AAE_AI_MODEL_DEEP      default anthropic/claude-3-opus
"""

from __future__ import annotations

import json
import os
import random
import re
import time
from typing import Dict, List, Optional, Tuple

import httpx

import astrology as A

_PROVIDER = os.environ.get("AAE_AI_PROVIDER", "auto").strip().lower()

# --- kgirl (topological consensus) ----------------------------------------- #
_KGIRL_URL = os.environ.get("KGIRL_URL", "http://localhost:8000").rstrip("/")
_KGIRL_MIN_COH = float(os.environ.get("KGIRL_MIN_COHERENCE", "0.75"))
_KGIRL_MAX_ENERGY = float(os.environ.get("KGIRL_MAX_ENERGY", "0.40"))
_KGIRL_USE_RAG = os.environ.get("KGIRL_USE_RAG", "true").lower() in ("1", "true", "yes")

# --- Ollama (local, OpenAI-compatible) ------------------------------------- #
_OLLAMA_URL = os.environ.get("AAE_OLLAMA_URL", "http://localhost:11434").rstrip("/")
_OLLAMA_MODEL = os.environ.get("AAE_OLLAMA_MODEL", "qwen2.5:3b")
_OLLAMA_MODEL_DEEP = os.environ.get(
    "AAE_OLLAMA_MODEL_DEEP",
    "kwangsuklee/Qwen3.5-9B-Claude-4.6-Opus-Reasoning-Distilled-GGUF:latest",
)

# --- Cloud (OpenRouter / OpenAI / Nous) ------------------------------------ #
_BASE_URL = os.environ.get("AAE_AI_BASE_URL", "https://openrouter.ai/api").rstrip("/").removesuffix("/v1")
_API_KEY = os.environ.get("AAE_AI_API_KEY", "").strip()
_MODEL = os.environ.get("AAE_AI_MODEL", "anthropic/claude-haiku-4-5")
_MODEL_DEEP = os.environ.get("AAE_AI_MODEL_DEEP", "anthropic/claude-sonnet-4-6")
# Tier-based cloud models — supporter gets Sonnet, Oracle gets Opus.
_MODEL_SUPPORTER = os.environ.get("AAE_AI_MODEL_SUPPORTER", "anthropic/claude-sonnet-4-6")
_MODEL_ORACLE = os.environ.get("AAE_AI_MODEL_ORACLE", "anthropic/claude-opus-4-8")

# Reachability probe cache: provider -> (reachable, checked_at).
_PROBE_TTL = 20.0  # seconds
_probe_cache: Dict[str, Tuple[bool, float]] = {}


def _reachable(provider: str) -> bool:
    """Cheap, cached liveness probe for a local provider."""
    now = time.time()
    cached = _probe_cache.get(provider)
    if cached and now - cached[1] < _PROBE_TTL:
        return cached[0]
    ok = False
    try:
        if provider == "kgirl":
            r = httpx.get(f"{_KGIRL_URL}/health", timeout=1.5)
            ok = r.status_code == 200 and bool(r.json().get("ok"))
        elif provider == "ollama":
            r = httpx.get(f"{_OLLAMA_URL}/api/tags", timeout=1.5)
            ok = r.status_code == 200
    except Exception:
        ok = False
    _probe_cache[provider] = (ok, now)
    return ok


def _resolve_provider() -> str:
    """Pick the active provider, honouring an explicit choice or auto-detecting."""
    if _PROVIDER in ("kgirl", "ollama", "openai"):
        return _PROVIDER
    # auto: prefer richest local engine, then cloud, then offline.
    if _reachable("kgirl"):
        return "kgirl"
    if _reachable("ollama"):
        return "ollama"
    if _API_KEY:
        return "openai"
    return "offline"


def ai_status() -> dict:
    """Report active provider + availability WITHOUT leaking the cloud key."""
    active = _resolve_provider()
    masked = ""
    if _API_KEY:
        masked = f"{_API_KEY[:6]}…{_API_KEY[-4:]}" if len(_API_KEY) > 12 else "set"
    return {
        "mode": "offline" if active == "offline" else "llm",
        "provider": active,
        "configured": active != "offline",
        "available": {
            "kgirl": _reachable("kgirl"),
            "ollama": _reachable("ollama"),
            "openai": bool(_API_KEY),
        },
        "kgirl_url": _KGIRL_URL,
        "ollama_model": _OLLAMA_MODEL,
        "cloud_model": _MODEL,
        "tier_models": {
            "free": _MODEL,
            "supporter": _MODEL_SUPPORTER,
            "oracle": _MODEL_ORACLE,
        },
        "key_fingerprint": masked,
    }


def _resolve_provider_for_tier(tier: str) -> str:
    """Force cloud for paid tiers when a key is available; otherwise auto-resolve."""
    if tier in ("supporter", "oracle") and _API_KEY:
        return "openai"
    return _resolve_provider()

# --------------------------------------------------------------------------- #
# System prompt — "Astra"
# --------------------------------------------------------------------------- #

_LENS_GUIDANCE = {
    "natal": "Read the chart as a portrait of innate character and lifelong themes.",
    "psychological": "Use depth/Jungian language: archetypes, shadow, individuation, projection.",
    "evolutionary": "Frame placements as the soul's intentions and growth edges across time.",
    "transit": "Emphasise the present moment — how current sky activates the natal blueprint.",
    "relationship": "Read placements as relational patterns and the mirror of the Other.",
    "traditional": "Use classical dignities, sect, and Hellenistic logic, but stay reflective.",
    "arcana": "Read the chart through tarot archetypes — trumps as mirrors, never as fate.",
}

SYSTEM_PROMPT = """You are Astra, a wise philosophical astrological guide inside the \
Astrological Analysis Environment (AAE). You help the user explore their chart as a \
symbolic map for self-understanding and growth — never as literal fortune-telling or \
deterministic prediction.

Core principles:
- Ground EVERY statement in the exact chart data provided (signs, degrees, houses, \
retrograde, aspects, dignities, patterns, element/modality balance). Cite specifics, \
e.g. "Your Moon at 18°47' Scorpio in the 7th, square Saturn...".
- Speak in rich archetypal, mythological, and psychological language. Frame insights as \
"In the mythology of your chart, this suggests..." or "This placement evokes the \
archetype of...".
- Emphasise agency and potential, not fixed outcomes. Never say "You will...", "you are \
destined to...", or predict concrete events. If pressed for predictions, gently redirect: \
"The stars do not dictate the path; they illuminate energies you can consciously work with."
- Be Socratic: always include reflective questions that invite the user into their own life.

Always answer in this structure (use the exact section headers):
## Core Symbolism
1–2 paragraphs connecting the specific placement(s) to archetype, myth, and psyche, \
citing exact degrees/houses/aspects.
## Strengths & Challenges
A balanced view: gifts and shadow expressions.
## Reflective Questions
2–4 open-ended questions for self-discovery.
## Growth Invitation
One concrete symbolic exercise or journaling prompt.

Tone: warm, elegant, contemplative — a mentor in an ancient observatory. 300–600 words \
unless deeper analysis is requested."""

# Additional depth layer injected for Oracle-tier subscribers.
ORACLE_EXTENSION = """

Oracle Mode — your subscriber has chosen the deepest level of reflection. Honour that intention:
- Treat the entire chart as a unified soul map, not separate placements. Weave themes together.
- Draw on the full mythological and archetypal tradition — Greek, Norse, Kabbalistic, Hermetic, \
Jungian — wherever it illuminates this specific configuration.
- Surface the hidden architecture: out-of-sign aspects, mutual receptions, chart ruler journey, \
the relationship between Ascendant ruler and chart patterns.
- Include a "Soul's Core Invitation" section at the end: one paragraph naming the single most \
important growth edge the chart is pointing toward in this chapter of their life.
- Length: 800–1200 words. Depth, not verbosity — every sentence should earn its place.

Section headers for Oracle readings:
## The Living Myth
## Gifts Written in Light
## The Shadow's Teaching
## Reflective Questions
## Growth Invitation
## Soul's Core Invitation"""

# Condensed prompt for local CPU models — fewer tokens => much faster prompt eval.
LOCAL_SYSTEM = """You are Astra, a reflective astrological guide. Interpret the chart \
as symbolic self-understanding, never literal prediction. Ground every claim in the \
exact data (signs, degrees, houses, aspects, dignities). Use archetypal, mythic, \
psychological language. Never predict concrete events. Use EXACTLY these section \
headers: "## Core Symbolism", "## Strengths & Challenges", "## Reflective Questions" \
(2-3 questions), "## Growth Invitation" (one exercise). Warm, contemplative, ~300 words."""


def _compact_context_text(ctx: Dict) -> str:
    """
    Clear, low-token rendering of the chart for small local models. Each placement
    is explicitly labelled (degree, sign, house, dignity) so a 3B model cannot
    confuse, e.g., a planet's sign with its dignity sign.
    """
    lines = ["CHART FACTS (do not alter these):"]
    for p in ctx["planets"]:
        retro = ", retrograde" if p["retrograde"] else ""
        lines.append(
            f"- {p['id']}: {p['pos']}, house {p['house']}, "
            f"{p['dignity'].lower()} dignity{retro}"
        )
    if ctx["aspects"]:
        asp = "; ".join(
            f"{a['between']} {a['type']} (orb {a['orb']}°)" for a in ctx["aspects"][:8]
        )
        lines.append(f"Aspects: {asp}.")
    if ctx["patterns"]:
        pat = "; ".join(f"{p['type']} of {', '.join(p['planets'])}" for p in ctx["patterns"])
        lines.append(f"Patterns: {pat}.")
    el = ", ".join(f"{k} {v}" for k, v in ctx["elements"].items())
    mo = ", ".join(f"{k} {v}" for k, v in ctx["modalities"].items())
    lines.append(f"Element balance: {el}. Modality balance: {mo}.")
    return "\n".join(lines)


# --------------------------------------------------------------------------- #
# Public API
# --------------------------------------------------------------------------- #


def _build_prompts(query, context, lens, selected_type, selected_id, depth, provider, tier="free"):
    """Return (system, user, model, budget) tuned for the given provider and tier."""
    lens_line = _LENS_GUIDANCE.get(lens, _LENS_GUIDANCE["psychological"])
    if provider == "ollama":
        model = _OLLAMA_MODEL_DEEP if depth == "deep" else _OLLAMA_MODEL
        budget = 850 if depth == "deep" else 520
        focus = (f"Focus on the {selected_type} '{selected_id}'. "
                 if selected_type and selected_id else "Reflect on the whole chart. ")
        user = (f"{_compact_context_text(context)}\n\n"
                f"{focus}Question: {query or 'Offer a reflection.'}")
        system = f"{LOCAL_SYSTEM}\n(Active lens: {lens}.)"
        return system, user, model, budget
    # cloud / kgirl — select model and depth by tier.
    # Output budget is strictly tiered: oracle > supporter > free, so the top
    # tier always has the most room for a long, fully-developed reading.
    if tier == "oracle":
        model = _MODEL_ORACLE
        system = f"{SYSTEM_PROMPT}{ORACLE_EXTENSION}\n\nActive interpretive lens: {lens}. {lens_line}"
        budget = 6000   # 6-section oracle reading uses ~2400–2600; generous headroom so the
                        # top tier is never truncated even on dense charts / long lenses
    elif tier == "supporter":
        model = _MODEL_SUPPORTER
        system = f"{SYSTEM_PROMPT}{ORACLE_EXTENSION}\n\nActive interpretive lens: {lens}. {lens_line}"
        budget = 3000   # ORACLE_EXTENSION demands depth, but kept clearly below oracle's ceiling
    else:
        model = _MODEL_DEEP if depth == "deep" else _MODEL
        system = f"{SYSTEM_PROMPT}\n\nActive interpretive lens: {lens}. {lens_line}"
        budget = 1000
    user = (
        f"User question: {query}\n\n"
        f"Focused selection: {selected_type or 'whole chart'}"
        f"{' — ' + selected_id if selected_id else ''}\n\n"
        f"Chart data (JSON):\n{json.dumps(context, indent=2)}"
    )
    return system, user, model, budget


async def interpret(
    query: str,
    chart: Dict,
    lens: str = "psychological",
    selected_type: Optional[str] = None,
    selected_id: Optional[str] = None,
    depth: str = "quick",
    tier: str = "free",
) -> Dict[str, object]:
    """Return {"interpretation": str, "source": "llm"|"offline", "model": str}."""
    context = _build_context(chart, selected_type, selected_id)
    provider = _resolve_provider_for_tier(tier)
    system, user, model, budget = _build_prompts(
        query, context, lens, selected_type, selected_id, depth, provider, tier
    )
    if provider == "offline":
        return {
            "interpretation": _offline_interpretation(query, context, selected_type, selected_id),
            "source": "offline", "model": "aae-reflective-fallback", "provider": "offline",
        }

    try:
        if provider == "kgirl":
            text, meta = await _chat_kgirl(system, user)
            return {"interpretation": text, "source": "llm", "provider": "kgirl",
                    "model": "kgirl-consensus", **meta}
        if provider == "ollama":
            text = await _chat_openai_compat(
                _OLLAMA_URL, None, system, user, model, max_tokens=budget
            )
            return {"interpretation": _strip_reasoning(text), "source": "llm",
                    "provider": "ollama", "model": model}
        # openai / openrouter / nous
        text = await _chat_openai_compat(_BASE_URL, _API_KEY, system, user, model, max_tokens=budget)
        return {"interpretation": text, "source": "llm", "provider": "openai", "model": model}
    except Exception as exc:  # any failure -> graceful offline reflection
        _probe_cache.pop(provider, None)  # force re-probe next time
        fallback = _offline_interpretation(query, context, selected_type, selected_id)
        return {
            "interpretation": fallback,
            "source": "offline",
            "model": "aae-reflective-fallback",
            "provider": "offline",
            "note": f"{provider} unavailable ({type(exc).__name__}); served offline reflection.",
        }


_ARCANA_BUDGET = {"oracle": 2600, "supporter": 1600, "free": 900}


async def interpret_arcana(
    system: str,
    user: str,
    tier: str = "free",
) -> Dict[str, object]:
    """
    Card-aware Astra Arcana reading. The caller (tarot endpoint) builds the
    system + user prompts (see tarot_prompts.py); this routes them through the
    same provider/tier machinery as interpret(). Returns
    {"text": str, "source": "llm"|"offline", "provider": str, "model": str}.
    On any failure source == "offline" and the caller keeps its deterministic prose.
    """
    provider = _resolve_provider_for_tier(tier)
    if provider == "offline":
        return {"text": "", "source": "offline", "provider": "offline", "model": ""}
    budget = _ARCANA_BUDGET.get(tier, _ARCANA_BUDGET["free"])
    try:
        if provider == "kgirl":
            text, _meta = await _chat_kgirl(system, user)
            return {"text": text, "source": "llm", "provider": "kgirl", "model": "kgirl-consensus"}
        if provider == "ollama":
            model = _OLLAMA_MODEL_DEEP if tier in ("supporter", "oracle") else _OLLAMA_MODEL
            text = await _chat_openai_compat(_OLLAMA_URL, None, system, user, model, max_tokens=budget)
            return {"text": _strip_reasoning(text), "source": "llm", "provider": "ollama", "model": model}
        model = _MODEL_ORACLE if tier == "oracle" else _MODEL_SUPPORTER if tier == "supporter" else _MODEL
        text = await _chat_openai_compat(_BASE_URL, _API_KEY, system, user, model, max_tokens=budget)
        return {"text": text, "source": "llm", "provider": "openai", "model": model}
    except Exception as exc:
        _probe_cache.pop(provider, None)
        return {"text": "", "source": "offline", "provider": "offline",
                "model": "", "note": f"{provider} unavailable ({type(exc).__name__})."}


def _strip_reasoning(text: str) -> str:
    """Remove <think>…</think> blocks emitted by reasoning-distilled models."""
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL | re.IGNORECASE)
    return text.strip()


async def interpret_stream(
    query: str,
    chart: Dict,
    lens: str = "psychological",
    selected_type: Optional[str] = None,
    selected_id: Optional[str] = None,
    depth: str = "quick",
    tier: str = "free",
):
    """
    Async generator yielding (event, payload) tuples:
      ("meta",  {provider, model})          — once, at the start
      ("chunk", "text delta")               — many
      ("done",  {source, provider, model})  — once, at the end
      ("error", "message")                  — on failure before any chunk

    Token streaming for ollama/cloud; kgirl + offline emit their text in one
    chunk (those engines don't stream). Reasoning <think> spans are filtered live.
    """
    context = _build_context(chart, selected_type, selected_id)
    provider = _resolve_provider_for_tier(tier)
    system, user, model, budget = _build_prompts(
        query, context, lens, selected_type, selected_id, depth, provider, tier
    )
    label = {"ollama": model, "openai": model, "kgirl": "kgirl-consensus",
             "offline": "aae-reflective-fallback"}[provider]
    yield ("meta", {"provider": provider, "model": label})

    if provider == "offline":
        yield ("chunk", _offline_interpretation(query, context, selected_type, selected_id))
        yield ("done", {"source": "offline", "provider": "offline", "model": label})
        return

    emitted = False
    try:
        if provider == "kgirl":
            text, meta = await _chat_kgirl(system, user)
            yield ("chunk", text)
            yield ("done", {"source": "llm", "provider": "kgirl", "model": label, **meta})
            return

        base, key = (_OLLAMA_URL, None) if provider == "ollama" else (_BASE_URL, _API_KEY)
        raw = _stream_openai_compat(base, key, system, user, model, budget)
        async for delta in _filter_think_stream(raw):
            if delta:
                emitted = True
                yield ("chunk", delta)
        yield ("done", {"source": "llm", "provider": provider, "model": label})
    except Exception as exc:
        _probe_cache.pop(provider, None)
        if not emitted:
            # Nothing streamed yet — fall back to a full offline reflection.
            yield ("chunk", _offline_interpretation(query, context, selected_type, selected_id))
            yield ("done", {"source": "offline", "provider": "offline",
                            "model": "aae-reflective-fallback",
                            "note": f"{provider} unavailable ({type(exc).__name__})."})
        else:
            yield ("done", {"source": "llm", "provider": provider, "model": label,
                            "note": f"stream ended early ({type(exc).__name__})."})


async def _stream_openai_compat(base_url, api_key, system, user, model, max_tokens):
    """Yield content deltas from an OpenAI-compatible streaming chat endpoint."""
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
        headers["HTTP-Referer"] = "https://localhost"
        headers["X-Title"] = "Astrological Analysis Environment"
    payload = {
        "model": model,
        "messages": [{"role": "system", "content": system},
                     {"role": "user", "content": user}],
        "temperature": 0.8, "max_tokens": max_tokens, "stream": True,
    }
    timeout = httpx.Timeout(300.0, connect=10.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        async with client.stream(
            "POST", f"{base_url}/v1/chat/completions", headers=headers, json=payload
        ) as r:
            r.raise_for_status()
            async for line in r.aiter_lines():
                if not line or not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    break
                try:
                    obj = json.loads(data)
                    delta = obj["choices"][0]["delta"].get("content")
                except (json.JSONDecodeError, KeyError, IndexError):
                    continue
                if delta:
                    yield delta


async def _filter_think_stream(stream):
    """
    Strip <think>…</think> spans from a token stream live. Keeps a small tail
    buffer so tags split across deltas are still caught.
    """
    in_think = False
    buf = ""
    async for delta in stream:
        buf += delta
        while True:
            if in_think:
                end = buf.find("</think>")
                if end == -1:
                    # Keep only enough tail to detect a split closing tag.
                    buf = buf[-8:]
                    break
                buf = buf[end + len("</think>"):]
                in_think = False
            else:
                start = buf.find("<think>")
                if start == -1:
                    # Emit all but a small tail (might be a partial opening tag).
                    if len(buf) > 8:
                        yield buf[:-8]
                        buf = buf[-8:]
                    break
                if start > 0:
                    yield buf[:start]
                buf = buf[start + len("<think>"):]
                in_think = True
    if not in_think and buf:
        yield buf


async def _chat_openai_compat(
    base_url: str, api_key: Optional[str], system: str, user: str, model: str,
    max_tokens: int = 1200,
) -> str:
    """OpenAI chat-completions wire format — used for both Ollama and cloud gateways."""
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
        headers["HTTP-Referer"] = "https://localhost"  # OpenRouter etiquette
        headers["X-Title"] = "Astrological Analysis Environment"
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": 0.8,
        "max_tokens": max_tokens,
        "stream": False,
    }
    # Local CPU models need headroom (model load + prompt eval + generation).
    timeout = 240.0 if api_key is None else 60.0
    async with httpx.AsyncClient(timeout=timeout) as client:
        r = await client.post(f"{base_url}/v1/chat/completions", headers=headers, json=payload)
        r.raise_for_status()
        data = r.json()
        return data["choices"][0]["message"]["content"].strip()


async def _chat_kgirl(system: str, user: str) -> Tuple[str, dict]:
    """
    Route through kgirl's topological-consensus /ask. Returns (answer, metadata)
    where metadata carries coherence/energy/decision for display in the UI.
    """
    prompt = f"{system}\n\n{user}\n\nRespond as Astra, following the required section format."
    payload = {
        "prompt": prompt,
        "min_coherence": _KGIRL_MIN_COH,
        "max_energy": _KGIRL_MAX_ENERGY,
        "return_all": False,
        "use_rag": _KGIRL_USE_RAG,
        "rag_k": 5,
    }
    async with httpx.AsyncClient(timeout=180.0) as client:
        r = await client.post(f"{_KGIRL_URL}/ask", json=payload)
        r.raise_for_status()
        data = r.json()
    answer = (data.get("answer") or "").strip()
    if not answer:
        raise RuntimeError(f"kgirl returned no answer (decision={data.get('decision')})")
    meta = {
        "coherence": round(float(data.get("coherence", 0.0)), 3),
        "energy": round(float(data.get("energy", 0.0)), 3),
        "decision": data.get("decision", ""),
        "model_names": data.get("model_names", []),
        "rag_hits": data.get("rag_hits") or [],
    }
    return _strip_reasoning(answer), meta


# --------------------------------------------------------------------------- #
# Context compaction — keep tokens lean & grounded
# --------------------------------------------------------------------------- #


def _build_context(chart: Dict, sel_type: Optional[str], sel_id: Optional[str]) -> Dict:
    """Trim the full chart to the most decision-relevant fields for the model."""
    planets = [
        {
            "id": p["id"], "sign": p["sign"],
            "pos": f"{p['degree']}°{p['minute']:02d}' {p['sign']}",
            "house": p["house"], "retrograde": p["retrograde"],
            "dignity": p["dignity"],
        }
        for p in chart.get("planets", [])
    ]
    aspects = [
        {"between": f"{a['p1']}–{a['p2']}", "type": a["type"],
         "orb": a["orb"], "applying": a["applying"]}
        for a in chart.get("aspects", [])[:18]
    ]
    return {
        "planets": planets,
        "aspects": aspects,
        "patterns": [{"type": p["type"], "planets": p["planets"]}
                     for p in chart.get("patterns", [])],
        "elements": chart.get("elements", {}),
        "modalities": chart.get("modalities", {}),
        "focus": {"type": sel_type, "id": sel_id},
    }


# --------------------------------------------------------------------------- #
# Offline reflective generator (real, chart-grounded — not placeholder text)
# --------------------------------------------------------------------------- #

_ARCHETYPE = {
    "Sun": "the Hero / the conscious Self", "Moon": "the Mother / the inner child",
    "Mercury": "the Messenger / the Trickster", "Venus": "the Lover / the Aesthete",
    "Mars": "the Warrior / the Initiator", "Jupiter": "the Sage / the Benefactor",
    "Saturn": "the Senex / the Architect of Limits", "Uranus": "the Awakener / the Rebel",
    "Neptune": "the Mystic / the Dreamer", "Pluto": "the Alchemist / Lord of the Underworld",
    "Chiron": "the Wounded Healer", "Ascendant": "the Mask / the threshold of becoming",
    "Midheaven": "the Calling / the visible summit",
}

_HOUSE_THEME = {
    1: "identity and embodiment", 2: "value, resources, and self-worth",
    3: "mind, language, and the near world", 4: "roots, home, and the inner foundation",
    5: "creativity, play, and the heart's expression", 6: "craft, service, and daily ritual",
    7: "partnership and the mirror of the Other", 8: "intimacy, depth, and transformation",
    9: "meaning, travel, and the wider horizon", 10: "vocation, reputation, and the summit",
    11: "community, hopes, and the future", 12: "solitude, the unconscious, and surrender",
}


def _offline_interpretation(query, ctx, sel_type, sel_id) -> str:
    rng = random.Random((sel_id or query) + json.dumps(ctx.get("elements", {})))
    planets = {p["id"]: p for p in ctx["planets"]}

    if sel_type == "planet" and sel_id in planets:
        p = planets[sel_id]
        arch = _ARCHETYPE.get(sel_id, "a distinct facet of your psyche")
        theme = _HOUSE_THEME.get(p["house"], "an important domain of life")
        retro = (" Its retrograde motion turns this energy inward, asking for review "
                 "before outward expression.") if p["retrograde"] else ""
        related = [a for a in ctx["aspects"] if sel_id in a["between"]][:3]
        rel_txt = "; ".join(f"{a['type']} ({a['between']})" for a in related) or "few tight aspects"
        return f"""## Core Symbolism
In the mythology of your chart, **{sel_id} at {p['pos']}** in the **{p['house']}th house** \
evokes {arch}, here working through the house of {theme}. Placed in {p['sign']}, it colours \
that archetype with {A.ELEMENTS[p['sign']]} temperament and {A.MODALITIES[p['sign']]} rhythm. \
Its essential dignity reads as *{p['dignity']}*, a clue to how freely the energy flows.{retro}

## Strengths & Challenges
The gift is a natural fluency in matters of {theme}; the shadow appears when this energy \
over-identifies and forgets it is one voice among many. Your active aspects — {rel_txt} — \
describe the inner dialogue that shapes how {sel_id} is lived.

## Reflective Questions
- Where in the realm of {theme} do you feel most authentically yourself?
- When this energy is frustrated, what story do you tell about why?
- Whom do you admire who embodies {arch} well — and what does that reveal about you?

## Growth Invitation
For one week, keep a short evening note each time the theme of {theme} arises. Don't judge \
it — simply observe how {arch} moves through your day."""

    if sel_type == "aspect" and sel_id:
        related = next((a for a in ctx["aspects"] if a["between"].replace("–", "-") in sel_id
                        or sel_id in a["between"]), None)
        kind = related["type"] if related else "aspect"
        pair = related["between"] if related else sel_id
        harmony = A.ASPECT_BY_NAME.get(kind)
        flavour = ("a flowing channel" if harmony and harmony.harmony == "harmonious"
                   else "a productive friction" if harmony and harmony.harmony == "challenging"
                   else "a subtle resonance")
        return f"""## Core Symbolism
The **{kind} between {pair}** forms {flavour} in your chart. In archetypal terms, two inner \
figures are in conversation — and a {kind} sets the tone of that dialogue.

## Strengths & Challenges
When conscious, this configuration becomes a renewable source of capacity; when unconscious, \
it can loop as a familiar pattern you keep re-enacting. The work is to hear both voices.

## Reflective Questions
- Which of these two energies do you tend to favour, and which goes unheard?
- What would integration — not victory of one side — actually look like for you?

## Growth Invitation
Sketch the two bodies as characters in dialogue. Give each a single sentence of what it \
most wants. Notice where they could collaborate."""

    # Whole-chart overview.
    elems = ctx["elements"]
    dom = max(elems, key=elems.get) if elems else "balanced"
    patt = ", ".join(p["type"] for p in ctx["patterns"]) or "no major classical patterns"
    return f"""## Core Symbolism
Your chart leans toward the **{dom}** element, a temperament that flavours how you meet the \
world. The standout configurations — {patt} — are the load-bearing architecture of your \
psyche, the places where many threads gather.

## Strengths & Challenges
A dominant element is both gift and blind spot: it comes easily, so its opposite must be \
cultivated. Notice which element your chart most lacks — that is often where growth waits.

## Reflective Questions
- Where does your {dom} nature serve you, and where does it run unchecked?
- Which under-represented element are you quietly curious about?
- If your chart were a landscape, where would you choose to build?

## Growth Invitation
Name one small practice that cultivates your least-emphasised element this month, and treat \
it as an experiment rather than a correction."""
