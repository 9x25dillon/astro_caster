"""
natal_seed.py — Deterministic natal-geometry seed derivation and shared
Biosentinel math for the Resonarium <-> Biosentinel integration.

The browser counterpart is ``natal_seed.js``. The two implementations MUST
stay byte-for-byte compatible in their canonical serialization, hashing,
PRNG, and modulation math. Any change here requires the same change there,
plus an update to the shared test vectors in ``tests/test_biosentinel.py``.

Hash strategy (single strategy across both environments):
    SHA-256 over the UTF-8 canonical string, truncated to the first
    8 bytes, interpreted big-endian as an unsigned 64-bit integer.

Privacy: the seed is a one-way digest — natal data cannot be reconstructed
from it. Raw chart data and raw intention text are never logged or stored
by anything in this module.
"""
from __future__ import annotations

import hashlib
import math
import re
from datetime import datetime, timezone
from typing import Callable, Optional

SCHEMA_VERSION = "1.0.0"

# Canonical field order for deterministic serialization. Extra keys are
# appended in sorted order so newer charts stay deterministic.
CANONICAL_CHART_KEYS = [
    "sun", "moon", "mercury", "venus", "mars",
    "jupiter", "saturn", "uranus", "neptune", "pluto",
    "asc", "mc", "true_node", "chiron",
    "aspects_sum", "house_cusps_hash",
]

# Longitude-bearing keys used for chart completeness validation and
# bedrock frequency derivation.
LONGITUDE_KEYS = [
    "sun", "moon", "mercury", "venus", "mars",
    "jupiter", "saturn", "uranus", "neptune", "pluto",
    "asc", "mc", "true_node", "chiron",
]

MAX_INTENTION_LENGTH = 256
MIN_LONGITUDE_FIELDS = 3

# --- Safety limits (mirrored in natal_seed.js) ---
FREQ_MIN_HZ = 20.0
FREQ_MAX_HZ = 18000.0
VISUAL_MODULATION_MAX_HZ = 2.5  # below the 3-30 Hz photosensitive risk zone

SENTINEL_LIMITS = {
    "n": (0, 64),
    "k": (0.0, 1.0),
    "perturb": (0.0, 100.0),
    "spread": (0.0, 10.0),
}

SENTINEL_DEFAULTS = {
    "active": False,
    "n": 8,
    "k": 0.7,
    "perturb": 5.0,
    "spread": 1.0,
}


class ChartValidationError(ValueError):
    """Raised when a chart is empty, incomplete, or malformed.

    Messages are intentionally generic: they never echo chart values back.
    """


def sanitize_intention(intention: Optional[str]) -> str:
    """Strip control characters, collapse spaces, enforce length limit.

    Mirrors sanitizeIntention() in natal_seed.js exactly:
    - remove code points < 32 and 127 (all C0 controls incl. tab/newline)
    - collapse runs of U+0020 spaces, trim leading/trailing spaces
    - truncate to MAX_INTENTION_LENGTH code points
    """
    if not intention:
        return ""
    cleaned = "".join(c for c in intention if ord(c) >= 32 and ord(c) != 127)
    cleaned = re.sub(r" +", " ", cleaned).strip(" ")
    return cleaned[:MAX_INTENTION_LENGTH]


def validate_chart(chart: dict) -> None:
    """Reject empty, incomplete, or malformed charts safely.

    Raises ChartValidationError with a generic message (never echoes
    chart contents).
    """
    if not isinstance(chart, dict) or not chart:
        raise ChartValidationError("chart is empty or not an object")
    longitude_count = 0
    for key, value in chart.items():
        if isinstance(value, bool) or value is None or isinstance(value, (list, dict)):
            raise ChartValidationError(
                f"chart field '{key}' must be a finite number or string"
            )
        if isinstance(value, (int, float)):
            if not math.isfinite(value):
                raise ChartValidationError(
                    f"chart field '{key}' must be a finite number"
                )
            if key in LONGITUDE_KEYS:
                longitude_count += 1
    if longitude_count < MIN_LONGITUDE_FIELDS:
        raise ChartValidationError(
            f"chart needs at least {MIN_LONGITUDE_FIELDS} planetary/angle "
            "longitude fields"
        )


def _format_value(value) -> str:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        # +0.0 normalizes -0.0; fixed 6 decimals matches JS toFixed(6)
        return f"{float(value) + 0.0:.6f}"
    return str(value)


def canonicalize_chart(chart: dict) -> str:
    """Deterministic ordered serialization; mirrors canonicalizeChart() in JS."""
    parts = []
    seen = set()
    for key in CANONICAL_CHART_KEYS:
        if key in chart:
            parts.append(f"{key}:{_format_value(chart[key])}")
            seen.add(key)
    for key in sorted(k for k in chart.keys() if k not in seen):
        parts.append(f"{key}:{_format_value(chart[key])}")
    return "|".join(parts)


def derive_natal_seed(chart: dict, intention: str = "") -> int:
    """Derive the deterministic unsigned 64-bit seed.

    Same chart + same intention => same seed, in Python and in the browser.
    """
    validate_chart(chart)
    raw = canonicalize_chart(chart)
    cleaned = sanitize_intention(intention)
    if cleaned:
        raw += f"|intention:{cleaned}"
    digest = hashlib.sha256(raw.encode("utf-8")).digest()
    return int.from_bytes(digest[:8], "big")


def seed_to_hex(seed: int) -> str:
    return f"{seed:016x}"


def seed_lower32(seed: int) -> int:
    """The 32-bit PRNG seed: lower 32 bits of the 64-bit seed."""
    return seed & 0xFFFFFFFF


def mulberry32(seed32: int) -> Callable[[], float]:
    """Deterministic PRNG; bit-exact port of mulberry32 from natal_seed.js.

    Returns a function producing floats in [0, 1).
    """
    state = seed32 & 0xFFFFFFFF

    def rand() -> float:
        nonlocal state
        state = (state + 0x6D2B79F5) & 0xFFFFFFFF
        t = state
        t = ((t ^ (t >> 15)) * (t | 1)) & 0xFFFFFFFF
        t = (((t + (((t ^ (t >> 7)) * (t | 61)) & 0xFFFFFFFF)) & 0xFFFFFFFF) ^ t) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296

    return rand


def clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def clamp_frequency(hz: float) -> float:
    """Hard audio-safety clamp; mirrors clampFrequency() in JS."""
    return clamp(hz, FREQ_MIN_HZ, FREQ_MAX_HZ)


def clamp_sentinel_params(params: dict) -> dict:
    """Return a fully-populated, clamped sentinel parameter dict.

    Unknown keys are dropped; missing keys fall back to safe defaults.
    """
    out = dict(SENTINEL_DEFAULTS)
    if not isinstance(params, dict):
        return out
    if "active" in params:
        out["active"] = bool(params["active"])
    for key in ("n", "k", "perturb", "spread"):
        if key in params:
            try:
                value = float(params[key])
            except (TypeError, ValueError):
                continue
            if not math.isfinite(value):
                continue
            lo, hi = SENTINEL_LIMITS[key]
            value = clamp(value, lo, hi)
            out[key] = int(round(value)) if key == "n" else value
    return out


def bedrock_frequencies(chart: dict) -> list[float]:
    """Immutable natal bedrock frequencies from chart longitudes.

    Maps each present longitude (deg) into 110–440 Hz. Mirrors
    bedrockFrequencies() in JS. The returned list is the baseline the
    sentinel overlay modulates *around* — callers must never mutate the
    oscillators built from it.
    """
    validate_chart(chart)
    freqs = []
    for key in LONGITUDE_KEYS:
        if key in chart and isinstance(chart[key], (int, float)):
            lon = float(chart[key]) % 360.0
            freqs.append(clamp_frequency(110.0 * 2.0 ** (lon / 180.0)))
    return freqs


def binaural_config(chart: dict) -> dict:
    """Deterministic binaural carrier/beat from chart; mirrors JS."""
    validate_chart(chart)
    asc = float(chart.get("asc", chart.get("sun", 0.0))) % 360.0
    aspects = float(chart.get("aspects_sum", 0.0))
    carrier = 180.0 + (asc / 360.0) * 120.0          # 180–300 Hz
    beat = 4.0 + (abs(aspects) % 8.0)                 # 4–12 Hz
    return {"carrier_hz": clamp_frequency(carrier), "beat_hz": beat}


def modulate_frequency(base_hz: float, voice_index: int,
                       sentinel: dict, rand: Callable[[], float]) -> float:
    """Sentinel overlay modulation; mirrors modulateFrequency() in JS.

    Never mutates base_hz — returns a new overlay frequency. Consumes
    exactly one PRNG value per call (parity-critical).
    """
    if not sentinel.get("active"):
        return clamp_frequency(base_hz)
    raw_offset = (rand() - 0.5) * 2.0 * float(sentinel["perturb"])
    n = max(int(sentinel["n"]), 1)
    spread_factor = 1.0 + (voice_index / n) * float(sentinel["spread"])
    damped = raw_offset * spread_factor * (1.0 - float(sentinel["k"]))
    return clamp_frequency(float(base_hz) + damped)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


# Keys that must never appear inside temporal-trace params (privacy guard).
_TRACE_FORBIDDEN_KEYS = set(CANONICAL_CHART_KEYS) | {
    "chart", "natal_chart", "natal_bedrock", "intention", "intention_text",
    "birth_time", "birth_date", "birth_location", "lat", "lon", "latitude",
    "longitude",
}


def make_trace_entry(event: str, params: Optional[dict] = None) -> dict:
    """Build a temporal-trace entry with the privacy guard applied.

    Raises ValueError if params contain natal-chart or raw-intention keys.
    """
    params = dict(params or {})
    leaked = _TRACE_FORBIDDEN_KEYS.intersection(params.keys())
    if leaked:
        raise ValueError(
            "temporal trace privacy guard: refused to log natal/intention "
            f"fields: {sorted(leaked)}"
        )
    return {
        "event": str(event),
        "timestamp_utc": utc_now_iso(),
        "params": params,
    }


def redact_state(state: dict) -> dict:
    """Return a copy of a state dict with natal chart data removed.

    Applied by default on every export/import path.
    """
    out = {k: v for k, v in state.items()
           if k not in ("natal_chart", "chart", "natal_bedrock")}
    return out


# --- Shared cross-platform test vector ---
TEST_CHART = {
    "sun": 142.73, "moon": 78.41, "asc": 215.92, "mc": 312.44,
    "aspects_sum": 1247.8,
}
TEST_INTENTION = "clarity"
