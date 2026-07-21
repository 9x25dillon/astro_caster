"""
TTS resilience: ElevenLabs transport blips (observed live 2026-07-20 —
"Server disconnected without sending a response" → 502 on /api/tts/voices)
must degrade gracefully: one retry, then the last-known-good voice list.
Real HTTP errors (bad key) still surface.
"""
import asyncio
import os
import sys

import httpx
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import tts as T  # noqa: E402

_VOICES_JSON = {"voices": [
    {"voice_id": "v1", "name": "Lily", "category": "premade"},
]}


class _FakeResponse:
    def __init__(self, status=200, json_data=None, content=b"mp3"):
        self.status_code = status
        self._json = json_data or {}
        self.content = content
        self.headers = {"request-id": "req-1"}

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError("err", request=None, response=None)

    def json(self):
        return self._json


class _FakeClient:
    """Async client whose first N requests raise a transport error."""

    def __init__(self, fail_first=0, status=200, json_data=None):
        self.fail_remaining = fail_first
        self.status = status
        self.json_data = json_data
        self.calls = 0

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def _request(self):
        self.calls += 1
        if self.fail_remaining > 0:
            self.fail_remaining -= 1
            raise httpx.RemoteProtocolError("Server disconnected")
        return _FakeResponse(self.status, self.json_data)

    async def get(self, *a, **k):
        return await self._request()

    async def post(self, *a, **k):
        return await self._request()


def _use_client(monkeypatch, client):
    monkeypatch.setattr(T, "_API_KEY", "test-key")
    monkeypatch.setattr(T.httpx, "AsyncClient", lambda **k: client)


def test_voices_retries_transient_drop_then_succeeds(monkeypatch):
    client = _FakeClient(fail_first=1, json_data=_VOICES_JSON)
    _use_client(monkeypatch, client)
    monkeypatch.setattr(T, "_voices_cache", [])
    voices = asyncio.run(T.list_voices())
    assert client.calls == 2
    assert voices == [{"voice_id": "v1", "name": "Lily", "category": "premade"}]


def test_voices_serves_last_good_list_when_upstream_stays_down(monkeypatch):
    good = [{"voice_id": "v1", "name": "Lily", "category": "premade"}]
    _use_client(monkeypatch, _FakeClient(fail_first=99))
    monkeypatch.setattr(T, "_voices_cache", list(good))
    assert asyncio.run(T.list_voices()) == good


def test_voices_returns_empty_when_down_and_no_cache(monkeypatch):
    _use_client(monkeypatch, _FakeClient(fail_first=99))
    monkeypatch.setattr(T, "_voices_cache", [])
    assert asyncio.run(T.list_voices()) == []


def test_voices_http_error_still_raises(monkeypatch):
    # A 401 (bad key) is misconfiguration, not weather — must stay loud.
    _use_client(monkeypatch, _FakeClient(status=401))
    monkeypatch.setattr(T, "_voices_cache", [])
    with pytest.raises(httpx.HTTPStatusError):
        asyncio.run(T.list_voices())


def test_synthesize_retries_transient_drop_per_chunk(monkeypatch):
    client = _FakeClient(fail_first=1)
    _use_client(monkeypatch, client)
    audio = asyncio.run(T.synthesize("A short reading."))
    assert audio == b"mp3"
    assert client.calls == 2


def test_synthesize_gives_up_after_one_retry(monkeypatch):
    _use_client(monkeypatch, _FakeClient(fail_first=2))
    with pytest.raises(httpx.RemoteProtocolError):
        asyncio.run(T.synthesize("A short reading."))


def test_voice_id_allowlist():
    # Real ElevenLabs ids pass through untouched.
    assert T._safe_voice_id("pFZP5JQG7iQjIQuC4Bku") == "pFZP5JQG7iQjIQuC4Bku"
    assert T._safe_voice_id(None) == T._VOICE_ID  # default
    assert T._safe_voice_id("") == T._VOICE_ID  # empty → default too
    # Anything that could steer the upstream URL path refuses loudly.
    for evil in ("../history", "x/../../v1/user", "a b", "id?x=1", "id#f",
                 "%2e%2e%2f", "x" * 65):
        with pytest.raises(ValueError):
            T._safe_voice_id(evil)


def test_synthesize_rejects_bad_voice_id_before_any_request(monkeypatch):
    client = _FakeClient()
    _use_client(monkeypatch, client)
    with pytest.raises(ValueError):
        asyncio.run(T.synthesize("A short reading.", voice_id="../evil"))
    assert client.calls == 0
