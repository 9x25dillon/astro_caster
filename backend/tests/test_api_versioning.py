"""
Phase 3.1 — API versioning. Every /api/* route is also served at /api/v1/*
(the middleware rewrites the prefix before routing), and bare /api/* keeps
working so an app shell cached before a backend upgrade tolerates skew.
"""
import os
import sys

from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import main  # noqa: E402

client = TestClient(main.app)

_BIRTH = {"year": 1879, "month": 3, "day": 14, "hour": 11, "minute": 30,
          "second": 0, "lat": 48.4, "lng": 10.0, "tz_offset": 0.67,
          "house_system": "P", "zodiac": "tropical", "ayanamsha": 1}


def test_health_served_on_both_prefixes():
    legacy = client.get("/api/health")
    versioned = client.get("/api/v1/health")
    assert legacy.status_code == versioned.status_code == 200
    assert legacy.json()["api_version"] == main.API_VERSION
    assert versioned.json()["api_version"] == main.API_VERSION


def test_post_endpoint_served_on_v1():
    r = client.post("/api/v1/generate-chart", json=_BIRTH)
    assert r.status_code == 200
    assert r.json()["planets"]


def test_v1_and_legacy_return_identical_charts():
    a = client.post("/api/generate-chart", json=_BIRTH).json()
    b = client.post("/api/v1/generate-chart", json=_BIRTH).json()
    assert a["planets"] == b["planets"]


def test_unknown_version_is_not_invented():
    # Only the declared version rewrites; /api/v2/* must 404, not silently
    # serve v1 behavior under a contract we never promised.
    assert client.get("/api/v2/health").status_code == 404


def test_v1_prefix_only_rewrites_whole_segment():
    # /api/v1x/... must not be treated as versioned.
    assert client.get("/api/v1x/health").status_code == 404


def test_root_advertises_version():
    body = client.get("/").json()
    assert body["api_version"] == main.API_VERSION
    assert body["health"] == "/api/v1/health"
