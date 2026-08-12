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

## 3. Eclipses — `eclipses.json`

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
