import os

# Default the whole test session to a recognized non-production environment.
# main.py calls entitlements.assert_safe_boot() at import time, which refuses to
# boot in production with a default secret / trust mode — importing it under the
# fail-closed default (unset == production) would break test collection.
# Individual tests override AAE_ENV via monkeypatch where they need production.
os.environ.setdefault("AAE_ENV", "test")
