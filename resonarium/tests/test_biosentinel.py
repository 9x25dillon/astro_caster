"""
Verification suite for the Resonarium <-> Biosentinel integration.

Runs with stdlib only:
    python3 -m unittest discover -s resonarium/tests -v
(also pytest-compatible). The Node parity tests skip automatically when
node is unavailable.
"""
from __future__ import annotations

import json
import math
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))

import natal_seed as ns  # noqa: E402

CLI = ROOT / "resonarium_biosentinel_cli.py"
NODE = shutil.which("node")


def run_cli(args, state: Path):
    return subprocess.run(
        [sys.executable, str(CLI), "--state", str(state), *args],
        capture_output=True, text=True, cwd=str(ROOT))


class TestSeedDeterminism(unittest.TestCase):
    def test_same_inputs_same_seed(self):
        s1 = ns.derive_natal_seed(ns.TEST_CHART, ns.TEST_INTENTION)
        s2 = ns.derive_natal_seed(dict(ns.TEST_CHART), ns.TEST_INTENTION)
        self.assertEqual(s1, s2)

    def test_known_vector(self):
        seed = ns.derive_natal_seed(ns.TEST_CHART, ns.TEST_INTENTION)
        self.assertEqual(ns.seed_to_hex(seed), "86813727ef5b4048")

    def test_intention_changes_seed(self):
        self.assertNotEqual(
            ns.derive_natal_seed(ns.TEST_CHART, "clarity"),
            ns.derive_natal_seed(ns.TEST_CHART, "focus"))

    def test_key_order_irrelevant(self):
        reordered = dict(reversed(list(ns.TEST_CHART.items())))
        self.assertEqual(ns.derive_natal_seed(ns.TEST_CHART, ""),
                         ns.derive_natal_seed(reordered, ""))

    def test_extra_keys_deterministic(self):
        chart = dict(ns.TEST_CHART, zeta=1.5, alpha=2.5)
        self.assertEqual(ns.derive_natal_seed(chart, ""),
                         ns.derive_natal_seed(dict(chart), ""))


class TestSanitization(unittest.TestCase):
    def test_control_chars_stripped(self):
        self.assertEqual(ns.sanitize_intention("a\x00b\tc\nd\x7fe"), "abcde")

    def test_length_limit(self):
        self.assertEqual(len(ns.sanitize_intention("x" * 1000)),
                         ns.MAX_INTENTION_LENGTH)

    def test_space_collapse_and_trim(self):
        self.assertEqual(ns.sanitize_intention("  a   b  "), "a b")

    def test_empty(self):
        self.assertEqual(ns.sanitize_intention(None), "")
        self.assertEqual(ns.sanitize_intention(""), "")


class TestChartValidation(unittest.TestCase):
    def test_rejects_empty(self):
        for bad in ({}, None, [], "chart"):
            with self.assertRaises(ns.ChartValidationError):
                ns.validate_chart(bad)  # type: ignore[arg-type]

    def test_rejects_incomplete(self):
        with self.assertRaises(ns.ChartValidationError):
            ns.validate_chart({"sun": 1.0, "moon": 2.0})

    def test_rejects_non_finite(self):
        with self.assertRaises(ns.ChartValidationError):
            ns.validate_chart({"sun": float("nan"), "moon": 1.0, "asc": 2.0})

    def test_rejects_nested(self):
        with self.assertRaises(ns.ChartValidationError):
            ns.validate_chart({"sun": 1.0, "moon": 2.0, "asc": {"deg": 3}})

    def test_accepts_minimal(self):
        ns.validate_chart({"sun": 1.0, "moon": 2.0, "asc": 3.0})


class TestClamping(unittest.TestCase):
    def test_sentinel_params_clamped(self):
        clamped = ns.clamp_sentinel_params(
            {"n": 9999, "k": -5, "perturb": 1e9, "spread": 100, "active": 1})
        self.assertEqual(clamped, {"active": True, "n": 64, "k": 0.0,
                                   "perturb": 100.0, "spread": 10.0})

    def test_defaults_on_garbage(self):
        self.assertEqual(ns.clamp_sentinel_params({"n": "wat", "k": None}),
                         ns.SENTINEL_DEFAULTS)
        self.assertEqual(ns.clamp_sentinel_params(None), ns.SENTINEL_DEFAULTS)

    def test_frequency_clamp(self):
        self.assertEqual(ns.clamp_frequency(0.1), ns.FREQ_MIN_HZ)
        self.assertEqual(ns.clamp_frequency(1e9), ns.FREQ_MAX_HZ)
        self.assertEqual(ns.clamp_frequency(440.0), 440.0)

    def test_visual_modulation_ceiling_below_risk_zone(self):
        self.assertLess(ns.VISUAL_MODULATION_MAX_HZ, 3.0)

    def test_modulated_output_always_in_range(self):
        seed = ns.derive_natal_seed(ns.TEST_CHART)
        rand = ns.mulberry32(ns.seed_lower32(seed))
        sentinel = {"active": True, "n": 64, "k": 0.0,
                    "perturb": 100.0, "spread": 10.0}
        for i in range(512):
            f = ns.modulate_frequency(25.0, i % 64, sentinel, rand)
            self.assertGreaterEqual(f, ns.FREQ_MIN_HZ)
            self.assertLessEqual(f, ns.FREQ_MAX_HZ)


class TestBaselinePurity(unittest.TestCase):
    """Sentinel off => output identical to natal bedrock, PRNG untouched."""

    def test_off_returns_exact_bedrock(self):
        bedrock = ns.bedrock_frequencies(ns.TEST_CHART)
        rand = ns.mulberry32(1234)
        off = dict(ns.SENTINEL_DEFAULTS)
        for i, f in enumerate(bedrock):
            self.assertEqual(ns.modulate_frequency(f, i, off, rand), f)
        # PRNG must not have been consumed while inactive.
        self.assertEqual(rand(), ns.mulberry32(1234)())

    def test_bedrock_derivation_pure(self):
        chart = dict(ns.TEST_CHART)
        b1 = ns.bedrock_frequencies(chart)
        b2 = ns.bedrock_frequencies(chart)
        self.assertEqual(b1, b2)
        self.assertEqual(chart, ns.TEST_CHART)  # input never mutated


class TestTemporalTrace(unittest.TestCase):
    def test_entries_are_valid_json(self):
        entry = ns.make_trace_entry("param_change", {"n": 8, "k": 0.7})
        parsed = json.loads(json.dumps(entry))
        self.assertEqual(set(parsed), {"event", "timestamp_utc", "params"})

    def test_privacy_guard(self):
        for leak in ({"sun": 1.0}, {"chart": {}}, {"intention": "x"},
                     {"birth_time": "12:00"}, {"natal_bedrock": []}):
            with self.assertRaises(ValueError):
                ns.make_trace_entry("event", leak)

    def test_redact_state(self):
        state = {"sentinel": {}, "natal_chart": {"sun": 1},
                 "chart": {}, "natal_bedrock": [220.0], "seed_hex": "ab"}
        redacted = ns.redact_state(state)
        self.assertEqual(set(redacted), {"sentinel", "seed_hex"})


class TestCLI(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.state = self.dir / "state.json"
        self.chart_file = self.dir / "chart.json"
        self.chart_file.write_text(json.dumps(ns.TEST_CHART))

    def test_seed_command_deterministic(self):
        outs = [run_cli(["seed", "--chart", str(self.chart_file),
                         "--intention", "clarity"], self.state).stdout
                for _ in range(2)]
        self.assertEqual(outs[0], outs[1])
        self.assertEqual(json.loads(outs[0])["seed_hex"], "86813727ef5b4048")

    def test_set_clamps_and_traces(self):
        result = run_cli(["set", "--n", "9999", "--k", "-2", "--on"], self.state)
        self.assertEqual(result.returncode, 0)
        out = json.loads(result.stdout)
        self.assertEqual(out["sentinel"]["n"], 64)
        self.assertEqual(out["sentinel"]["k"], 0.0)
        trace = json.loads(run_cli(["trace", "--json"], self.state).stdout)
        events = [e["event"] for e in trace]
        self.assertIn("sentinel_toggle", events)
        self.assertIn("param_change", events)
        for entry in trace:
            self.assertEqual(set(entry), {"event", "timestamp_utc", "params"})

    def test_export_redacted_by_default(self):
        run_cli(["anchor", "--chart", str(self.chart_file)], self.state)
        exported = json.loads(run_cli(["export"], self.state).stdout)
        for forbidden in ("natal_chart", "chart", "natal_bedrock"):
            self.assertNotIn(forbidden, exported)
        # even a hand-tampered state file gets redacted on the way out
        tampered = json.loads(self.state.read_text())
        tampered["natal_chart"] = dict(ns.TEST_CHART)
        self.state.write_text(json.dumps(tampered))
        exported = json.loads(run_cli(["export"], self.state).stdout)
        self.assertNotIn("natal_chart", exported)

    def test_import_clamps_and_strips(self):
        payload = self.dir / "incoming.json"
        payload.write_text(json.dumps({
            "schema_version": "1.0.0",
            "sentinel": {"active": True, "n": 500, "k": 2, "perturb": -1,
                         "spread": 99},
            "natal_chart": {"sun": 1.0},
            "temporal_trace": [],
        }))
        result = run_cli(["import", str(payload)], self.state)
        out = json.loads(result.stdout)
        self.assertEqual(out["sentinel"],
                         {"active": True, "n": 64, "k": 1.0,
                          "perturb": 0.0, "spread": 10.0})
        stored = json.loads(self.state.read_text())
        self.assertNotIn("natal_chart", stored)

    def test_verify_command(self):
        result = run_cli(["verify"], self.state)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_preview_bedrock_immutable(self):
        result = run_cli(["preview", "--chart", str(self.chart_file),
                          "--intention", "clarity", "--steps", "2"], self.state)
        out = json.loads(result.stdout)
        bedrock = out["bedrock_hz"]
        for voice in out["voices"]:
            self.assertEqual(voice["bedrock_hz"],
                             bedrock[voice["voice"] % len(bedrock)])


@unittest.skipUnless(NODE, "node not available")
class TestBrowserParity(unittest.TestCase):
    """The success criterion: identical seed + PRNG stream + modulation
    across the Python CLI and the browser JS implementation."""

    @classmethod
    def setUpClass(cls):
        result = subprocess.run(
            [NODE, str(ROOT / "parity_check.cjs")],
            capture_output=True, text=True, cwd=str(ROOT))
        assert result.returncode == 0, result.stderr
        cls.js = json.loads(result.stdout)

    def test_canonical_string(self):
        self.assertEqual(self.js["canonical"],
                         ns.canonicalize_chart(ns.TEST_CHART))

    def test_seed_identical(self):
        seed = ns.derive_natal_seed(ns.TEST_CHART, ns.TEST_INTENTION)
        self.assertEqual(self.js["seed_hex"], ns.seed_to_hex(seed))
        self.assertEqual(self.js["seed_prng32"], ns.seed_lower32(seed))

    def test_prng_stream_identical(self):
        seed = ns.derive_natal_seed(ns.TEST_CHART, ns.TEST_INTENTION)
        rand = ns.mulberry32(ns.seed_lower32(seed))
        py = [rand() for _ in range(16)]
        self.assertEqual(self.js["prng"], py)  # exact float equality

    def test_bedrock_and_modulation_match(self):
        seed = ns.derive_natal_seed(ns.TEST_CHART, ns.TEST_INTENTION)
        bedrock = ns.bedrock_frequencies(ns.TEST_CHART)
        for js_f, py_f in zip(self.js["bedrock"], bedrock, strict=True):
            self.assertTrue(math.isclose(js_f, py_f, abs_tol=1e-9))
        sentinel = ns.clamp_sentinel_params(
            {"active": True, "n": 8, "k": 0.7, "perturb": 5.0, "spread": 1.0})
        rand = ns.mulberry32(ns.seed_lower32(seed))
        for i, js_f in enumerate(self.js["modulated"]):
            py_f = ns.modulate_frequency(
                bedrock[i % len(bedrock)], i, sentinel, rand)
            self.assertTrue(math.isclose(js_f, py_f, abs_tol=1e-9))

    def test_js_off_baseline_pure(self):
        self.assertTrue(self.js["off_equals_bedrock"])

    def test_sanitize_and_clamp_parity(self):
        expected = ns.sanitize_intention("  a\x00 b\tc\nd   e  " + "x" * 300)
        self.assertEqual(self.js["sanitize"], expected)
        self.assertEqual(
            self.js["clamped"],
            ns.clamp_sentinel_params(
                {"n": 9999, "k": -5, "perturb": 1e9, "spread": 100}))


class TestNoNetworkCalls(unittest.TestCase):
    """No code path in the shipped files may reach the network."""

    FORBIDDEN = ["fetch(", "XMLHttpRequest", "WebSocket", "EventSource",
                 "sendBeacon", "importScripts", "http://", "https://",
                 "urllib", "requests.", "socket.", "aiohttp"]
    ALLOWED_URL_PREFIXES = [
        "http://json-schema.org",            # schema $id only, never fetched
        "https://claude.ai",                 # commit trailer in comments
    ]

    def scan(self, path: Path):
        text = path.read_text(encoding="utf-8")
        hits = []
        for lineno, line in enumerate(text.splitlines(), 1):
            for token in self.FORBIDDEN:
                if token in line:
                    if token in ("http://", "https://") and any(
                            p in line for p in self.ALLOWED_URL_PREFIXES):
                        continue
                    hits.append(f"{path.name}:{lineno}: {token}")
        return hits

    def test_no_network_tokens(self):
        hits = []
        for name in ("natal_seed.py", "natal_seed.js",
                     "resonarium_biosentinel_cli.py",
                     "resonarium-enhanced.html", "parity_check.cjs"):
            hits += self.scan(ROOT / name)
        self.assertEqual(hits, [])

    def test_html_has_lockdown_csp(self):
        html = (ROOT / "resonarium-enhanced.html").read_text(encoding="utf-8")
        self.assertIn("connect-src 'none'", html)
        self.assertIn("default-src 'none'", html)


if __name__ == "__main__":
    unittest.main(verbosity=2)
