"""
treasury.py
===========
The funding layer. Defines where premium support flows and how it is split across
the creator's other projects — surfaced to the UI as a transparent "funding
dashboard". This is deliberately read-only/config-driven: the app never custodies
funds, it only displays a treasury address users can support directly on-chain.

Configure via environment (all optional; sensible defaults below):
    AAE_TREASURY_ETH     EVM address (ETH / Base / Polygon / Arbitrum)
    AAE_TREASURY_SOL     Solana address (optional)
    AAE_TREASURY_BTC     Bitcoin address (optional)
    AAE_TREASURY_LABEL   display name for the treasury
    AAE_FUNDING_SPLIT    "Music:40,Research:30,Agents:30" (must sum ~100)
"""

from __future__ import annotations

import os
from typing import Dict, List

# A clearly-placeholder burn address so nothing is accidentally mis-sent before
# the real treasury is configured. Replace via AAE_TREASURY_ETH.
_PLACEHOLDER_ETH = "0x000000000000000000000000000000000000dEaD"

_TREASURY_ETH = os.environ.get("AAE_TREASURY_ETH", _PLACEHOLDER_ETH).strip()
_TREASURY_SOL = os.environ.get("AAE_TREASURY_SOL", "").strip()
_TREASURY_BTC = os.environ.get("AAE_TREASURY_BTC", "").strip()
_LABEL = os.environ.get("AAE_TREASURY_LABEL", "K1ll · Observatory Treasury").strip()

# Default allocation across the creator's real project pillars.
_DEFAULT_SPLIT = "Music:40,Research:30,Agents:30"


def _parse_split(raw: str) -> List[Dict[str, object]]:
    out: List[Dict[str, object]] = []
    for part in raw.split(","):
        if ":" not in part:
            continue
        name, pct = part.split(":", 1)
        try:
            out.append({"name": name.strip(), "pct": float(pct)})
        except ValueError:
            continue
    return out


# Human-readable purpose for each pillar (shown in the funding dashboard).
_PILLAR_NOTES = {
    "Music": "K1ll releases — distribution, mastering, and production tooling.",
    "Research": "Open research: The Geometry of Observation and related work.",
    "Agents": "AI/agent infrastructure — hermes-agent, kgirl, and friends.",
}


def funding_allocation() -> List[Dict[str, object]]:
    split = _parse_split(os.environ.get("AAE_FUNDING_SPLIT", _DEFAULT_SPLIT))
    for p in split:
        p["note"] = _PILLAR_NOTES.get(str(p["name"]), "")
    return split


def treasury_info() -> Dict[str, object]:
    chains: List[Dict[str, str]] = []
    if _TREASURY_ETH:
        chains.append({
            "id": "evm", "label": "EVM (ETH · Base · Polygon · Arbitrum)",
            "address": _TREASURY_ETH, "asset": "ETH or USDC",
        })
    if _TREASURY_SOL:
        chains.append({"id": "sol", "label": "Solana", "address": _TREASURY_SOL, "asset": "SOL or USDC"})
    if _TREASURY_BTC:
        chains.append({"id": "btc", "label": "Bitcoin", "address": _TREASURY_BTC, "asset": "BTC"})
    return {
        "label": _LABEL,
        "configured": _TREASURY_ETH != _PLACEHOLDER_ETH,
        "chains": chains,
        "allocation": funding_allocation(),
        # Pay-what-you-want: suggested tiers, but any amount unlocks.
        "suggested_usd": [3, 7, 21],
        "philosophy": (
            "Open paywall — the observatory is free to explore. Supporting it unlocks "
            "the deep features and funds independent music, research, and AI work."
        ),
    }
