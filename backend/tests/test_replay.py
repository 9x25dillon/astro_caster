"""
The opt-in half of the replay guardrail.

Default replay is client-side and nothing leaves the device. This surface exists
only for readers who want their readings to follow them to a second device, and
it is opt-in because storing a reading server-side stores the question inside
it — there is no arrangement where the text lives on the server and the question
does not.

What these tests pin is that the consent is real rather than implied:

  - `consent: true` is required by the schema, so a client that omits it gets a
    422 rather than a silent store;
  - rows are owned, and reads are scoped to the owner, so holding a key is not
    holding the reading;
  - anonymous callers cannot use the surface at all;
  - stored readings expire, and a reader can delete theirs outright.

The key itself is opaque here — the server never derives it, never sees the
question that produced it, and never sees birth data. The token travels in
X-AAE-Token rather than a query string: issue #54 §3.4 established that a
?token= lands in access logs, and these endpoints guard stored questions.
"""
import os
import sys
import time

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import entitlements as ENT  # noqa: E402
import main as M  # noqa: E402
import replay as R  # noqa: E402

client = TestClient(M.app)

KEY = "a" * 64
OTHER_KEY = "b" * 64


@pytest.fixture(autouse=True)
def _tmp_db(tmp_path, monkeypatch):
    monkeypatch.setattr(R, "_DB_PATH", tmp_path / "replay.db")
    yield


@pytest.fixture()
def token():
    return ENT.mint_entitlement("oracle", "0xREF", verified=True)["token"]


@pytest.fixture()
def other_token():
    return ENT.mint_entitlement("oracle", "0xOTHER", verified=True)["token"]


def _store(tok, key=KEY, text="A remembered reading.", consent=True, model="m"):
    body = {"key": key, "text": text, "model": model}
    if consent is not None:
        body["consent"] = consent
    return client.post("/api/replay", json=body, headers={"X-AAE-Token": tok})


def _fetch(tok, key=KEY):
    return client.get(f"/api/replay/{key}", headers={"X-AAE-Token": tok})


# --------------------------------------------------------------------------- #
# Consent is in the wire contract
# --------------------------------------------------------------------------- #
def test_a_write_without_consent_is_refused(token):
    assert _store(token, consent=None).status_code == 422


def test_consent_false_is_refused(token):
    """Literal[True] — not "a boolean", specifically true."""
    assert _store(token, consent=False).status_code == 422


def test_consented_write_is_stored_and_readable(token):
    assert _store(token).status_code == 204
    r = _fetch(token)
    assert r.status_code == 200
    assert r.json()["text"] == "A remembered reading."


# --------------------------------------------------------------------------- #
# Rows are owned
# --------------------------------------------------------------------------- #
def test_a_key_alone_does_not_grant_the_reading(token, other_token):
    """
    Two readers asking the same question of the same chart at the same tier
    derive the SAME key — that is what the hash is for. They must still not see
    each other's readings.
    """
    assert _store(token).status_code == 204
    assert _fetch(other_token).status_code == 404


def test_each_owner_keeps_their_own_reading_at_one_key(token, other_token):
    _store(token, text="mine")
    _store(other_token, text="theirs")
    assert _fetch(token).json()["text"] == "mine"
    assert _fetch(other_token).json()["text"] == "theirs"


def test_anonymous_callers_cannot_use_the_surface():
    assert client.post("/api/replay", json={
        "key": KEY, "text": "x", "consent": True}).status_code == 401
    assert client.get(f"/api/replay/{KEY}").status_code == 401


def test_an_invalid_token_has_no_owner():
    assert R.owner_for("not-a-real-token") is None
    assert R.owner_for(None) is None
    assert R.owner_for("") is None


# --------------------------------------------------------------------------- #
# First write wins
# --------------------------------------------------------------------------- #
def test_the_same_inputs_cannot_come_to_mean_a_different_reading(token):
    """Overwriting would reintroduce the contradiction replay exists to stop."""
    _store(token, text="the reading you were given")
    _store(token, text="a different one")
    assert _fetch(token).json()["text"] == "the reading you were given"


# --------------------------------------------------------------------------- #
# Consent to store is not consent to keep forever
# --------------------------------------------------------------------------- #
def test_expired_rows_read_as_absent(token, monkeypatch):
    _store(token)
    monkeypatch.setattr(R, "ttl_days", lambda: 1)
    conn = R._connect()
    conn.execute("UPDATE replay SET created = ?", (int(time.time()) - 3 * 86400,))
    conn.commit()
    conn.close()
    assert _fetch(token).status_code == 404


def test_prune_drops_expired_rows(token, monkeypatch):
    _store(token)
    monkeypatch.setattr(R, "ttl_days", lambda: 1)
    conn = R._connect()
    conn.execute("UPDATE replay SET created = ?", (int(time.time()) - 3 * 86400,))
    conn.commit()
    conn.close()
    assert R.prune() == 1
    assert R.stats()["rows"] == 0


def test_a_reader_can_delete_everything_held_for_them(token, other_token):
    _store(token, key=KEY)
    _store(token, key=OTHER_KEY)
    _store(other_token, key=KEY)
    r = client.delete("/api/replay", headers={"X-AAE-Token": token})
    assert r.status_code == 200 and r.json()["forgotten"] == 2
    assert _fetch(token).status_code == 404
    # ...and only theirs.
    assert _fetch(other_token).status_code == 200


# --------------------------------------------------------------------------- #
# Bounds
# --------------------------------------------------------------------------- #
def test_oversized_readings_are_refused(token, monkeypatch):
    monkeypatch.setattr(R, "max_chars", lambda: 32)
    assert _store(token, text="x" * 100).status_code == 413


def test_empty_text_is_refused_by_the_schema(token):
    assert _store(token, text="").status_code == 422


def test_a_short_key_is_refused(token):
    """Keys are sha256 hex; anything shorter is not a key this client made."""
    assert _store(token, key="short").status_code == 422


def test_owner_is_the_jti_not_the_token(token):
    """A raw token in a table is a credential at rest."""
    owner = R.owner_for(token)
    assert owner and owner not in token
