# Reconciliation Report — the ASTRA work order vs. the repository, 2026-08-12

_Requested by the operator's "ASTRA :: PRINCIPAL ENGINEER WORK ORDER"
(2026-08-12), which was written from the README alone and instructs that the
live state in `Hand_off.md` supersedes it wherever they conflict. They
conflict in one place that changes everything: **the work order assumes a
pre-launch repository ("everything standing between this repository and its
first dollar is marked planned"). Astra launched 2026-08-11** — M0–M4 are
done, the site is live at astra-arcana.com, and M5 is gated on operator
decisions (LLC, prices, live keys), not on code. Sequencing below follows
from that fact plus the operator's ratified session-25 order (Hand_off.md
§"THE NEXT SESSION"), which is executed in this session._

Confidence labels: **[E]** established from file evidence · **[X]** reasonable
extrapolation · **[H]** hypothesis requiring validation.

---

## The one P0 that is code, and what this session does about it

The work order's own priority logic ("Track E outranks all of the above")
converges with the ratified session-25 order: **a paying customer cannot get
their key into the Android app** [E — the only import path was
`?entitlement=` (`useStore.ts` module-load block), the APK has no address
bar, `AndroidManifest.xml` carries only a LAUNCHER intent-filter]. This
session builds the paste field (`LibraryVault.tsx`, `importEntitlement` in
`useStore.ts`, `entitlement-import.spec.ts`) and the interactive tarot widget
(`TarotCard.tsx`, `tarot-widget.spec.ts`) so both ride one APK cycle
(v1.0.2 / versionCode 3), per the operator's explicit sequencing.

---

## Track A — parity lock

> **Update, same day (session 25b):** A1 and A3 were BUILT after this report
> was written — see the "Track A delivered" section at the foot of this file.
> The rows below record the state as found, which is what a reconciliation is
> for; they are no longer current for A1/A3.

| Order | State | Evidence |
|---|---|---|
| A1 stratified property parity | **Unstarted** | `parity/` holds 9 fixed vectors; `backend/tools/gen_parity_vectors.py` is point-sampling only. No generative harness, no seeded stratification. [E] |
| A2 assert-the-decision | **Partial** | Categorical fields already compare **exactly** at the sample points — signs, houses, retro flags, grids, tallies (`parity/README.md` "Comparison rules"). No boundary-adversarial generation; tolerances live per-file, not as a versioned contract artifact; no ratchet detector. [E] |
| A3 external anchors | **Unstarted, correctly diagnosed** | `gen_parity_vectors.py` writes the backend's own output; the backend is an unfalsifiable oracle. Nothing under `parity/` is externally sourced. [E] The A3 acceptance list (JPL Horizons, Espenak, IERS) is the right shape. [X] |
| A4 mutation testing | **Unstarted** | No mutmut/cosmic-ray/Stryker anywhere in the tree. [E] |
| A5 invariant laws | **Partial by accident** | Davison and composite are pinned in `synastry.json` but the definitional-identity and commutativity *property tests* don't exist; house-arc conservation, harmonic identity etc. are implied by exact vectors at 2 charts only. [E] |

**Assessment:** Track A is the strongest genuinely-open engineering work in
the order. It is **P1, post-APK-cycle** — none of it is a launch blocker, and
the launch-blocking last mile (above) outranks it per both documents'
sequencing rules. A1+A3 are the highest-value pair. [X]

## Track B — privacy

| Order | State | Evidence |
|---|---|---|
| B1 local-first default | **Partial; the inversion is an operator decision** | The on-device engine is body-complete (17 bodies, vendored WASM Swiss — Hand_off session ~2026-07-08, `packages/astra-core/src/vendor/swisseph/`); offline chart/tarot/forecast/relational/predictive all pass e2e (`arcana-offline.spec.ts`, `forecast-offline.spec.ts`, `relational-offline.spec.ts`). But server-side compute is the deliberate online default, and main **killed** a "birth data never leaves this browser" claim as false and asserts it stays gone (session 24, `track-e1b-ask` autopsy). Inverting the default changes live product claims and the AI-consent surface — escalate to the operator, do not do unilaterally. [E] |
| B2 redaction + adversarial matrix | **Partial** | Root cause handled structurally: uvicorn access log silenced by design, our access line strips query strings, `test_structured_logging.py::test_no_birth_data_reaches_the_log_stream` exists (session-17 notes). The full 7-path adversarial matrix is unbuilt. [E] |
| B3 metric cardinality | **Largely satisfied by construction** | `backend/metrics.py:48-52` bounds labels to the route table with an `(other)` fold. No CI enumeration check; no written audit. [E] |

## Track C — determinism and versioning

| Order | State | Evidence |
|---|---|---|
| C1 retire MT19937 | **Conflicts with ratified state — escalate** | `mt19937.ts` is deliberately CPython-bit-exact and parity-locked (`parity/mt19937.json`, exact match); the session-25 acceptance explicitly requires draws stay bit-identical. The Python-version risk C1 names is real [X], but the migration (rng_version stamping, legacy branch) invalidates the "one coherent session" bar and touches every saved reading. Not doing this without the operator. |
| C2 artifact versioning | **Partial** | Every parity file carries a schema tag (`astra-parity/*@1`); vault format `astra-vault@3` with @1–@3 restore migration (Hand_off "Known gotchas"); API versioned `/api/v1`. The full six-field version stamp does not exist. [E] |
| C3 cross-environment determinism | **Mostly unstarted** | The web bundle reproduced byte-identically across builds (session 23); no OS/arch/locale CI matrix. [E] |
| C4 ephemeris pinning | **Partial — and recently proven to matter** | Parity + tests force the committed seas-only `SE_EPHE_PATH` (`gen_parity_vectors.py`, `tests/conftest.py`); production `backend/ephe/` is gitignored, and its absence on a fresh deploy silently dropped Chiron (session 24). `/api/health` now reports `ephemeris`. No checksummed pin, no divergence map. [E] |

## Track D — hardening

| Order | State | Evidence |
|---|---|---|
| D1 explicit edition | **Partial** | Fail-closed interlock with prefix wildcards exists (`entitlements.py:114` `_PUBLIC_SIGNAL_PREFIXES`, `:152` `assert_safe_boot`). The gap D1 names (a renamed/third-party payment key defeats inference) is real; `AAE_EDITION` assertion is unbuilt. Good P2 hardening. [E] |
| D2 entitlement failure modes | **Partial, with one deliberate conflict** | Verify is **fail-open on ledger error with signature primary**; revoke is fail-closed (`PUBLIC_LAUNCH_SCHEDULE.md` §4.1) — the work order demands fail-closed on verify. That was a deliberate, documented decision; reversing it is a product call, flagged, not silently "fixed". Refund/cancel namespace mismatch is documented (Hand_off session 24). `hmac.compare_digest` on token and dev-token paths (`entitlements.py:368,411`); no constant-time regression test. No consolidated failure-modes doc. [E] |
| D3 rate limiting | **Largely done** | Session 23 closed the real holes: per-IP keying behind `AAE_TRUST_PROXY`, per-user budget buckets, free-tier gating, global cap as backstop. Salted rotating hashes and subnet/ASN buckets unbuilt. [E] |
| D4 prompt injection | **Largely done** | `backend/promptsafe.py` + `test_prompt_quarantine.py` red-team cases (Phase 2.4 ✅). Output-schema validation before UI is partial. [E] |
| D5 supply chain | **Partial** | Gitleaks + CodeQL + Dependabot + secret scanning live; lockfiles pinned. No SBOM, no reproducible/signed containers (and the APK is knowingly not byte-reproducible — signing timestamps, session 23). [E] |
| D6 device perf budget | **Unstarted as a CI gate** | Verified empirically on a Pixel 10a in airplane mode (session 24), not gated. [E] |

## Track E / launch

**Done and live** [E]: launched 2026-08-11; M0 rail drill passed against
production; M3 policies shipped (`/legal`: privacy, terms, refunds, pricing);
API/PWA skew is engineered (dual `/api/v1` + bare prefix for stale shells;
service worker retired from reader builds via self-destroying worker).
**Open, non-code** [E]: M5 = LLC, price confirmation, live keys, one real
purchase + cancel→revoke drill. **Open, code** [E]: the session-25 ratified
order — executed in this session.

---

## Closing judgments

1. The work order's biggest factual miss is tense: it prescribes a launch the
   repository already performed. Its biggest structural contribution is
   Track A (A1/A3 especially) — real, unclaimed work. [X]
2. Three items would *reverse* ratified decisions and are escalated rather
   than implemented: C1 (retire MT19937), the D2 verify posture, and B1's
   default inversion. [E]
3. Feature freeze is respected: nothing speculative was opened; the two
   features built this session are the operator's own ratified order.

---

# Track A delivered (session 25b, same day)

## A1 — stratified generative parity ✅

`backend/tools/parity_property.py` + `packages/astra-core/tools/case-bridge.mjs`.
2000 seeded cases per CI run (job `property-parity`, seeded from
`github.run_id`), streamed through one long-lived TS bridge process.
Stratification oversamples the hostile regions; a representative run:

```
strata: fractional-tz=1474, jd-rollover=201, local-midnight=250,
        near-polar=285, polar=484, sidereal=585, southern=1014, station=177
```

Failures print the seed, the case, a **shrunk** minimal reproduction, and the
replay command. Falsification verified: `PARITY_INJECT_BIAS_DEG=0.0167`
(1 arcminute) turns the suite red on 5/5 cases — the work order's stated
acceptance bar. [E]

**It found a real bug on its first run.** `@astra/core` computed sidereal
**whole-sign** cusps as the *tropical* sign boundaries shifted into the
sidereal frame, so all twelve cusps sat ~5° mid-sign instead of snapping to
sidereal boundaries the way `swe_houses_ex` does. Roughly one body in three
landed in the wrong house on every sidereal whole-sign chart. Fixed in
`packages/astra-core/src/ephemeris.ts` (snap from the sidereal Ascendant when
whole-sign is the system actually served, including via polar fallback);
pinned by `packages/astra-core/test/sidereal-houses.test.ts`. No golden vector
covered sidereal whole-sign, so nothing was red — which is precisely the
argument the work order made for A1. [E]

**Deliberately out of scope, with reasons:** DST transitions (the
deterministic engines take `tz_offset` as a given number — no tz database on
this path; historical-zone resolution is `frontend/src/lib/timezone.ts` with
its own suite) and the Julian/Gregorian boundary (both engines call
`swe.julday(..., GREG_CAL)` unconditionally, so there is no dual-calendar
behaviour to diverge — the sampled range starts at 1800). [E]

## A3 — external ground-truth anchors ⚠️ infrastructure complete, data partial

`parity/anchors/` with the full record contract (source, url, verbatim
citation, retrieval date, the source's own uncertainty, and a separately
justified engine allowance), a CI `anchors-guard` job that fails any PR
touching anchor data without an `ANCHOR-CHANGE:` trailer, and two independent
runners — `backend/tests/test_anchors.py` (5 tests) and
`packages/astra-core/test/anchors.test.ts` — so **neither engine is ever the
other's reference in this suite**.

**Landed:** ΔT at 2000-01-01 (63.83 s) and 2000-12-31 (64.09 s) from the NASA
GSFC / EclipseWise tables (Espenak & Meeus). The backend returns 63.8285 s and
64.0906 s — inside tolerance, and the pair also pins the table's *slope*
across the year, which a single point cannot. Value was recorded before the
engine was consulted; that ordering is what keeps it an anchor. [E]

**Deferred with the blocker written down** (`parity/anchors/ACQUISITION.md`):
JPL Horizons, NASA GSFC, USNO, IERS and Wikipedia are all unreachable from
this environment's egress proxy (403 / `EGRESS_BLOCKED`, verified 2026-08-12).
Planetary longitudes, eclipses, the Lahiri ayanamsa, and ΔT at 1900/2050 are
specified there with their **exact queries** and schemas; both test runners
pick each file up automatically the moment it exists. Fabricating the values
from recollection was refused — a misremembered digit either red-bars a
correct engine or sanctifies a wrong one, and the second failure is silent.
[E]

**Judgment:** A3's remaining work is data acquisition, not engineering, and
needs ~20 minutes on a machine with open egress. The ayanamsa anchor is the
highest-value one outstanding, because A1 has now demonstrated the sidereal
frame is where this codebase's real bugs live. [X]
