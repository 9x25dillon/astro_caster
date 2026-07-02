# Testing Guide — UI walkthrough & tier verification

How to exercise everything in the app by hand, and how to prove all the tier
gates work without spending a cent. Three tools:

| Tool | What it does |
|---|---|
| `backend/tools/smoke_tiers.py` | Automated tier × endpoint gate matrix against the running server (26 checks) |
| `backend/tools/mint_test_tokens.py` | Mints valid supporter/oracle tokens + PDF-2 claims for the browser |
| This file, §4 | Manual UI walkthrough checklist per tier |

---

## 1. Start the app

```bash
./run.sh          # backend :8787 + frontend :5173
```

- UI → http://127.0.0.1:5173 · API docs → http://127.0.0.1:8787/docs
- Local reality check: `AAE_ENV=development` (run.sh), **trust mode OFF**, no
  `AAE_ETH_RPC`, no `AAE_ANTHROPIC_API_KEY` → donate/purchase rails fail
  closed (correct behavior), and Oracle/Personal reports compile in the
  **deterministic offline** mode — free to test end-to-end.

## 2. Become any tier in the browser

```bash
cd backend && .venv/bin/python tools/mint_test_tokens.py
```

Paste into the devtools console at :5173, then reload:

| Tier | Setup |
|---|---|
| **free** | `localStorage.removeItem("aae.entitlement")` |
| **supporter** | `localStorage.setItem("aae.entitlement", "<SUPPORTER token>")` |
| **oracle** | `localStorage.setItem("aae.entitlement", "<ORACLE token>")` |
| **oracle + dev bypass** | set the `AAE_DEV_TOKEN` value from `backend/.env` — grants oracle AND skips the PDF-2 purchase gate |

To unlock a deluxe edition without the purchase rail, grab the seed shown in
the Oracle Report panel and run
`mint_test_tokens.py --seed <seed>` — it prints a console snippet that drops
the claim into `aae.report_tokens` where the UI looks for it.

> Startup validation clears expired/invalid tokens automatically, so a wrong
> paste just lands you back on free tier.

## 3. Automated tier matrix

```bash
cd backend
.venv/bin/python tools/smoke_tiers.py           # 24 gate checks, zero AI spend
.venv/bin/python tools/smoke_tiers.py --full    # + Oracle → claim → deluxe compile
```

The default run proves every gate **before** any AI/RPC work happens (free
even with API keys configured). `--full` actually compiles — free offline
locally; **costs real money** if `AAE_ANTHROPIC_API_KEY` is set. If you see
429s, the rate limiter is on: `AAE_RATE_LIMIT_ENABLED=0`.

## 4. Manual UI walkthrough

Run each block once as **free**, once as **supporter**, once as **oracle**
(the third column says where behavior should differ).

### Core chart (all tiers identical)

- [ ] Cast a chart (birth form) — wheel renders, no console errors
- [ ] Hover planet / sign / house / aspect — popover appears; houses hit-test on the wedge
  - supporter+: popover shows the personal insert line (planets-in-sign / house tenants / orb+applying)
- [ ] Transits layer on — annulus ring has no 12-o'clock seam; "natal / sky [date]" labels near Asc
- [ ] Transit slider moves the sky; transit-to-natal chords highlight on hover
- [ ] ProfileManager: double-click a profile name → inline rename (Enter/Escape/blur)
- [ ] CeremonyModal: opens with lat/lng/tz pre-filled from geolocation

### Ask Astra & TTS

- [ ] Quick ask works on every tier (offline/ollama fallback is honest about its source)
- [ ] Deep ask as **free** → support modal opens (402 path), no raw error string
- [ ] Deep ask as **supporter** → answer arrives (Sonnet via OpenRouter, or fallback)
- [ ] Speak button as **free** → 402 → support flow · as **supporter** → Lily voice, long text stitches seamlessly

### Forecast panel (☌)

- [ ] Events grouped by month; Moon events present (~18/week); expandable meanings
- [ ] Click event → transit slider jumps to that date
- [ ] Text filter, ★ bookmarks (persist across reload), ↓ .txt and ↓ .ics export
- [ ] "✦ Ask" as free → gold toast then support modal

### Arcana (✶) — free surfaces

- [ ] **Natal** tab: signature loads; changing the chart resets it
- [ ] **Draw** tab: deterministic reading; same question+spread ⇒ same cards; AI toggle as free → support modal
- [ ] **Transit** tab: daily cards; ✦ Rituals / ✎ Journal .ics export
- [ ] **Classroom** and **Studio** (deck-art prompts) work with no token

### Oracle Report (oracle tier)

- [ ] As free/supporter: "Oracle Report" → support modal (402), message names oracle tier
- [ ] As oracle: report compiles; badge honestly says **Deterministic offline edition** (no Anthropic key locally) or the model name
- [ ] Seed shown; identical chart+spread+question reproduces the identical report

### Deluxe Personal Report (PDF-2/3/4 — oracle tier + separate purchase)

- [ ] As oracle **without** a claim: deluxe block shows the **purchase rail** (tx input + "✧ Verify deluxe purchase"), not the compile button
- [ ] "already unlocked? compile" as plain oracle → error banner naming the separate purchase (NOT the support modal)
- [ ] Same click with the **dev token** → compiles (operator bypass)
- [ ] Verify purchase with trust mode OFF (local default) → "Purchase not verified — …" (fail closed ✓)
- [ ] Full rail: restart with `AAE_TRUST_MODE=1 ./run.sh`, paste any non-empty tx hash → "✓ deluxe purchase verified"; **or** skip the rail via `mint_test_tokens.py --seed <seed>`
- [ ] Compile → 11-part accordion preview; ⎙ print (styled PDF, sigil + birth info filled **locally**), ↓ .md, copy
- [ ] 🔊 audio companion narrates Synthesis + Practices (PDF-3); ■ stop works
- [ ] Reload page, re-run the SAME oracle question → claim restored from localStorage, compile still available (deterministic seed)
- [ ] Change the chart after an Oracle run, then compile → "session no longer matches" (409 path)

### Support modal (♥)

- [ ] Treasury address + funding split render
- [ ] Verify with a junk tx hash → rejected (trust mode off locally — honest fail-closed message)

### Admin

- [ ] `GET :8787/api/admin/stats?token=<AAE_DEV_TOKEN>` — `tier_events` shows `report_purchase` after rail tests; `ai_events` shows `personal_report` lens

## 5. What "correct" looks like, in one line per tier

- **free** — everything deterministic works; every paid path is a 402 that routes to the support flow, never a crash.
- **supporter** — deep ask + premium voice + AI-enriched draws; Oracle/Personal still 402.
- **oracle** — Oracle Report compiles; deluxe still demands its own purchase (402 naming "purchase").
- **oracle + claim** — deluxe compiles for that one session seed only.
- **dev token** — oracle everywhere plus purchase bypass; that's the operator skeleton key, keep it out of the client bundle.
