# Release runbook — v1.0.2 / versionCode 3

_Written 2026-08-12. The build recipe itself lives in `APK_A0_FINDINGS.md`
("To build it") and is not repeated here; this is the release-specific
wrapper: what ships, what to verify, and the order that avoids a bad
checksum going live._

---

## Why this build exists

**Every defect below is already fixed in `main` and still wrong on every
installed device.** v1.0.1 is the published APK; nothing since has reached a
phone. Two of the five are correctness bugs in the chart itself.

| # | What | Landed | Severity on device |
|---|---|---|---|
| 1 | **Sidereal whole-sign houses were wrong** — cusps shifted from the tropical frame instead of snapping to sidereal sign boundaries, leaving all twelve ~5° mid-sign | #170 | **Wrong readings.** ~1 body in 3 in the wrong house on every sidereal whole-sign chart |
| 2 | **`@astra/core` rounded half-up where Python rounds half-even** | `e9dab59` | Off-by-1e-6 on rounded fields; caught by A1 on `meta.julian_day` |
| 3 | **No way to import an entitlement key** — the APK has no address bar and `?entitlement=` was the only path | #169 | **A paying customer cannot use what they bought** |
| 4 | **A malformed unlock link killed the key field** until app restart | #172 | Dead end on the only import route |
| 5 | **Service worker retired from reader builds** (self-destroying, not merely disabled) | #168 | Installed builds can still serve a stale bundle after an update |

Plus the interactive tarot widget (#169) — presentation only, the deal is the
same parity-locked seeded draw.

**Ordering note:** #3 and #4 are the same surface. #4 was found reviewing #3
and must ship with it, or the feature that justifies this cycle has a hole in
its only path.

---

## Order of operations

The one rule: **the landing page is edited AFTER the APK is signed, never
before.** The sha256 changes on every rebuild (signing embeds timestamps), so
a checksum written from a previous build is worse than no checksum — it
teaches readers that the verification step is noise.

1. **Merge everything first.** `main` must contain #172 before the bundle is
   built. Confirm by content, not by PR state:
   ```bash
   git fetch && git switch main && git pull
   grep -q "BAD_KEY_NOTE" frontend/src/store/useStore.ts && echo "ok: #172 present"
   grep -n "versionCode" frontend/android/app/build.gradle   # -> 3
   ```
2. **Build + sign** — `APK_A0_FINDINGS.md` §"To build it", with the artifact
   named `astra-1.0.2-reader.apk`. JDK **21**, not 17, not 26.
3. **Verify the artifact** (below) — before it is uploaded anywhere.
4. **Publish the GitHub release** `v1.0.2`, APK attached.
5. **Then** edit `landing/index.html`: version heading, the pinned download
   URL, the `sha256sum` filename, and the checksum itself. All four move
   together — there are five references to `1.0.1` on that page today.
6. **Deploy the landing page** and re-verify the download link resolves and
   the printed checksum matches the served file.

---

## Verify the artifact before it ships

```bash
$BT/apksigner verify --print-certs astra-1.0.2-reader.apk
sha256sum astra-1.0.2-reader.apk
unzip -p astra-1.0.2-reader.apk AndroidManifest.xml | strings | grep -i version
```

- **Signing cert sha256 must be unchanged** from v1.0/v1.0.1:
  `c568d41d45af616f034819320640f1a7368dbdaeb04346bda72ab203b2d0a82e`.
  A different fingerprint means a different keystore, and **no installed Astra
  can ever update to it** — stop and find the original key.
- **versionCode 3.** Android refuses a downgrade; shipping 2 twice means the
  update silently never installs.
- **Reader mode is the build flag, not a runtime toggle.** Confirm the bundle
  was built with `VITE_READER_MODE=1` — `APK_A0_FINDINGS.md` records that
  checkout code is still *present* in a reader bundle and gated, so grepping
  `dist/` for `createCheckout` proves nothing either way. The guarantee is the
  flag; check the build command you actually ran.

### On the device (Pixel 10a, `adb devices`)

The two that are new this cycle and cannot be checked any other way:

1. **Paste a real key into the Library's Vault → chapter VIII → "⚿ Bring your
   key".** Bare token, then the whole unlock link. Supporter chrome should
   appear and survive a force-stop + relaunch.
2. **Paste a deliberately broken link** (`…?entitlement=abc%`). Expect the
   "didn't verify" note and a button that returns to "⚿ Import key" — this is
   #4's regression, and its whole point is that the field stays usable.
3. **Cast a sidereal whole-sign chart** and confirm the cusps sit on sign
   boundaries (0°, 30°, 60°…). On v1.0.1 they sit ~5° into each sign. This is
   the visible face of #1.
4. **Update over the top of an installed v1.0.1** rather than a clean install —
   that is the path the service-worker retirement (#5) has to survive.

---

## After the release

- `Hand_off.md` header: v1.0.1 → v1.0.2, and move the "what the next session
  does" APK bullet to done.
- M5 is unchanged and still non-code: LLC, confirm prices, live keys, one real
  purchase, cancel → `tier: free` → refund, in that order.
- The app-link (`VIEW` intent-filter + `assetlinks.json`) stays the refinement
  path. The paste field removed the urgency; it did not remove the case.
