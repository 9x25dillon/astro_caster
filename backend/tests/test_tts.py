"""
TTS resilience: ElevenLabs transport blips (observed live 2026-07-20 —
"Server disconnected without sending a response" → 502 on /api/tts/voices)
must degrade gracefully: one retry, then the last-known-good voice list.
Real HTTP errors (bad key) still surface.

And TTS delivery: the MP3 is streamed chunk by chunk (observed live
2026-08-26 — /api/tts silent for 113s while chunks were synthesized
sequentially, past Cloudflare's 100s no-byte cap, so the reader paid for
audio and received a 524). The streaming contract: bytes flow after the
FIRST upstream response, errors before the first byte keep their HTTP
status, and a mid-stream failure leaves a playable sentence-aligned prefix
rather than an error the reader can no longer be sent.
"""
import asyncio
import os
import sys

import httpx
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import entitlements as ENT  # noqa: E402
import main  # noqa: E402
import tts as T  # noqa: E402

client_http = TestClient(main.app)

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


def _streaming(r, midfail=False):
    """Give a _FakeResponse the streamed-body face: aiter_bytes yields its
    content once (then optionally dies mid-body, like a dropped connection)."""

    async def aiter_bytes():
        yield r.content
        if midfail:
            raise httpx.RemoteProtocolError("Server disconnected mid-body")

    r.aiter_bytes = aiter_bytes
    return r


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

    def stream(self, method, url, headers=None, json=None):
        # Mimic httpx.AsyncClient.stream: a context manager; transport errors
        # surface on __aenter__, the body arrives via aiter_bytes.
        client = self

        class _CM:
            async def __aenter__(cm):
                return _streaming(await client._request())

            async def __aexit__(cm, *exc):
                return False

        return _CM()


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


# --------------------------------------------------------------------------- #
# Streaming delivery — the 524 fix
# --------------------------------------------------------------------------- #

class _RecordingClient(_FakeClient):
    """Numbered audio per call, and every payload kept for inspection."""

    def __init__(self, **kw):
        super().__init__(**kw)
        self.payloads = []

    def stream(self, method, url, headers=None, json=None):
        client = self

        class _CM:
            async def __aenter__(cm):
                client.payloads.append(json)
                r = await client._request()
                r.content = b"seg%d" % len(client.payloads)
                r.headers = {"request-id": "req-%d" % len(client.payloads)}
                return _streaming(r)

            async def __aexit__(cm, *exc):
                return False

        return _CM()


class _MidBodyFailClient(_FakeClient):
    """Every attempt streams one part, then the connection dies mid-body."""

    def stream(self, method, url, headers=None, json=None):
        client = self

        class _CM:
            async def __aenter__(cm):
                client.calls += 1
                return _streaming(_FakeResponse(), midfail=True)

            async def __aexit__(cm, *exc):
                return False

        return _CM()


_THREE_SENTENCES = "First sentence here. Second sentence here. Third sentence here."


def test_stream_yields_one_part_per_chunk_and_chains_request_ids(monkeypatch):
    client = _RecordingClient()
    _use_client(monkeypatch, client)
    monkeypatch.setattr(T, "_CHUNK_CHARS", 25)  # force one sentence per chunk

    async def collect():
        return [part async for part in T.synthesize_stream(_THREE_SENTENCES)]

    parts = asyncio.run(collect())
    assert parts == [b"seg1", b"seg2", b"seg3"]
    # Prosodic continuity: each request names the previous one, first names none.
    assert "previous_request_id" not in client.payloads[0]
    assert client.payloads[1]["previous_request_id"] == "req-1"
    assert client.payloads[2]["previous_request_id"] == "req-2"


def test_stream_first_bytes_do_not_wait_for_later_chunks(monkeypatch):
    # The property that beats the 524: audio is in flight after ONE upstream
    # call, not after their sum.
    client = _RecordingClient()
    _use_client(monkeypatch, client)
    monkeypatch.setattr(T, "_CHUNK_CHARS", 25)

    async def first_only():
        stream = T.synthesize_stream(_THREE_SENTENCES)
        first = await anext(stream)
        calls_at_first_byte = client.calls
        await stream.aclose()
        return first, calls_at_first_byte

    first, calls_at_first_byte = asyncio.run(first_only())
    assert first == b"seg1"
    assert calls_at_first_byte == 1


def test_synthesize_is_the_streams_concatenation(monkeypatch):
    _use_client(monkeypatch, _RecordingClient())
    monkeypatch.setattr(T, "_CHUNK_CHARS", 25)
    assert asyncio.run(T.synthesize(_THREE_SENTENCES)) == b"seg1seg2seg3"


def test_stream_never_replays_a_chunk_that_already_sounded(monkeypatch):
    # A retry is only safe BEFORE a chunk has produced audio. Once bytes of it
    # are out, replaying the request would speak the same sentences twice —
    # the stream must stop (the consumer keeps the prefix) rather than retry.
    client = _MidBodyFailClient()
    _use_client(monkeypatch, client)

    async def collect():
        parts = []
        with pytest.raises(httpx.RemoteProtocolError):
            async for part in T.synthesize_stream("A short reading."):
                parts.append(part)
        return parts

    parts = asyncio.run(collect())
    assert parts == [b"mp3"]   # the prefix reached the consumer
    assert client.calls == 1   # and the chunk was NOT replayed


# --------------------------------------------------------------------------- #
# /api/tts endpoint semantics under streaming
# --------------------------------------------------------------------------- #

def _supporter_token():
    return ENT.mint_entitlement("supporter", ref="test", verified=True)["token"]


def _count_metered(monkeypatch):
    metered = []
    monkeypatch.setattr(main.MET, "observe_ai_call", lambda *a, **k: metered.append(a))
    return metered


def test_endpoint_streams_full_audio_and_meters_on_clean_finish(monkeypatch):
    monkeypatch.setattr(T, "_API_KEY", "test-key")

    async def fake_stream(text, voice_id=None):
        yield b"seg1"
        yield b"seg2"

    monkeypatch.setattr(T, "synthesize_stream", fake_stream)
    metered = _count_metered(monkeypatch)
    r = client_http.post("/api/tts", json={"text": "A reading.",
                                           "entitlement": _supporter_token()})
    assert r.status_code == 200
    assert r.content == b"seg1seg2"
    assert r.headers["content-type"].startswith("audio/mpeg")
    assert r.headers["x-accel-buffering"] == "no"
    assert len(metered) == 1


def test_endpoint_failure_before_first_byte_is_still_a_502(monkeypatch):
    monkeypatch.setattr(T, "_API_KEY", "test-key")

    async def fake_stream(text, voice_id=None):
        raise httpx.RemoteProtocolError("Server disconnected")
        yield  # pragma: no cover — makes this an async generator

    monkeypatch.setattr(T, "synthesize_stream", fake_stream)
    r = client_http.post("/api/tts", json={"text": "A reading.",
                                           "entitlement": _supporter_token()})
    assert r.status_code == 502


def test_endpoint_bad_voice_id_is_still_a_400(monkeypatch):
    # The real generator raises ValueError at first anext(), before any
    # network client exists — the handler must map it to a 400.
    monkeypatch.setattr(T, "_API_KEY", "test-key")
    r = client_http.post("/api/tts", json={"text": "A reading.",
                                           "voice_id": "../evil",
                                           "entitlement": _supporter_token()})
    assert r.status_code == 400


def test_endpoint_midstream_failure_keeps_the_prefix_and_is_not_metered(monkeypatch):
    monkeypatch.setattr(T, "_API_KEY", "test-key")

    async def fake_stream(text, voice_id=None):
        yield b"seg1"
        raise httpx.RemoteProtocolError("Server disconnected")

    monkeypatch.setattr(T, "synthesize_stream", fake_stream)
    metered = _count_metered(monkeypatch)
    r = client_http.post("/api/tts", json={"text": "A reading.",
                                           "entitlement": _supporter_token()})
    # Status went out with the first byte; the reader keeps a playable,
    # sentence-aligned prefix instead of losing everything to an error.
    assert r.status_code == 200
    assert r.content == b"seg1"
    assert metered == []
