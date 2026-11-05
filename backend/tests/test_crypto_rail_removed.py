"""The crypto payment rail was removed on 2026-11-05.

Its claim path trusted the first caller holding a public tx hash, so anyone
watching the chain could claim or take over a key (audit finding F4). Cards
through Stripe are the only way to pay now. These pin that the routes stay
gone and that /api/pricing never advertises the rail again.
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402

client = TestClient(main.app)


@pytest.mark.parametrize("method,path", [
    ("get", "/api/treasury"),
    ("post", "/api/donate/verify"),
    ("post", "/api/entitlement/relink"),
    ("post", "/api/personal-report/purchase"),
])
def test_crypto_routes_are_gone(method, path):
    body = {"tx_hash": "0x" + "a" * 64, "seed": "s"}
    r = client.get(path) if method == "get" else client.post(path, json=body)
    assert r.status_code in (404, 405), (path, r.status_code)


def test_pricing_never_advertises_crypto(monkeypatch):
    # Old .env files may still carry the treasury vars; they must not matter.
    monkeypatch.setenv("AAE_TREASURY_ETH", "0x" + "1" * 40)
    monkeypatch.setenv("AAE_ETH_RPC", "https://rpc.example")
    assert client.get("/api/pricing").json()["crypto_available"] is False
