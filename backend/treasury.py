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


def _s(env: str, default: str) -> str:
    """Read a string env var, tolerating SET-BUT-EMPTY.

    os.environ.get(k, default) falls back only when the key is ABSENT. Compose
    passes optional vars as `${VAR:-}`, which SETS them to empty — so once
    these were added to docker-compose.yml on 2026-08-15, `_TREASURY_ETH`
    became "" rather than the placeholder, and `configured` (which asks only
    "is this different from the burn address?") flipped to TRUE for an EMPTY
    address. /api/pricing would then advertise the crypto rail while
    verify_eth_payment_details answered "no EVM treasury configured" — the
    take-money-give-nothing shape this module is supposed to prevent.
    """
    return (os.environ.get(env) or default).strip()


_TREASURY_ETH = _s("AAE_TREASURY_ETH", _PLACEHOLDER_ETH)
_TREASURY_SOL = _s("AAE_TREASURY_SOL", "")
_TREASURY_BTC = _s("AAE_TREASURY_BTC", "")
_LABEL = _s("AAE_TREASURY_LABEL", "K1ll · Observatory Treasury")

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
    split = _parse_split(_s("AAE_FUNDING_SPLIT", _DEFAULT_SPLIT))
    for p in split:
        p["note"] = _PILLAR_NOTES.get(str(p["name"]), "")
    return split


def treasury_info() -> Dict[str, object]:
    chains: List[Dict[str, str]] = []
    if _TREASURY_ETH:
        chains.append({
            "id": "evm", "label": "EVM (ETH · Base · Polygon · Arbitrum)",
            # NOT "ETH or USDC", which is what this said until 2026-08-15.
            # verify_eth_payment_details reads tx.to and tx.value from
            # eth_getTransactionByHash — the fields of a NATIVE transfer. In an
            # ERC-20 transfer tx.to is the token contract and tx.value is 0, so
            # a USDC payment is rejected as "recipient is not the treasury"
            # AFTER the customer has irreversibly sent it. Advertising an asset
            # the verifier cannot accept is a way to take money and give nothing
            # back, so the copy now matches the check. Supporting USDC means
            # parsing Transfer logs from the receipt, not editing this string.
            "address": _TREASURY_ETH, "asset": "ETH (native transfer only)",
            "unlocks": True,
        })
    # SOL and BTC have no verifier at all: donate_verify routes non-EVM chains to
    # accept_offchain_payment, which grants only under trust mode and therefore
    # always fails closed in production. They are donation addresses, and saying
    # so here is what stops the UI implying they buy an unlock.
    if _TREASURY_SOL:
        chains.append({"id": "sol", "label": "Solana", "address": _TREASURY_SOL,
                       "asset": "SOL", "unlocks": False,
                       "note": "Donation only — cannot be verified, does not unlock."})
    if _TREASURY_BTC:
        chains.append({"id": "btc", "label": "Bitcoin", "address": _TREASURY_BTC,
                       "asset": "BTC", "unlocks": False,
                       "note": "Donation only — cannot be verified, does not unlock."})
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
