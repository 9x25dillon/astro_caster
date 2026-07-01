"""
Phase 1.3 — arcana-lens contract.

/api/ai-ask exposes exactly the lenses in AIRequest.lens, and ai._LENS_GUIDANCE
must offer guidance for exactly those lenses — no more, no less. Astra Arcana is
a SEPARATE interpretation path (interpret_arcana via /api/tarot-reading), not a
selectable lens. This test fails if the two drift (e.g. a phantom "arcana" key is
re-added to _LENS_GUIDANCE without being a real request lens).
"""
import os
import sys
import typing

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ai import _LENS_GUIDANCE  # noqa: E402
from models import AIRequest  # noqa: E402


def test_lens_guidance_matches_request_union_exactly():
    allowed = set(typing.get_args(AIRequest.model_fields["lens"].annotation))
    assert allowed == set(_LENS_GUIDANCE), (allowed, set(_LENS_GUIDANCE))


def test_arcana_is_not_a_selectable_lens():
    allowed = set(typing.get_args(AIRequest.model_fields["lens"].annotation))
    assert "arcana" not in allowed
    assert "arcana" not in _LENS_GUIDANCE
    assert len(allowed) == 6
