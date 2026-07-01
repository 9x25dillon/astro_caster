"""
Phase 4 — Deck-Art Prompt Studio.

The contract under test: a prompt is a PURE function of (chart, card, source
system) — stable across calls, offline, no AI — composed from the engine's own
symbolic substrate (card correspondences, natal signature, HOUSE_THEMES), with
the source system visibly shaping the imagery. Prompt generation only: the
module must never call out for image generation.
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import deck_art as DA  # noqa: E402
import ephemeris as E  # noqa: E402
from models import ChartRequest  # noqa: E402
import tarot as TAROT  # noqa: E402
from tarot_data import HOUSE_THEMES, MAJOR_BY_ID  # noqa: E402
from tarot_models import DISCLAIMER, DeckArtRequest  # noqa: E402

_EINSTEIN = dict(year=1879, month=3, day=14, hour=11, minute=30, second=0,
                 lat=48.4011, lng=9.9876, tz_offset=0.67)
_CHART = E.calculate_chart(ChartRequest(**_EINSTEIN))
_SIG = TAROT.build_natal_arcana_signature(_CHART)


def _deck_art(**kw):
    return DA.build_deck_art(DeckArtRequest(chart=_CHART, **kw))


def test_prompt_is_deterministic_per_chart_card_source():
    a = _deck_art(card_id="magician", source="thoth").prompts[0]
    b = _deck_art(card_id="magician", source="thoth").prompts[0]
    assert a.prompt == b.prompt
    assert a.negative_prompt == b.negative_prompt
    assert a.motifs == b.motifs and a.palette == b.palette


def test_source_system_shapes_the_imagery():
    prompts = {
        src: _deck_art(card_id="magician", source=src).prompts[0].prompt
        for src in ("golden_dawn", "rws", "thoth", "jungian")
    }
    # All four lineages must yield distinct prompts for the same chart + card.
    assert len(set(prompts.values())) == 4
    # And each carries its own style vocabulary, not a shared template accident.
    assert "Golden Dawn" in prompts["golden_dawn"]
    assert "Waite-Smith" in prompts["rws"]
    assert "Thoth" in prompts["thoth"]
    assert "depth-psychological" in prompts["jungian"]


def test_prompt_composed_from_card_substrate():
    p = _deck_art(card_id="magician").prompts[0]
    assert "The Magician" in p.prompt
    # Motifs come from the card's actual keywords + astrology, not invention.
    assert "will" in p.motifs and "Mercury" in p.motifs
    assert all(m in p.prompt for m in p.motifs)
    # Element-derived palette threads into the prompt text.
    assert p.palette in p.prompt


def test_natal_context_present_for_signature_trump():
    link = _SIG.links[0]  # canonical order: Sun-first
    p = _deck_art(card_id=link.card.id).prompts[0]
    assert p.natal_context is not None
    assert link.body in p.natal_context
    if link.house in HOUSE_THEMES:
        assert HOUSE_THEMES[link.house] in p.natal_context
    assert p.natal_context in p.prompt


def test_non_signature_card_has_no_natal_context():
    sig_ids = {l.card.id for l in _SIG.links}
    outsiders = [cid for cid in MAJOR_BY_ID if cid not in sig_ids]
    # A chart links at most 13 bodies, so trumps always remain outside it.
    assert outsiders, "signature unexpectedly covers all 22 trumps"
    p = _deck_art(card_id=outsiders[0]).prompts[0]
    assert p.natal_context is None


def test_soul_deck_covers_signature_trumps_exactly_once():
    r = _deck_art()
    ids = [p.card.id for p in r.prompts]
    assert len(ids) == len(set(ids))                       # no duplicates
    assert set(ids) == {l.card.id for l in _SIG.links}     # exactly the soul deck
    assert ids[0] == _SIG.links[0].card.id                 # canonical Sun-first order


def test_minor_card_prompts_work():
    p = _deck_art(card_id="ace_of_wands", source="rws").prompts[0]
    assert "Ace of Wands" in p.prompt
    assert p.palette  # suit element resolves a palette
    b = _deck_art(card_id="ace_of_wands", source="rws").prompts[0]
    assert p.prompt == b.prompt


def test_unknown_card_id_rejected():
    with pytest.raises(ValueError):
        _deck_art(card_id="not_a_card")


def test_disclaimer_travels_with_the_data():
    assert _deck_art(card_id="magician").disclaimer == DISCLAIMER
    assert _deck_art().disclaimer == DISCLAIMER


# ── Endpoint behavior (TestClient) ─────────────────────────────────────────────

from fastapi.testclient import TestClient  # noqa: E402
import main  # noqa: E402

_client = TestClient(main.app)


def _post(payload):
    return _client.post("/api/deck-art", json=payload)


def test_endpoint_deterministic_and_disclaimed():
    payload = {"chart": _CHART.model_dump(), "card_id": "high_priestess",
               "source": "jungian"}
    a, b = _post(payload), _post(payload)
    assert a.status_code == 200 and b.status_code == 200
    assert a.json()["prompts"][0]["prompt"] == b.json()["prompts"][0]["prompt"]
    assert a.json()["disclaimer"] == DISCLAIMER
    assert a.json()["lineage"] == "Psychological / Jungian"


def test_endpoint_rejects_unknown_card_with_400():
    r = _post({"chart": _CHART.model_dump(), "card_id": "not_a_card"})
    assert r.status_code == 400
    assert "unknown card id" in r.json()["detail"]


def test_endpoint_rejects_unknown_source_with_422():
    # SourceSystem is a closed Literal — validation, not silent fallback.
    r = _post({"chart": _CHART.model_dump(), "card_id": "magician",
               "source": "marseille"})
    assert r.status_code == 422
