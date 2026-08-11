"""
Phase 2.5 — edge header drift-lock.

frontend/nginx.conf carries the public edge's security header set in several
places per server block (server{}, /sw.js, /assets/, /legal/) because nginx
add_header inheritance is all-or-nothing: a location that sets any header of
its own drops its server block's entire set. The config comment says "keep the
copies identical" — this test makes that a hard gate instead of discipline.

M4 (2026-08-11) added a SECOND server block: the app is served on
app.astra-arcana.com and the landing page on the apex. The two hosts carry
DIFFERENT sets on purpose — the landing page has no scripts, no fetches and no
forms, so it pins those to 'none'. So the invariant is per-server: every server
block must carry the full required set, and every location that overrides must
repeat ITS OWN server's set verbatim. Comparing across hosts would be wrong.
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


def _conf_text() -> str:
    """The config with comments stripped.

    Comments are removed before any brace matching: they legitimately contain
    braces (`${WEB_PORT}`) and would otherwise have to balance by luck. No
    directive in this file quotes a `#`, so line-stripping is lossless.
    """
    raw = open(_CONF, encoding="utf-8").read()
    return "\n".join(line.split("#", 1)[0] for line in raw.splitlines())


def _server_blocks() -> dict[str, str]:
    """Each server{} body, keyed by its first server_name."""
    text = _conf_text()
    blocks: dict[str, str] = {}
    for m in re.finditer(r"\bserver\s*\{", text):
        depth, i = 1, m.end()
        while depth:
            depth += {"{": 1, "}": -1}.get(text[i], 0)
            i += 1
        body = text[m.end():i - 1]
        name = re.search(r"server_name\s+([^;]+);", body)
        assert name, "a server block has no server_name"
        blocks[name.group(1).split()[0]] = body
    assert blocks, "no server blocks found — did the config move?"
    return blocks


def _header_sets(body: str) -> dict[str, dict[str, str]]:
    """The add_header security set per block: this server{} plus each location."""
    # Split on location directives; the preamble is the server{} block itself.
    parts = re.split(r"location\s+([^{]+?)\s*\{", body)
    names = ["server"] + [p.strip() for p in parts[1::2]]
    bodies = [parts[0]] + parts[2::2]
    out: dict[str, dict[str, str]] = {}
    for name, chunk in zip(names, bodies):
        headers = dict(
            re.findall(r'add_header\s+([\w-]+)\s+"([^"]*)"\s+always;', chunk)
        )
        out[name] = {k: v for k, v in headers.items() if k in _SECURITY_HEADERS}
    return out


def test_required_headers_present_on_every_server_block():
    for host, body in _server_blocks().items():
        server = _header_sets(body)["server"]
        for name in _SECURITY_HEADERS:
            assert name in server, f"{host}: server block missing {name}"
        csp = server["Content-Security-Policy"]
        assert "default-src 'self'" in csp, host
        assert "frame-ancestors 'none'" in csp, host
        assert "object-src 'none'" in csp, host
        assert server["X-Content-Type-Options"] == "nosniff", host
        assert server["X-Frame-Options"] == "DENY", host
        assert server["Referrer-Policy"] == "no-referrer", host
        assert "max-age" in server["Strict-Transport-Security"], host


def test_header_copies_identical_within_each_server_block():
    """Any location using add_header must repeat its own server's full set."""
    for host, body in _server_blocks().items():
        blocks = _header_sets(body)
        server = blocks["server"]
        for name, headers in blocks.items():
            if name == "server" or not headers:
                continue  # no add_header of its own => inherits untouched
            assert headers == server, (
                f"{host}: location {name} security headers drifted from its "
                f"server block: {sorted(set(server) ^ set(headers)) or 'values differ'}"
            )


# --- M4 deploy layout -------------------------------------------------------
# The two-origin split is load-bearing in ways that are invisible from inside
# this repo: the app's service worker claims scope "/" and the APK's immutable
# PURCHASE_URL points at the apex. These lock the shape in.

def test_app_and_landing_are_separate_hosts():
    hosts = _server_blocks()
    assert "app.astra-arcana.com" in hosts, "the app host is gone"
    assert "astra-arcana.com" in hosts, (
        "the apex host is gone — the signed APK's PURCHASE_URL "
        "(https://astra-arcana.com/#support) has nowhere to land"
    )


def test_exactly_one_default_server():
    """Two default_servers is an nginx startup error, zero is a silent surprise."""
    defaults = [
        host for host, body in _server_blocks().items()
        if re.search(r"listen\s+[^;]*\bdefault_server\b", body)
    ]
    assert defaults == ["app.astra-arcana.com"], (
        f"expected the app to be the default server, got {defaults} — "
        "an unrecognised Host (and plain `docker compose up`) must reach the app"
    )


def test_landing_host_does_not_proxy_the_api():
    """The marketing origin must not expose the payment/AI surface at all."""
    landing = _server_blocks()["astra-arcana.com"]
    assert "proxy_pass" not in landing, (
        "the landing host gained a proxy — it makes zero requests by design"
    )


def test_legal_pages_resolve_on_both_hosts():
    """One source of truth (dist/legal), reachable at /legal/* from either host."""
    hosts = _server_blocks()
    assert re.search(r"location\s+/legal/\s*\{[^}]*root\s+/usr/share/nginx/html;",
                     hosts["astra-arcana.com"], re.S), (
        "the apex no longer serves /legal from the app build — the footer links "
        "and the refund policy would 404 on the marketing origin"
    )
    # On the app host they are plain files under the SPA root; the fallback
    # would mask a missing file with the app shell, so assert the root is the
    # build output rather than asserting a location exists.
    assert "root /usr/share/nginx/html;" in hosts["app.astra-arcana.com"]
