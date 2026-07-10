"""
Deck-art plates (NEXT_ARC P3): the OpenAI paint layer over the Studio's
deterministic prompts. Tests pin the gates (tier, unconfigured layer, bad
card) and the success shape with the network mocked — a real render is money.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient  # noqa: E402

import entitlements as ENT  # noqa: E402
import ephemeris as E  # noqa: E402
import plate_art as PLATE  # noqa: E402
from main import app  # noqa: E402
from models import ChartRequest  # noqa: E402

client = TestClient(app)

_EINSTEIN = dict(year=1879, month=3, day=14, hour=11, minute=30, second=0,
                 lat=48.4011, lng=9.9876, tz_offset=0.67)
_CHART = E.calculate_chart(ChartRequest(**_EINSTEIN))


def _oracle_token():
    return ENT.mint_entitlement("oracle", ref="test", verified=True)["token"]


def _post(card_id="death", token=None):
    return client.post("/api/deck-art-image", json={
        "chart": _CHART.model_dump(),
        "card_id": card_id,
        "entitlement": token,
    })


def test_free_tier_gets_402_before_any_work(monkeypatch):
    async def boom(req):  # the paint layer must never be reached
        raise AssertionError("render_plate called below oracle tier")
    monkeypatch.setattr(PLATE, "render_plate", boom)
    r = _post()
    assert r.status_code == 402
    assert "oracle" in r.json()["detail"]


def test_unconfigured_layer_is_an_honest_503(monkeypatch):
    monkeypatch.setattr(PLATE, "_OPENAI_KEY", "")
    r = _post(token=_oracle_token())
    assert r.status_code == 503
    assert "AAE_OPENAI_API_KEY" in r.json()["detail"]


def test_unknown_card_is_a_clean_400(monkeypatch):
    monkeypatch.setattr(PLATE, "_OPENAI_KEY", "sk-test")
    r = _post(card_id="not_a_card", token=_oracle_token())
    assert r.status_code == 400
    assert "unknown card id" in r.json()["detail"]


def test_render_success_shape(monkeypatch):
    monkeypatch.setattr(PLATE, "_OPENAI_KEY", "sk-test")

    class FakeResponse:
        status_code = 200
        text = ""
        def json(self):
            return {"model": "gpt-image-1", "data": [{"b64_json": "aGVsbG8="}]}

    class FakeClient:
        def __init__(self, **kw): ...
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def post(self, url, **kw):
            # The painted prompt is the deterministic brief + its negatives.
            assert "Tarot card illustration" in kw["json"]["prompt"]
            assert "Avoid:" in kw["json"]["prompt"]
            return FakeResponse()

    monkeypatch.setattr(PLATE.httpx, "AsyncClient", FakeClient)
    r = _post(card_id="death", token=_oracle_token())
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["image_b64"] == "aGVsbG8="
    assert body["card_id"] == "death"
    assert body["ai_source"] == "openai"
    assert body["prompt"]  # the brief travels with the plate


def test_api_error_is_generic_to_the_client(monkeypatch):
    monkeypatch.setattr(PLATE, "_OPENAI_KEY", "sk-test")

    class FakeResponse:
        status_code = 429
        text = "quota"
        def json(self): return {}

    class FakeClient:
        def __init__(self, **kw): ...
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def post(self, url, **kw): return FakeResponse()

    monkeypatch.setattr(PLATE.httpx, "AsyncClient", FakeClient)
    r = _post(token=_oracle_token())
    assert r.status_code == 400
    assert r.json()["detail"] == "plate render failed"   # no upstream leak
