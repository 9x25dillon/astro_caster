// replay.ts — the same question, of the same chart, at the same tier, returns
// the same reading.
//
// WHY THIS EXISTS. Two reasons, and the second is the load-bearing one:
//
//   1. Cost. Asking the same thing twice paid twice.
//   2. Consistency. For a divination product, giving two different answers to
//      one question of one chart isn't a cache miss, it's a contradiction. A
//      reader who re-opens a reading should find the reading they were given.
//
// KEYED ON INPUTS, NEVER ON A SEED. A seed here is identity, not a cache key:
// re-deriving one re-deals the spread rather than returning it. Keying replay on
// a seed would hand back a DIFFERENT reading under the name of the same one —
// the exact failure this is built to prevent. So the key is a hash of everything
// that shapes the prompt, and nothing else.
//
// WHAT IS DELIBERATELY IN THE KEY:
//   - the birth data that determines the chart (not the chart itself: the same
//     birth data always yields the same chart, and hashing the computed chart
//     would invalidate every stored reading on any ephemeris change)
//   - the normalized question
//   - lens, depth, and the focused selection — each changes the prompt
//   - the entitlement, because it decides the tier, which decides the model AND
//     the length the prompt asks for. Keyed on the TOKEN rather than a tier
//     string because the store never holds the tier: a different tier is always
//     a different token, so this is the more precise of the two. The token is
//     one input to a hash and is not recoverable from the key.
//
// WHAT IS DELIBERATELY OUT:
//   - the model. The entitlement already determines it, and pinning the model
//     would invalidate every reading the moment a model id changes underneath a
//     tier that still costs the reader the same. The cost of keying on the token
//     is that a token RENEWAL orphans that reader's stored readings — they
//     regenerate once. That errs on the safe side: the alternative is serving a
//     reading written for a tier they no longer hold.
//   - anything about WHEN it was asked. "Same question, same answer" has to
//     hold across days or it isn't a guarantee.

import type { AIResult } from "../api/client";
import { replaySyncFetch, replaySyncPut } from "../api/client";
import type { BirthInput, Lens, Selection } from "../types";
import { replayGet, replayPut, replayTouch } from "./bookshelf";

/** Bump when a change should orphan every stored reading rather than serve a
 *  stale-shaped one — a prompt rewrite, a new required section. */
const SCHEMA = "astra-replay@1";

/** The birth fields that actually determine the chart, in a fixed order. */
const BIRTH_FIELDS: (keyof BirthInput)[] = [
  "year", "month", "day", "hour", "minute", "second",
  "lat", "lng", "tz_offset", "house_system", "zodiac", "ayanamsha",
];

/**
 * Whitespace-collapsed and case-folded. Someone who re-types their question
 * with different capitalization or a stray double space is asking the same
 * question, and should get the same answer rather than a second charge.
 */
export function normalizeQuestion(q: string): string {
  return q.trim().replace(/\s+/g, " ").toLowerCase();
}

function birthFingerprint(birth: BirthInput): string {
  return BIRTH_FIELDS.map((f) => String(birth[f] ?? "")).join(",");
}

async function sha256Hex(input: string): Promise<string | null> {
  // Web Crypto rather than the pure-TS sha256 in @astra/core: that module lives
  // in the lazily-imported engine chunk, and pulling ~160KB across the wire to
  // hash one short string would cost more than the replay saves. Absent (an
  // insecure context) means no replay at all, never a broken ask.
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  try {
    const bytes = new TextEncoder().encode(input);
    const digest = await subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}

export interface ReplayInputs {
  birth: BirthInput;
  query: string;
  lens: Lens;
  depth: "quick" | "deep";
  /** The entitlement token, or null on the free tier. See the note above on
   *  why this stands in for the tier. */
  entitlement: string | null;
  selection: Selection | null;
}

/** The replay key, or null when this ask must not be replayed at all. */
export async function replayKey(i: ReplayInputs): Promise<string | null> {
  const question = normalizeQuestion(i.query);
  // An empty question is the "surprise me" path — Suggestions, the blank-box
  // reflection. Replaying those would freeze a surface whose whole point is
  // that it differs each time.
  if (!question) return null;
  return sha256Hex([
    SCHEMA,
    birthFingerprint(i.birth),
    question,
    i.lens,
    i.depth,
    i.entitlement ?? "free",
    i.selection?.type ?? "",
    i.selection?.id ?? "",
  ].join("\n"));
}

function asResult(
  interpretation: string,
  model: string | null,
  provider: string | null,
  createdAt: string
): AIResult {
  return {
    interpretation,
    source: "llm",
    model: model ?? "",
    provider: (provider as AIResult["provider"]) ?? undefined,
    replayed_at: createdAt,
  } as AIResult;
}

/**
 * A stored reading for these inputs, or null.
 *
 * Local first, always — it is the default path, it is instant, and it needs no
 * network. The server is consulted only when the reader has turned sync on AND
 * the local store missed, which is exactly the case sync exists for: a second
 * device, or a browser whose storage was cleared. A server hit is written back
 * locally so the next ask on this device doesn't need the network either.
 */
export async function replayLookup(
  i: ReplayInputs,
  sync = false
): Promise<AIResult | null> {
  const key = await replayKey(i);
  if (!key) return null;

  const local = await replayGet(key);
  if (local) {
    void replayTouch(key);
    return asResult(local.interpretation, local.model, local.provider, local.createdAt);
  }

  if (!sync || !i.entitlement) return null;
  const remote = await replaySyncFetch(key, i.entitlement);
  if (!remote) return null;
  const createdAt = new Date(remote.created * 1000).toISOString();
  void replayPut({
    key,
    interpretation: remote.text,
    model: remote.model,
    provider: null,
  });
  return asResult(remote.text, remote.model, null, createdAt);
}

/**
 * Store a reading for replay. Only genuine model output is stored: an offline
 * reading is already deterministic and free to recompute, and freezing one
 * would keep serving the fallback long after the model came back.
 */
export async function replayStore(
  i: ReplayInputs,
  result: AIResult,
  sync = false
): Promise<string | null> {
  if (result.source !== "llm") return null;
  if (!result.interpretation?.trim()) return null;
  // A replayed reading is already stored — writing it back would only refresh
  // its timestamp and make it look newer than the reading it actually is.
  if (result.replayed_at) return null;
  const key = await replayKey(i);
  if (!key) return null;
  await replayPut({
    key,
    interpretation: result.interpretation,
    model: result.model ?? null,
    provider: result.provider ?? null,
  });
  if (sync && i.entitlement) {
    void replaySyncPut(key, result.interpretation, result.model ?? null, i.entitlement);
  }
  return key;
}
