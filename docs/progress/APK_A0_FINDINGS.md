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

> ⛔ **SUPERSEDED 2026-08-07 (same day).** The SDK was installed and **a signed
> release APK now exists.** The section is kept rather than rewritten because
> reading a stale "not done" as current is the failure this repo keeps
> producing — see `docs/audits/DATA_DISCREPANCIES.md`. Read **A1 — BUILT**
> below instead.

**No APK was produced.** This environment has `java` and `adb` but **no Android
SDK, no `sdkmanager`, and no `gradle`**, so `npx cap add android` and any real
build are impossible here. Nothing about that is a design problem; it is a
missing toolchain.

`capacitor.config.ts` is also **outside `tsconfig.json`'s `include` (`["src"]`)**,
so its `@capacitor/cli` type import is not checked and the file is not validated
until Capacitor is actually installed. Expect to fix small config-shape errors on
the first real `cap` run.

_(That last paragraph held up: the config needed no shape fixes on the first real
`cap` run.)_

## A1 — BUILT · 2026-08-07

A signed release APK exists and its reader-mode guarantee was verified **inside
the shipped artifact**, not in the source that produced it.

| | |
|---|---|
| artifact | `astra-1.0-reader.apk` · 5.3 MB · versionCode 1 / versionName 1.0 |
| sha256 | `b462f85e649a1a87b707f7ebea8fa5ab9b923b1f2ca2a7d638c7e9555d30eacd` (see note) |
| signing cert sha256 | `c568d41d45af616f034819320640f1a7368dbdaeb04346bda72ab203b2d0a82e` |
| signature schemes | v2 + v3 · RSA 4096 · 10,000-day validity |
| min / target SDK | 24 (Android 7.0) / 36 |
| permissions | `INTERNET` only |

> **The APK is not reproducible byte-for-byte.** Signing embeds timestamps, so
> rebuilding identical source yields a different sha256 — this table's value had
> to be corrected once inside the session that wrote it. Publish the checksum of
> the **exact uploaded file**, computed as the last step before release. The
> *certificate* fingerprint is stable and changes only with the key.
>
> The web bundle underneath it **is** reproducible: two reader builds an hour
> apart both emitted `index-CYz-p5vB.js`, which is what makes the `var ml=!0`
> check below meaningful.

**Verified in the signed APK** (unzipped it and looked, rather than trusting the
build):

- `var ml=!0` — the inlined `READER_MODE` constant is **on**. The two builds
  differ in exactly that one byte-level constant, confirmed by building both and
  diffing; with it true, `cards` is `[]`, so no buy button renders at all and
  `buy()` early-returns.
- The engine really is inside: `swisseph.wasm` (402 KB), `seas_18.se1` (218 KB),
  `cities.json` (3.0 MB), `land.json` (86 KB).
- No `server.url` in the packaged `capacitor.config.json`.
- Not `debuggable`.

**A latent bug this found — and the wrong fix, recorded because it was nearly
shipped.** `PURCHASE_URL` is `https://astra-arcana.com/#support`, and the
landing page's only anchor was `#pricing`. That looks like a dead link, and the
first fix was to repoint the APK at `#pricing`.

**That fix was wrong.** `App.tsx` routes `#support` to the Support panel — the
actual buy surface — so under today's `nginx.conf`, which serves the *app* at
`/`, the original URL was already correct. The link's correctness depends
entirely on the **undecided M4 deploy layout**:

| layout | `#support` | `#pricing` |
|---|---|---|
| app at `/` (today's nginx) | ✅ opens Support panel | ❌ nothing |
| landing at `/` (page's own assumption) | ❌ was nothing | ✅ pricing section |

So neither anchor was safe on its own, and an APK is the one artifact you cannot
quietly re-point after distribution. **Resolved by making `#support` valid in
both layouts**: `PURCHASE_URL` stays `#support`, and `landing/index.html` gained
an `id="support"` anchor on its pricing section. Each side carries a comment
naming the other.

The general lesson: nothing in this stack checks an anchor at build time, and a
cross-artifact link whose validity depends on an unmade decision is a coin flip
baked into a signed binary.

### ⚠️ The JDK is not a free choice — it must be 21

This cost two failed builds and is not discoverable from any error message:

- **JDK 17 fails** — Capacitor 8's `capacitor-android` compiles at
  `sourceCompatibility 21`, so javac 17 dies with `invalid source release: 21`.
- **JDK 26 fails differently, and misleadingly** — Gradle 8.14.3 *runs* fine on
  it, then AGP 8.13's `JdkImageTransform` fails running `jlink` against
  `android-36/core-for-system-modules.jar`. The error names `jlink`, not the JDK
  version, so it reads like a corrupt SDK rather than a too-new JDK.
- **JDK 21 works.** This machine has 17 and 26 from the distro, so a Temurin 21
  was unpacked to `~/.jdks/jdk-21.0.12+8` and is passed per-build as `JAVA_HOME`.
  Nothing system-wide was changed and `archlinux-java` still reports 17 default.

AGP also auto-downloaded `platforms/android-36` and `build-tools/35.0.0` on the
first run, so the SDK only needs bootstrapping, not pinning.

## To build it

```bash
export JAVA_HOME=$HOME/.jdks/jdk-21.0.12+8      # 21. Not 17, not 26. See above.

cd frontend
VITE_READER_MODE=1 \
  VITE_API_BASE=https://app.astra-arcana.com/api/v1 \
  npm run build                                  # reader build — the flag IS the guarantee
npx cap sync android

cd android && ./gradlew assembleRelease

# sign (keystore lives OUTSIDE the repo, at ~/.astra-signing/)
BT=$HOME/Android/Sdk/build-tools/35.0.0
export ASTRA_KS_PW="$(cat $HOME/.astra-signing/keystore-password.txt)"
cd app/build/outputs/apk/release
$BT/zipalign -p -f 4 app-release-unsigned.apk aligned.apk
$BT/apksigner sign --ks $HOME/.astra-signing/astra-release.keystore \
  --ks-key-alias astra --ks-pass env:ASTRA_KS_PW --key-pass env:ASTRA_KS_PW \
  --out astra-1.0-reader.apk aligned.apk
$BT/apksigner verify --print-certs astra-1.0-reader.apk
```

`apksigner`'s `--ks-pass file:` reads **one line per reference**, so pointing
both `--ks-pass` and `--key-pass` at the same file makes the second read hit EOF
(`end of file reached`). Use `env:` for both, as above.

### The signing key

`~/.astra-signing/astra-release.keystore`, alias `astra`, mode 600, outside every
git repo. **It is the app's permanent identity: lose it and no future build can
ever update an installed Astra.** Back up the keystore *and*
`keystore-password.txt` somewhere that survives this machine dying.

`frontend/android/.gitignore` ships the `*.jks` / `*.keystore` rules **commented
out** by Capacitor default; they are uncommented here. That is defence in depth,
not the defence — the key is never in the tree to begin with.

## A1 CLOSED on hardware — 2026-08-11, Pixel 10a (Android 17 / SDK 37)

Installed, launched, and cold-started in **airplane mode**: the chart computed
live on the device (clock advanced 4:23 → 4:24 and the Moon moved with it), so
the on-device engine is real. Two defects only hardware could have shown:

**1. The masthead pills rendered UNDER the status bar.** `theme.css` pads
`.app` with `env(safe-area-inset-*)` and `index.html` sets `viewport-fit=cover`,
which is what makes iOS correct — and on Android does nothing, because the
WebView populates `env(safe-area-inset-*)` from **display cutouts, not the
status bar**. The top inset resolved to 0. No CSS change could have fixed it;
`MainActivity` now consumes `systemBars() | displayCutout()` and pads the
content view, which fixes the gesture-bar edge for free.

**2. The APK could never reach the backend.** `API_BASE` was the relative
`/api/v1`, and Capacitor serves the bundle from its own `https://localhost`
origin, so every API call hit a server that does not exist. The failure was
invisible in the good case — charts still appeared, computed on-device — and
fatal in the paid one: written readings, narrated voice and the daily transit
are all backend work, so an imported entitlement bought almost nothing while
the home screen said "the unlock is for the written work". `VITE_API_BASE` now
makes the native build absolute. **The server's `AAE_CORS` must include
`https://localhost`** or the calls fail CORS and silently fall back.

Verified by the server's own access log after a clean launch:
`/api/v1/generate-chart`, `/api/v1/entitlement`, `/api/v1/tts/voices`.

### Gotcha: the service worker outlives the APK update

`adb install -r` replaces the assets, but the WebView's service-worker cache
persists in app storage — the rebuilt app kept serving the OLD bundle until
`pm clear`. A real user updating the APK may get the previous bundle until the
worker updates itself. **The PWA service worker is arguably redundant inside
the APK** (the assets are already local and the shell is offline-first by
construction); disabling it for reader builds would remove the staleness risk
entirely. Not done — flagged.

## Superseded: "Still needs a real device" — A1 is not closed

A1's exit criteria are *installs, casts offline, imports an entitlement*. Only
what a build machine can prove is proven. `adb devices` is empty, so these three
remain, and they are the operator's:

1. **Airplane mode, first run** — a chart casts with no network. If it doesn't,
   the precache glob or the WASM assets did not survive packaging.
2. **No reachable card rail** — the strings are present in the bundle (see the
   withdrawn claim above); what must be true is that no card rail *renders*.
   Verified statically here; confirm it by looking at the running app.
3. **Entitlement import** — paste a token minted on the web and confirm the tier
   unlocks. This is the entire reader-mode premise and nothing else tests it.

`adb install app/build/outputs/apk/release/astra-1.0-reader.apk`

## Next

`A2` (direct download + F-Droid) is unblocked by the A0 decision above, and its
**download half is now written**: `landing/index.html` §`#android` carries the
real filename, size, sha256 and signing-certificate fingerprint, plus the verify
step. Two things gate it going live, both recorded in that file's comments:

1. **The GitHub release does not exist yet**, so the download button currently
   points at an empty releases page. Publish the release, or the page ships the
   same class of dead link this session just fixed in the APK.
2. **The deploy layout is unresolved.** `landing/index.html` assumes it lives at
   `/` with the app at `/app/`; `frontend/nginx.conf` serves the app at `/`. The
   four `/legal/*.html` footer links are already correct; `/app/` is broken in
   every layout until nginx gains a location for it. That is M4 work.

If the APK is ever rebuilt, **regenerate the checksum and fingerprint on that
page in the same commit** — a stale checksum fails verification on a genuine
file, which is worse than publishing no checksum at all.

Do **not** start `A3` (Play) until A2 produces evidence that anyone wants the APK.
