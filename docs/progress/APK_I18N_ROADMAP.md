# APK + translation — development roadmap

_Drafted 2026-08-07 at the operator's request. **PROPOSED, NOT RATIFIED.** It
inherits that status from `MOBILE_ROADMAP.md` §4.2.2, which it continues._

Two tracks, deliberately in one document because they collide exactly once (an
APK's store listing is the first thing that needs translating, and the first
thing a reviewer reads). Otherwise they are independent and can run in either
order — or only one.

**Read first:** `MOBILE_ROADMAP.md` §4.2.1 (the H2 entry survey) and §4.2.2 (the
staged path). This does not restate them; it picks up where they stop.

---

## Status change since §4.2.2 was written

§4.2.2's proposed sequence had **step 1 = "do the 'regardless' work now"**:
bundle an offline city gazetteer and retire the Nominatim + CARTO calls.

> **Step 1 is DONE** (GAZ-1..GAZ-5, 2026-08-07). The birthplace never leaves the
> device, `no-external.spec.ts` is green with an empty ledger, and the two
> per-device third-party usage-policy exposures that §4.2.1 flagged as
> *landmine 2* are gone.

That matters for this roadmap beyond privacy: it removes the **two third-party
terms-of-service dependencies** that would each have needed re-checking at store
entry, and it deletes a class of review question ("what does this app send, and
to whom?") from every channel simultaneously.

**Step 0 remains open and still gates the cheapest branch.** See A0 below.

---

# Track A — the APK

**Standing decisions inherited, not reopened here:** iOS is closed (AGPL is what
closes Apple *and* what qualifies F-Droid — §4.2.1). One Capacitor artifact,
three destinations. Reader-mode is the highest-leverage single choice because it
is channel-agnostic.

## A0 — Resolve the build-from-source question · **BLOCKER, do first** · S

F-Droid builds everything from source on its own infrastructure. This repository
ships **two committed binaries** that a build server cannot reproduce:

| file | size | what it is |
|---|---|---|
| `packages/astra-core/src/vendor/swisseph/swisseph.wasm` | 404 KB | Swiss Ephemeris compiled to WASM |
| `packages/astra-core/src/vendor/swisseph/seas_18.se1` | 220 KB | ephemeris data file |

A prebuilt `.wasm` with no reproducible build recipe is a standard F-Droid
rejection. `.se1` is *data*, not code, and is likely fine — but "likely" is the
word this task exists to remove.

**Done when:** a written answer, with a citation to F-Droid's current inclusion
policy, to each of:
1. Does the `.wasm` need a reproducible build recipe, or does a documented
   upstream provenance + checksum satisfy them?
2. Is `seas_18.se1` treated as data (acceptable) or as a binary blob?
3. If a recipe is required, is emscripten-building Swiss Ephemeris in their
   buildserver tractable — or is the fallback to **ship the APK without the WASM
   engine** and fall back to the pure-TS `astronomy-engine` path, accepting the
   reduced body set on F-Droid only?

**Why first:** every estimate below is speculative until this is answered, and
the answer can invalidate the whole cheap branch. Do not start A1 before it.

## A1 — Capacitor shell, reader-mode by default · M

One artifact. Reader-mode means: all free/deterministic features work; premium
tiers are **imported**, never sold in-app.

- `mobile/` workspace, Capacitor wrapping the existing PWA build. No second
  codebase, no second engine — the app already runs offline on-device.
- **Reader-mode entitlement import** via file or QR, using the Ed25519 spike
  (§7.5, already done). Unlock happens on the web; the APK only *verifies*.
- Share-sheet PDF export replacing the print-dialog path (§4.1 H2).
- **No billing SDK in the artifact at all.** This is what makes one build satisfy
  Play, F-Droid and direct download at once.

**Done when:** a signed APK installs on a real device, casts a chart offline in
airplane mode, and imports an entitlement issued by the web app.

## A2 — FOSS channels first: direct download + F-Droid · M

Zero new agreements. This is how we *learn* whether "other people's phones" is
real rather than assuming it.

- Direct download from the site, with checksums and a documented verify step.
- F-Droid submission, contingent on A0.
- Expect `NonFreeNet` anti-feature flags for the optional Stripe/AI paths.
  That is a label, not a rejection — but the listing copy should own it plainly
  rather than let a reviewer discover it.

**Done when:** an APK is installable from at least one channel by someone who is
not the operator, and the install path is documented.

## A3 — Play, only if A2 shows demand · M, mostly paperwork

Deferred on purpose. Reader-mode already satisfies the billing policy by this
point, so entry collapses to: $25 DDA, IARC rating, data-safety declaration,
AI-content disclosure. **Do not start this before A2 produces evidence.**

## A4 — Never: the commercial-relicence branch

Recorded so it stays closed. It costs money, reverses the licence stance,
forfeits F-Droid eligibility, and buys access to users who already have the PWA.

---

# Track B — translation / language

**Nothing exists yet.** No i18n library, no locale files, no `lang` switching;
every string is hardcoded English. This is greenfield, which is good news —
nothing has to be un-picked.

## B0 — The finding that shapes the whole track · measured 2026-08-07

Astra has **two translation problems, not one**, and conflating them is how this
work goes wrong:

| | volume | character |
|---|---|---|
| **UI chrome** — buttons, labels, errors, form copy | ~2,475 short strings in `frontend/src/components/` | Mechanical. Ordinary i18n. Machine translation + review is fine. |
| **Interpretive corpus** — the readings themselves | **~16,400 words** (~8,500 in `frontend/src/lib/`: glossary, numerology, archetypes, tarot copy; ~7,900 in `backend/*.py`, mostly `tarot_data.py`) | Literary, and **voice-critical** |

The corpus is the product. It carries the voice canon — *"nothing Astra produces
is a life sentence, it is a life poem"* — and the copy test that governs it
(*does this line open a door or close one?*) is not a property machine
translation preserves. A mechanically translated glossary would be
grammatically fine and tonally dead.

**Therefore: these ship on different tracks, with different quality bars, and
the UI can be translated long before the corpus is.**

## B1 — Extraction + the seam · M

- Adopt a lightweight runtime. **Prefer no new dependency** if a ~100-line
  `t()` over typed message maps suffices — it matches `@astra/core`'s posture
  and the gazetteer's (GAZ-2 shipped search with zero new runtime deps).
- Extract UI chrome first. Leave `lib/glossary.ts`, `lib/numerology.ts`,
  `lib/archetypes.ts` and `backend/tarot_data.py` **in place** for now, behind
  the same seam, so B2 is a content project and not a refactor.
- Locale negotiation: `navigator.languages`, an explicit override persisted in
  the vault, and `<html lang>` set from it.
- **Offline invariant:** locale bundles are precached like the gazetteer. A
  language that needs the network to load is a language that vanishes in
  airplane mode.

**Done when:** the app renders end-to-end in a pseudo-locale (`en-XA`,
accented + padded) with no untranslated strings visible and no layout breakage.
A pseudo-locale finds the two failure modes real translation would — missed
strings and text expansion — without a translator.

## B2 — The first real locale · L

Pick **one** language and do it completely rather than three partially. The
corpus is the long pole and needs a human who can hold the voice.

- UI chrome: translate + review.
- Corpus: translate as **authorship**, not conversion. Budget it as writing.
- **Astrological terminology needs a glossary decision per language** before any
  prose: sign, house and aspect names are often Latin-derived and sometimes
  conventionally untranslated. Decide once, record it, then translate against it.
- Determinism check: **translation must not touch the engine.** Seeds, draws and
  chart math are language-independent, and a parity test should prove a locale
  switch changes no computed value.

**Done when:** one locale is complete enough that a native speaker uses it by
preference, and the parity test above is green.

## B3 — RTL, only when a RTL locale is actually scheduled · M

Arabic/Hebrew need bidirectional layout, mirrored chart-wheel chrome, and a font
stack the vendored Garamonds do not cover. Real work, and pure speculation until
B2 proves the pipeline. **Do not pre-build it.**

## B4 — What translation must NOT do

- **Not the AI-generated readings.** Those are produced per-request; the language
  belongs in the prompt, not in a message catalogue.
- **Not the disclaimer, without legal review.** It is a safety surface that
  travels with the data (a field on every response), not UI text.
- **Not the legal pages**, unless the operator wants per-jurisdiction versions —
  which is a legal decision with a cost, not a translation task.

---

## Sequencing, if both tracks run

```
A0 (blocker, small)  ─┬─>  A1 shell  ──>  A2 FOSS channels  ──>  A3 Play (only on evidence)
                      │
B1 seam (independent) ─┴─>  B2 first locale  ──>  B3 RTL (only if scheduled)
```

**The one real coupling:** A2's store listing is the first user-facing text that
wants translating, and F-Droid listings are per-locale. If both tracks are live,
do **B1 before A2** so the listing is not the one string table nobody extracted.

**Recommended if only one runs:** `A0` regardless — it is small, it is a
blocker, and its answer is durable knowledge whether or not H2 ever wakes.

## Explicitly not scheduled

Both tracks stay **parked** behind the existing wake condition. Nothing here
commits to building an APK or shipping a locale; it makes both cheaper to start
and records what was measured so the next session does not re-derive it.
