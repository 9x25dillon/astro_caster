# Pricing model — measured unit costs and the prices derived from them

_Written 2026-08-07. Supersedes the "~$0.80/$1.60 worst-case per report" figure
carried in earlier handoffs, which was **5–9× too high** — see §5._

Every number here is measured or derived from a measurement. Where something is
assumed, it says so and names the assumption, because the estimate this replaces
was a guess that hardened into a fact (`docs/audits/DATA_DISCREPANCIES.md` §B).

---

## 1. Measured inputs

| quantity | value | how |
|---|---|---|
| Chart JSON in the prompt | **5,646 tokens** | `parity/natal-chart.json`, one case, indented as sent |
| System prompt (free) | 458 tokens | `SYSTEM_PROMPT` |
| System prompt (+ Oracle extension) | 731 tokens | `+ ORACLE_EXTENSION` |
| Question | ≤ 400 tokens | 1,500-char cap in `_build_prompts` |
| Typical output vs cap | **~45%** | code comment: a 6-section reading uses ~2,400–2,600 of a 6,000 cap |

The chart payload dominates input cost — it is ~87% of a free-tier prompt. Any
future cost work should start there, not with the output cap.

## 2. Model rates (Anthropic first-party, $/MTok)

| model | in | out |
|---|---|---|
| `claude-haiku-4-5` | 1 | 5 |
| `claude-sonnet-5` | 3 | 15 |
| `claude-opus-5` | 5 | 25 |
| `claude-fable-5` | 10 | 50 |

**The generation upgrade was free.** `claude-sonnet-4-6` → `claude-sonnet-5` and
`claude-opus-4-8` → `claude-opus-5` are priced identically to the models they
replace, so every tier got a better writer at the same unit cost.

> Sonnet 5 also has introductory pricing of $2/$10 **through 2026-08-31**. Prices
> below are computed at the **standard** $3/$15 on purpose: a margin that depends
> on intro pricing evaporates three weeks after launch.

## 3. Cost per reading

| tier | model | output cap | typical | worst case |
|---|---|---|---|---|
| free (allowance spent) | Haiku 4.5 | 700 | $0.008 | $0.010 |
| free (premium allowance) | Sonnet 5 | 700 | $0.024 | $0.030 |
| supporter | Sonnet 5 | 3,000 | $0.041 | $0.065 |
| oracle | Opus 5 | 6,000 | $0.101 | $0.184 |
| deluxe report | Fable 5 | 32,000 | $0.73 | $1.68 |

## 4. Prices

**Assumption, stated because it drives everything below: 20 readings per
subscriber-month.** Break-even sits at 64 (supporter) and 83 (oracle), so 20 is
an engaged-but-not-heavy user. The *ratio* is what the uplift depends on, not the
absolute number.

| tier | was | now | profit before | profit after | uplift |
|---|---|---|---|---|---|
| Supporter | $3 | **$3.25** | $1.80 | $2.04 | **+13.5%** |
| Oracle | $9 | **$9.99** | $6.41 | $7.37 | **+15.0%** |
| Deluxe | $5 | **$5.50** | $3.82 | $4.31 | **+12.7%** |

Profit is net of Stripe (2.9% + 30¢) and API cost at typical output.

The exact +13% prices were $3.25 / $9.86 / $5.52. Oracle rounds to $9.99 because
$9.86 reads like an accident; that buys 15.0% instead of 13.0%, which is a
deliberate choice and not a rounding error.

## 5. The estimate this replaces

Earlier handoffs carried "Oracle/Personal reports bill real Fable 5 tokens
(~$0.80/$1.60 worst-case per report)". Measured, an Oracle reading is **$0.10
typical / $0.18 worst case** — 5–9× lower. The deluxe report is the only thing in
the system that approaches $1.60, and only if it runs its full 32k cap.

Nothing was wrong with the pricing that resulted; the figure was simply never
re-measured after the tier models changed.

## 6. The free tier is the only real leak

A free reading costs $0.008–$0.030 with **no revenue against it**, and the
allowance is counted on the device, so it is resettable (see
`frontend/src/lib/freeAllowance.ts` for why that tradeoff was taken).

| active free devices | premium allowance fully used, per month |
|---|---|
| 100 | $180 |
| 1,000 | **$1,800** |
| 10,000 | $18,000 |

That is the worst case — 2 premium readings every day, every device. The real
protections, in order:

1. **`budget.py`'s global daily cap** — server-side, no client can move it. This
   is the actual ceiling.

   > ⚠️ **This was FALSE when written, and is true as of 2026-08-07.** The cap
   > existed, but `/api/ai-ask` — the free tier, the subject of this very
   > section — never called `budget.allow_call` or `budget.record`. Neither did
   > the streamed ask or the tarot reading. `budget.py` even defined the `ask`
   > and `tarot` kinds in `_NOMINAL_CHARS`; nothing ever asked it. So the one
   > path this section calls "the only real leak" was the one path the ceiling
   > did not cover, and setting `AAE_GLOBAL_DAILY_USD` would not have bounded
   > it. All three are gated now, pinned by
   > `test_the_free_ask_path_is_actually_capped`.
   >
   > Two lessons, both cheap next time: a cost control is not verified by
   > reading the module that implements it, only by finding its call site on
   > the path you care about; and `_NOMINAL_CHARS` listing a kind was mistaken
   > for that kind being wired, when it was only ever a price list.
2. The 700-token free cap, which is a third of supporter's room.
3. The offline compiler, which costs nothing and always answers.
4. **Per-IP anonymous budget buckets** (2026-08-07). Tokenless callers used to
   share one bucket named `anon`, so the per-user cap was a single collective
   allowance for the whole internet: one abuser clearing local storage in a
   loop drained the day and every honest visitor got the offline compiler. Each
   address now gets its own daily slice, keyed by a salted hash that rotates
   daily and never leaves memory. Not a security boundary — many addresses
   still buy many buckets — but it makes abuse self-limiting instead of free,
   and the global cap remains the real ceiling.

   **This depends on `AAE_TRUST_PROXY=1` behind a reverse proxy.** Without it
   every visitor resolves to the proxy's address and both this and the rate
   limiter collapse back into one shared bucket — silently, and looking fine.

**The highest-leverage cost work is not the output cap — it is the 5,646-token
chart payload.** Sending a condensed chart summary for short free readings would
cut free-tier input ~80% and bring a premium free reading from $0.024 to well
under a cent. That is not done yet.

## 7. Re-run the numbers

The model above is arithmetic over §1 and §2. If a model, a cap, or a rate
changes, recompute rather than scaling the old answer — that is exactly how the
figure in §5 went stale. `backend/tests/test_free_tier_allowance.py` fails if a
tier is pointed back at a retired model, and
`backend/tests/test_stripe_rail.py::test_default_prices_are_the_founding_rates`
fails if a price moves without a deliberate edit.
