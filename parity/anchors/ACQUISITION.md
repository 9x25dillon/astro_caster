# Acquiring the remaining anchors (Track A3)

Everything here is **deferred work with the blocker written down**, per the
work order's rule that a deferred item carries an explicit reason. The reason
is the same for all of it:

> This session's environment enforces a network egress allowlist. JPL
> Horizons (`ssd.jpl.nasa.gov`), NASA GSFC (`eclipse.gsfc.nasa.gov`), USNO
> (`aa.usno.navy.mil`), IERS, and even Wikipedia all returned
> `403 CONNECT tunnel failed` / `EGRESS_BLOCKED` on 2026-08-12. Anchors
> cannot be invented; the whole point of the directory is that its contents
> did not come from this repository — or from a model's memory.

> **⚠️ THE BLOCKER ABOVE IS STALE (retested 2026-08-15).** All three hosts
> answer now, and §3's eclipses were acquired that day by direct HTTP GET. The
> quoted note is kept because it is the reason the older files look thin, not
> because it still applies. **Retest before deferring anything on egress
> grounds** — it costs one `curl` and this blocker outlived its truth by three
> days, nearly deferring work that was already possible.

Run these from a machine with open egress. Each block gives the **exact
query**, so the retrieved value is reproducible by a third party, which is
the property that makes an anchor an anchor.

---

## 1. Planetary longitudes — `planet_longitudes.json`

**Source:** JPL Horizons (the reference ephemeris; DE44x-class integration —
an independent lineage from Swiss Ephemeris' DE431 compression and wholly
independent of Moshier's analytic series).

**Query** (one per body per epoch; `499` = Mars, `199` Mercury, `299` Venus,
`599` Jupiter, `699` Saturn, `799` Uranus, `899` Neptune, `999` Pluto,
`10` Sun, `301` Moon):

```
https://ssd.jpl.nasa.gov/api/horizons.api?format=text
  &COMMAND='499'
  &EPHEM_TYPE=OBSERVER
  &CENTER='500@399'          # geocentric — matches swe_calc_ut's default
  &QUANTITIES='31'           # ObsEcLon / ObsEcLat: apparent ecliptic lon/lat of date
  &TLIST='2451545.0'         # J2000.0; repeat for the other epochs
  &TLIST_TYPE=JD
  &ANG_FORMAT=DEG
  &REF_SYSTEM=ICRF
```

**Epochs required:** J2000.0 (JD 2451545.0) plus three others spanning the
supported range — suggest JD 2378497.0 (1800-01-01), JD 2415020.5
(1900-01-01), JD 2488069.5 (2100-01-01).

**Frame trap — read before recording anything.** `QUANTITIES='31'` returns
the **apparent** position referred to the **true ecliptic and equinox of
date**, which is what `swe_calc_ut` returns by default. If you instead pull
`QUANTITIES='18'` or set `REF_SYSTEM` to J2000 ecliptic, you get positions
in a *different frame* and the comparison will be wrong by up to ~1.4° per
century of precession — large, systematic, and easy to mistake for an engine
bug. Record the frame in the anchor record's `frame` field either way.

**Expected agreement:** Swiss Ephemeris tracks DE431 to well under an
arcsecond for the classical bodies. Set `uncertainty` from Horizons' own
stated precision and `engine_allowance` to 1 arcsec (0.000278°) with the
justification that light-time/aberration convention differences live at that
level. Anything larger is a finding, not a tolerance to widen.

**Schema** (mirror `delta_t.json`'s record contract):

```json
{
  "schema": "astra-parity/anchor-longitudes@1",
  "quantity": "ecliptic_longitude_deg",
  "frame": "true ecliptic and equinox of date, geocentric apparent",
  "anchors": [{
    "id": "mars-j2000", "body": "Mars", "jd_ut": 2451545.0,
    "value": 0.0, "unit": "deg",
    "uncertainty": 0.0, "uncertainty_basis": "...",
    "engine_allowance": 0.000278, "engine_allowance_note": "...",
    "source": "JPL Horizons", "url": "<the full query above>",
    "citation": "<the $$SOE table row, verbatim>", "retrieved": "YYYY-MM-DD"
  }]
}
```

`backend/tests/test_anchors.py` and `packages/astra-core/test/anchors.test.ts`
both pick this file up automatically once it exists — **each asserts its own
engine against it independently.** Neither engine is the other's reference in
this suite; that separation is the entire value of A3.

## 2. ΔT at 1900 and 2050 — extend `delta_t.json`

**Source:** the same NASA GSFC / EclipseWise ΔT tables already cited, or the
`Astronomical Almanac` page K9 series.

- 1900 sits in the **observed** era (telescopic/occultation-derived), so it
  carries a real published uncertainty — record it, don't assume ±0.005.
- 2050 is a **prediction**, not an observation. Its uncertainty is of order
  seconds and it will be revised. Record it with a `predicted: true` flag and
  a generous `uncertainty`, or the anchor becomes a tripwire for the
  publisher's forecast revisions rather than for our engines.

## 3. Eclipses — `eclipses.json` ✅ ACQUIRED 2026-08-15

**Done, except annular and hybrid.** Four solar and four lunar eclipses,
1919–2018, are in `eclipses.json` with their full catalog rows as citations,
and `backend/tests/test_anchors.py` asserts instant, magnitude and nature
against them. What the acquisition found, which the plan below did not
anticipate:

- The catalog's **Ecl. Mag.** is the Moon/Sun **diameter ratio** for total and
  annular eclipses — Swiss `attr[8]` ("magnitude acc. to NASA"), not `attr[0]`.
  The two differ by ~0.03 on a total eclipse.
- The catalog's **ΔT column is a prediction** after the canon's 2006
  publication (70 s printed vs 68.85 s observed at 2017), so it must not be
  used to convert. The anchors are stored in TD and the test converts the
  engine's UT answer with the engine's own `deltat()`.
- Swiss **clamps** lunar umbral magnitude at 0 where the catalog signs it
  negative, so the penumbral anchor deliberately omits that measurement.
- The lunar type key differs from the solar one on the second character —
  `+` means "central total, Moon north of the axis" for lunar, but
  "non-central, no northern limit" for solar.

**Completed later the same day** with three more solar anchors, so every
`_eclipse_nature` branch is now pinned:

- `solar-1955-12-14-annular` — `ECL_ANNULAR` (bit 8), retflag 9.
- `solar-2023-04-20-hybrid` — `ECL_ANNULAR_TOTAL` (bit 32), retflag 33. The
  trap was real but the engine is clean: `ECL_HYBRID` and `ECL_ANNULAR_TOTAL`
  are the same constant, and `_eclipse_nature` checks `ECL_TOTAL` first, so a
  hybrid that also carried bit 4 would silently report as "total". **Measured:
  Swiss returns 32 without 4.** `test_hybrid_anchor_does_not_also_carry_the_total_bit`
  pins that premise directly. 2013 Nov 03 (`H3`) behaves identically.
- `solar-1989-03-07-partial` — `ECL_PARTIAL` (bit 16), retflag 18, **and the
  anchor that makes the magnitude convention testable.** For a partial the
  catalog's magnitude is the obscured-diameter FRACTION, so `attr[8]` equals
  `attr[0]` (0.82654) rather than `attr[1]` (1.03646). Every other solar anchor
  is the ratio kind, so before this one existed a test hardcoding `attr[1]`
  passed the whole file. Hardcoding `attr[0]` is now caught on 6/7 solar
  anchors and `attr[1]` on 1/7 — the partial.

**Nothing further is required for nature coverage.** What is left is depth:
only one hybrid is stored, the set spans 1919–2023 only, and no eclipse sits
close enough to a magnitude boundary to test the threshold rather than the
ephemeris — that last one is A2's business.

<details>
<summary>Original acquisition plan (kept for the queries and the reasoning)</summary>

**Source:** Espenak's Five Millennium Canon (`eclipse.gsfc.nasa.gov/SEcat5/`),
which is independently published and not derived from Swiss Ephemeris.

Four eclipses spanning a century, recording greatest-eclipse **TD instant**,
**magnitude**, and **nature** (total / annular / hybrid / partial). Suggested
set: 1919-05-29 (the Eddington eclipse), 1970-03-07, 1999-08-11, 2017-08-21.

**Watch:** the canon publishes instants in **TD**; `eclipse_timeline` works in
UT. Convert with the ΔT anchors above and record which scale the stored value
is in. Magnitude thresholds separating partial/annular/total are a **categorical**
decision — that boundary is A2's business, and these anchors are what make
A2's thresholds mean something.

</details>

## 4. Lahiri ayanamsa at two epochs — `ayanamsa.json`

**Source:** the Indian Astronomical Ephemeris (Positional Astronomy Centre)
or a published Lahiri table — explicitly **not** Swiss Ephemeris' own
`swe_get_ayanamsa`, which would restore the circularity A3 exists to break.

Suggested epochs: 1956-01-01 (near the Lahiri zero-point definition) and
J2000.0. This anchor is what stops a sidereal-frame regression from being
invisible — and the A1 harness has already found one real bug in exactly that
frame (sidereal whole-sign cusps), which is the argument for prioritising it.

---

## Verification — what was done for the one anchor that landed

The ΔT-2000 pair was accepted because it survived three independent checks
that do not involve this repository's engines:

1. **Internal consistency.** 63.83 s → 64.09 s over 2000 is +0.26 s/yr, which
   matches the era's known drift rate.
2. **Published polynomial.** Espenak & Meeus give, for the era containing
   2000, `ΔT = 63.86 + 0.3345t − 0.060374t² + …` with `t = y − 2000`. At
   `t = 0` that is 63.86 s, consistent with a table value of 63.83 s at the
   year's start (the polynomial fits the year as a whole, not 1 Jan).
3. **Independent restatement.** Multiple sources restate ΔT(2000) ≈ 64 s.

Only then was it compared to the engine — and `swe.deltat()` returns
63.8285 s, inside the anchor's ±0.055 s window. **That comparison was the
test, not the source**: the value went into the file before the engine was
consulted, which is the ordering that keeps it an anchor.
