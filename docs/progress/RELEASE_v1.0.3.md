# Release runbook — v1.0.3 / versionCode 3

_Written 2026-08-12. The build recipe itself lives in `APK_A0_FINDINGS.md`
("To build it") and is not repeated here; this is the release-specific
wrapper: what ships, what to verify, and the order that avoids a bad
checksum going live._

**Why 1.0.3 and not 1.0.2.** This cycle was scoped as v1.0.2 — five fixes, no
new surface. Session 26's daily-oracle work then merged to `main` before the
build was cut, so the binary carries a whole feature set as well. The version
name follows what is actually in the artifact rather than what was planned;
`versionCode` was already 3 and stays 3 (v1.0.1 was 2), so nothing about the
upgrade path changes.

---

## Part 1 — the defects this build carries off installed devices

**Every one was already fixed in `main` and still wrong on every phone.**
v1.0.1 is the published APK; nothing since had reached a device. Two are
correctness bugs in the chart itself.

| # | What | Landed | Severity on device |
|---|---|---|---|
| 1 | **Sidereal whole-sign houses were wrong** — cusps shifted from the tropical frame instead of snapping to sidereal sign boundaries, leaving all twelve ~5° mid-sign | #170 | **Wrong readings.** ~1 body in 3 in the wrong house on every sidereal whole-sign chart |
| 2 | **`@astra/core` rounded half-up where Python rounds half-even** | `e9dab59` | Off-by-1e-6 on rounded fields; caught by A1 on `meta.julian_day` |
| 3 | **No way to import an entitlement key** — the APK has no address bar and `?entitlement=` was the only path | #169 | **A paying customer cannot use what they bought** |
| 4 | **A malformed unlock link killed the key field** until app restart | #172 | Dead end on the only import route |
| 5 | **Service worker retired from reader builds** (self-destroying, not merely disabled) | #168 | Installed builds can serve a stale bundle after an update |
| 6 | **The app icon was the stock Capacitor logo** — a blue X on white | #176 | Astra's face on the home screen and in the notification shade belonged to a framework template |

\#3 and #4 are the same surface: #4 was found reviewing #3, and shipping #3
without it leaves the feature that justifies this cycle with a hole in its
only path.

## Part 2 — what is new in this build

| What | Landed |
|---|---|
| **Today's card** on the Reading chapter — the daily draw, on-device | session 26 |
| **Daily notification** at a chosen time (default 8am, opt-in) | session 26 |
| **Home-screen widget** — the chart wheel with the day's card beneath it | session 26 |
| Interactive tarot draw (face-down, tap to turn) | #169 |

All three new surfaces read the same precomputed draw (`dailyOracle.ts`), which
is a pure function of (chart, date). Nothing is fetched, no push service is
involved, and no birth data leaves the device for any of it.

---

## Order of operations

The one rule: **the landing page is edited AFTER the APK is signed, never
before.** The sha256 changes on every rebuild (signing embeds timestamps), so a
checksum written from a previous build is worse than no checksum — it teaches
readers that the verification step is noise.

1. **Merge everything first**, then confirm by content rather than PR state:
   ```bash
   git fetch && git switch main && git pull
   grep -q "BAD_KEY_NOTE" frontend/src/store/useStore.ts        && echo "ok: #172"
   grep -q "1.0.3" frontend/android/app/build.gradle            && echo "ok: version"
   ls frontend/src/lib/dailyOracle.ts                           && echo "ok: session 26"
   ls frontend/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_monochrome.png && echo "ok: icon"
   ```
2. **Build + sign** — `APK_A0_FINDINGS.md` §"To build it", artifact named
   `astra-1.0.3-reader.apk`. JDK **21**, not 17, not 26.
3. **Verify the artifact** (below) — before it is uploaded anywhere.
4. **Publish the GitHub release** `v1.0.3`, APK attached.
5. **Then** edit `landing/index.html`: version heading, the pinned download
   URL, the `sha256sum` filename, and the checksum itself. All four move
   together — there are five references to the old version on that page.
6. **Deploy the landing page** and re-verify the download link resolves and the
   printed checksum matches the served file.

---

## Verify the artifact before it ships

```bash
$BT/apksigner verify --print-certs astra-1.0.3-reader.apk
sha256sum astra-1.0.3-reader.apk
```

- **Signing cert sha256 must be unchanged** from v1.0/v1.0.1:
  `c568d41d45af616f034819320640f1a7368dbdaeb04346bda72ab203b2d0a82e`.
  A different fingerprint means a different keystore, and **no installed Astra
  can ever update to it** — stop and find the original key.
- **versionCode 3.** Android refuses a downgrade; shipping 2 twice means the
  update silently never installs.
- **Reader mode is the build flag, not a runtime toggle.** Confirm the bundle
  was built with `VITE_READER_MODE=1`. `APK_A0_FINDINGS.md` records that
  checkout code is still *present* in a reader bundle and gated, so grepping
  `dist/` proves nothing either way — the guarantee is the flag you passed.

### On the device (Pixel 10a, `adb devices`)

Verified during session 26 on a `.dev`-suffixed build; repeat against the
signed artifact:

1. **Paste a real key** into the Library's Vault → chapter VIII → "⚿ Bring your
   key". Bare token, then the whole unlock link. Supporter chrome should
   appear and survive a force-stop + relaunch.
2. **Paste a deliberately broken link** (`…?entitlement=abc%`). Expect the
   "didn't verify" note and a button that returns to "⚿ Import key" — this is
   #4's regression, and its whole point is that the field stays usable.
3. **Cast a sidereal whole-sign chart** and confirm the cusps sit on sign
   boundaries (0°, 30°, 60°…). On v1.0.1 they sit ~5° into each sign.
4. **Update over an installed v1.0.1** rather than a clean install — that is
   the path the service-worker retirement (#5) has to survive.
5. **Add the home-screen widget** and confirm it draws the wheel and the day's
   card. It only refreshes while the app runs; that is by design.
6. **Enable the daily notification**, set a near time, and confirm it arrives
   with the card's name. Note the delivery window below.

---

## Known and accepted

- **The daily notification fires within a one-hour window**, not on the minute.
  Android grants exact alarms only to apps holding a restricted permission
  (`USE_EXACT_ALARM`), which Play limits to alarm-clock and calendar apps;
  Astra would not qualify and should not ask. `dumpsys alarm` shows
  `window=+1h0m0s0ms`. For a daily card this is the right trade, but the UI
  should not imply to-the-minute precision.
- **The widget only updates when the app runs.** `updatePeriodMillis` is 0 on
  purpose: the wheel and caption can only change when the app rasterises them,
  and a timed wake would spend battery redrawing identical pixels.
- **The app icon is PNG, not a VectorDrawable.** The vector compiled and then
  failed to inflate on device, dropping the whole adaptive icon to Android's
  robot placeholder with nothing in logcat naming it. See #176.

## After the release

- `Hand_off.md` header: v1.0.1 → v1.0.3, and move the APK bullet to done.
- M5 is unchanged and still non-code: LLC, confirm prices, live keys, one real
  purchase, cancel → `tier: free` → refund, in that order.
- The app-link (`VIEW` intent-filter + `assetlinks.json`) stays the refinement
  path. The paste field removed the urgency; it did not remove the case.
