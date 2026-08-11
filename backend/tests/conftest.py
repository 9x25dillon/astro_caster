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

# Neutralize every paid provider key for the whole session — same mechanism,
# same reason: keep a LOCAL run identical to CI, which has no operator .env.
#
# This one costs MONEY when it is wrong, so it is worth stating plainly. Several
# suites document "no key in the test env, so the offline path is taken" as an
# assumption in a docstring (test_course.py says exactly that). On CI it holds.
# On the operator's machine load_dotenv() supplies a funded key, the live path
# is taken instead, and the offline-structure assertions fail — AFTER billing
# for the call. test_course.py alone calls generate_course five times, each a
# Fable-5 course at a 24k-token budget; a bare `pytest` was spending real
# credit and taking minutes instead of seconds.
#
# Tests that WANT the live path must set a key explicitly via monkeypatch, which
# makes the intent visible at the call site rather than dependent on whose
# machine is running. Note several modules snapshot their key at import time
# (e.g. oracle_report._ANTHROPIC_KEY), so this must precede any of their
# imports — being in conftest at collection time is what guarantees that.
for _paid_key in (
    "AAE_ANTHROPIC_API_KEY",   # oracle report, personal report, course
    "AAE_OPENAI_API_KEY",      # deck-plate image generation
    "AAE_AI_API_KEY",          # OpenAI-compatible gateway (ask/tarot)
    "ELEVENLABS_API_KEY",      # premium narration
):
    os.environ[_paid_key] = ""

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
