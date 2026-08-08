# A0 — the F-Droid build-from-source question, answered

_Researched 2026-08-07. A0 was the stated blocker on the whole cheap
distribution branch (`APK_I18N_ROADMAP.md` Track A). It is **resolved**: F-Droid
is viable, by one of two paths, and neither requires abandoning the WASM engine._

## The question

This repository ships two committed binaries that an F-Droid build server cannot
reproduce from our source:

| file | size | what it is |
|---|---|---|
| `packages/astra-core/src/vendor/swisseph/swisseph.wasm` | 402 KB | Swiss Ephemeris 2.10.03 C core, compiled to WebAssembly |
| `packages/astra-core/src/vendor/swisseph/seas_18.se1` | 218 KB | Swiss asteroid ephemeris 1800–2400 (data) |

F-Droid builds every app from source on its own infrastructure to prove the
distributed binary matches the source. The question was whether these two files
disqualify us.

## Findings

**1. The scanner flags `.wasm` explicitly.** `fdroid scanner` treats WebAssembly
binaries as a flagged artifact class, so `swisseph.wasm` *will* be caught. This
is not a maybe.

**2. But prebuilt FLOSS binaries from Node.js are on the accepted list.** The
Inclusion Policy requires binary dependencies to "originate either from source
compilation or Debian repository downloads", and separately accepts prebuilt
FLOSS binaries from a named set of trusted ecosystems — PyPI wheels, Nix cache,
Rust/rustup, Go, **and Node.js** — plus compilers and build tools not packaged in
Debian.

**This is the door.** Our `.wasm` is not a mystery blob: it comes from the
published npm package **`@swisseph/browser` v1.1.1**, which is **AGPL-3.0** with
public source at `github.com/swisseph-js/swisseph`. This repository is AGPL-3.0
itself, so the licences are compatible and the provenance is already documented
in the vendor `README.md`.

**3. `seas_18.se1` is data, not code.** The policy separates executable binaries
from "non-functional assets", which need only a valid licence. An ephemeris table
is a data file in exactly that sense. Lower risk than the `.wasm`, and it should
be argued as an asset, not defended as a binary.

**4. `scanignore` is the sanctioned escape hatch** for paths that must be
excluded from the scan — F-Droid's own docs say it should be used "only where
there is a very good reason", which is a bar this case can actually meet if the
build fetches from npm rather than committing the artifact.

## The three options, ranked

### Option 1 — fetch from npm at build time, `scanignore` the path _(recommended)_

Stop committing `swisseph.wasm`; take it from the `@swisseph/browser` npm
tarball during the build, and `scanignore` that path. This lands squarely inside
the "prebuilt FLOSS from Node.js" allowance, keeps the full 17-body engine, and
needs no emscripten on the build server.

**Cost:** the vendor `README.md` records *why* the package was vendored — the
published high-level wrapper is broken (an esbuild pass mangled an import into
`(void 0)`), and its `exports` map hides the working low-level glue. So the build
step must extract the glue + `.wasm` from the tarball rather than `import` the
package normally. That is a build script, not a redesign, and the vendor README
already documents exactly which files matter.

### Option 2 — compile Swiss Ephemeris from source on the build server

The purest answer, and the expensive one: emscripten in an F-Droid build, plus
reproducibility of the emscripten output. Only worth attempting if Option 1 is
rejected in review.

### Option 3 — ship F-Droid without the WASM engine

`astronomy-engine` (pure TS, already a dependency) covers the chart. Per the
vendor README, **the only body that actually needs `seas_18.se1` is Chiron** —
everything else falls back to the built-in Moshier model, bit-identical to
pyswisseph's Moshier mode.

So the honest fallback costs **one body on the F-Droid build only**, and the
parity tests already pin what that path produces. This is a genuinely acceptable
degradation, which is what makes A0 unblocked rather than merely researched: even
the worst case ships.

## Decision

**Proceed on Option 1**, with Option 3 as the fallback if review objects. Neither
requires a redesign, and A0 no longer blocks A1.

Expect a `NonFreeNet` anti-feature flag regardless, for the optional Stripe and
AI paths — that is a label, not a rejection, and the listing copy should own it
plainly rather than let a reviewer discover it.

## Sources

- [F-Droid Inclusion Policy](https://f-droid.org/en/docs/Inclusion_Policy/)
- [F-Droid Build Metadata Reference](https://f-droid.org/docs/Build_Metadata_Reference/) (`scanignore`)
- [F-Droid Building Applications](https://f-droid.org/docs/Building_Applications/)
- `packages/astra-core/src/vendor/swisseph/README.md` (our own provenance record)

---

# A1 — shell scaffolding: what landed, and what is still needed

## Landed

- **`frontend/capacitor.config.ts`** — Android-only, `webDir: "dist"`, assets
  bundled in the APK with **no `server.url`**. That omission is load-bearing: a
  shell that could load a remote bundle could be given a purchase UI after
  review, so the absence of the capability is the guarantee.
- **`frontend/src/lib/readerMode.ts`** — build-time `VITE_READER_MODE`. Parsing
  is deliberately asymmetric: unset/empty/`0`/`false` mean **selling** (the web
  default, so a CI job that forgets the flag ships a working website), while any
  unrecognised value means **reader** (a store rejection costs more than a lost
  sale). Four unit tests pin exactly that.
- **`PricingPanel`** offers no card rail under reader mode regardless of what
  `GET /api/pricing` reports, and shows a signpost to the web instead.

## ⚠️ A claim that was measured and withdrawn

An earlier draft of this work asserted that Vite's dead-code elimination removes
the checkout path from a reader build. **It does not.** Building with
`VITE_READER_MODE=1` and grepping `dist/` still finds `createCheckout` and the
`Unlock with card` label — the constant is inlined, but the component's JSX keeps
the import alive.

The honest guarantee is therefore **"no purchase UI is reachable, and no billing
SDK is bundled"** (the rail is a redirect to a URL the server returns), *not*
"the bytes are absent". Do not give a store reviewer the stronger version.

Making the stronger claim true needs a separate entry point or a dynamic import
for the purchase surface. Worth doing if a reviewer asks; not worth pre-building
on a guess.

## Not done — and why

**No APK was produced.** This environment has `java` and `adb` but **no Android
SDK, no `sdkmanager`, and no `gradle`**, so `npx cap add android` and any real
build are impossible here. Nothing about that is a design problem; it is a
missing toolchain.

`capacitor.config.ts` is also **outside `tsconfig.json`'s `include` (`["src"]`)**,
so its `@capacitor/cli` type import is not checked and the file is not validated
until Capacitor is actually installed. Expect to fix small config-shape errors on
the first real `cap` run.

## To build it, on a machine with the SDK

```bash
# 1. Toolchain (once): JDK 21 + Android SDK (cmdline-tools, platform 34, build-tools)
#    export ANDROID_HOME=$HOME/Android/Sdk

# 2. Capacitor
cd frontend
npm i -D @capacitor/cli && npm i @capacitor/core @capacitor/android

# 3. Reader build + native project
VITE_READER_MODE=1 npm run build
npx cap add android
npx cap sync android

# 4. APK
cd android && ./gradlew assembleRelease
```

Then verify, before signing anything:

1. **Airplane mode, first run** — a chart casts with no network. If it doesn't,
   the precache glob or the WASM assets did not make it into the APK.
2. **Grep the built assets for a reachable purchase surface** — the strings are
   present (see above); what must be true is that no card rail *renders*.
3. **Entitlement import** — paste a token minted on the web and confirm the tier
   unlocks, since that is the entire reader-mode premise.

## Next

`A2` (direct download + F-Droid) is unblocked by the A0 decision above. Do **not**
start `A3` (Play) until A2 produces evidence that anyone wants the APK.
