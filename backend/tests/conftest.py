import os

# Default the whole test session to a recognized non-production environment.
# main.py calls entitlements.assert_safe_boot() at import time, which refuses to
# boot in production with a default secret / trust mode — importing it under the
# fail-closed default (unset == production) would break test collection.
# Individual tests override AAE_ENV via monkeypatch where they need production.
os.environ.setdefault("AAE_ENV", "test")

# Force canonical TIERED mode for the whole suite, regardless of the operator's
# backend/.env. Edition P (AAE_PERSONAL_MODE=1) grants oracle tier + operator
# rights to every request, which flips the tier/admin/boot-guard tests to
# spurious failures. main.py's load_dotenv() will NOT override an already-set
# variable, so assigning these before main is imported wins over .env. (CI has
# no operator .env and is unaffected; this only keeps LOCAL runs matching CI —
# same fix as playwright.config.ts's webServer.env.)
os.environ["AAE_PERSONAL_MODE"] = ""
os.environ["AAE_TRUST_MODE"] = ""

# Pin the ephemeris to the vendored seas-only dir (the drift-lock config the
# parity vectors are generated against, and the exact file set the on-device
# TS engine ships). Forced, not defaulted: a developer's backend/ephe or env
# must not skew the drift-lock comparison. Must precede any ephemeris import.
_VENDORED_EPHE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "packages", "astra-core", "src", "vendor", "swisseph")
os.environ["SE_EPHE_PATH"] = _VENDORED_EPHE

# Isolate the receipts ledger per test session. Without this, purchase-rail
# tests redeem their fixture tx hashes into the developer's REAL local ledger
# (backend/data/receipts.db) — first-wins dedup then poisons any later run
# whose session seed differs (exactly what happened when the drift-lock
# ephemeris config changed the reference-chart seeds).
import tempfile  # noqa: E402

os.environ.setdefault(
    "AAE_RECEIPTS_DB",
    os.path.join(tempfile.mkdtemp(prefix="aae-test-receipts-"), "receipts.db"),
)
