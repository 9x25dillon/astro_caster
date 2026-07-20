"""
Phase 2.5 — edge header drift-lock.

frontend/nginx.conf carries the public edge's security header set in THREE
places (server{}, /sw.js, /assets/) because nginx add_header inheritance is
all-or-nothing: a location that sets any header of its own drops the server
block's. The config comment says "keep the three copies identical" — this
test makes that a hard gate instead of discipline.
"""
import os
import re

_CONF = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "frontend", "nginx.conf",
)

_SECURITY_HEADERS = (
    "Content-Security-Policy",
    "X-Content-Type-Options",
    "X-Frame-Options",
    "Referrer-Policy",
    "Permissions-Policy",
    "Strict-Transport-Security",
)


def _header_sets():
    """The add_header security set per block: server{} plus each location."""
    text = open(_CONF, encoding="utf-8").read()
    blocks: dict[str, dict[str, str]] = {}
    # Split on location directives; the preamble is the server{} block.
    parts = re.split(r"location\s+(= /sw\.js|/assets/|/api/|/)\s*\{", text)
    names = ["server"] + parts[1::2]
    bodies = [parts[0]] + parts[2::2]
    for name, body in zip(names, bodies):
        headers = dict(
            re.findall(r'add_header\s+([\w-]+)\s+"([^"]*)"\s+always;', body)
        )
        blocks[name] = {k: v for k, v in headers.items() if k in _SECURITY_HEADERS}
    return blocks


def test_required_headers_present_on_server_block():
    server = _header_sets()["server"]
    for name in _SECURITY_HEADERS:
        assert name in server, f"server block missing {name}"
    csp = server["Content-Security-Policy"]
    assert "default-src 'self'" in csp
    assert "frame-ancestors 'none'" in csp
    assert "object-src 'none'" in csp
    assert server["X-Content-Type-Options"] == "nosniff"
    assert server["X-Frame-Options"] == "DENY"
    assert server["Referrer-Policy"] == "no-referrer"
    assert "max-age" in server["Strict-Transport-Security"]


def test_header_copies_identical_in_every_location_that_overrides():
    """Any location using add_header must repeat the full set verbatim."""
    blocks = _header_sets()
    server = blocks["server"]
    for name, headers in blocks.items():
        if name == "server":
            continue
        body_has_add_header = bool(headers) or name in ("= /sw.js", "/assets/")
        if not body_has_add_header:
            continue  # inherits the server set untouched
        assert headers == server, (
            f"location {name} security headers drifted from the server block: "
            f"{sorted(set(server) ^ set(headers)) or 'values differ'}"
        )
