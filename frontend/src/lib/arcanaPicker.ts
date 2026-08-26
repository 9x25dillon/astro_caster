// arcanaPicker.ts — the Studio deck picker's "Your signature" group.
//
// The natal signature is one link PER BODY, but a card is not: two bodies can
// legitimately carry the SAME trump, because cardForBody() resolves a body two
// different ways (packages/astra-core/src/tarot.ts):
//
//   1. a planet with its own card  → PLANET_MAJOR[body]
//   2. anything else               → SIGN_MAJOR[the body's sign]
//
// Only the Ascendant and the Midheaven take route 2 — and three trumps are
// reachable by BOTH routes: `hermit` (Chiron / Virgo), `moon` (South Node /
// Pisces) and `star` (North Node / Aquarius). Chiron and the South Node are not
// in SIGNATURE_ORDER, so `star` is the live collision: **North Node is always in
// the signature, so an Ascendant or Midheaven in Aquarius carries `star` too.**
// Asc and MC can also simply share a sign, which collides them with each other.
//
// Rendering one <option> per body then offers the same card id twice. A <select>
// tolerates that silently; the deck-completeness contract does not — the picker
// is supposed to reach each of the 78 exactly once (e2e/studio-deck.spec.ts).
//
// This is sky-dependent, so it surfaces intermittently: on the live sky the
// Ascendant walks all twelve signs every day, putting it in Aquarius for roughly
// two hours out of twenty-four. It shipped in 93c244e and went unnoticed for
// exactly that reason.
//
// The fix is to merge by card and keep every carrier in the label, so the group
// still answers "which body brought this card?" — now with the honest answer
// when more than one did.
//
// Pure: no React, no DOM, no engine import.

/** The subset of ArcanaCardLink this needs — structural, so the real type from
 *  api/client (and the engine's own shape) both satisfy it. */
export interface SignatureLinkLike {
  body: string;
  card: { id: string; name: string };
}

export interface SignatureOption {
  /** The card id — the value that travels to /deck-art. Unique across the list. */
  id: string;
  name: string;
  /** Every body carrying this card, in signature order. Usually one. */
  bodies: string[];
}

/**
 * Collapse per-body signature links into per-card picker options.
 *
 * Order is preserved: a Map keeps insertion order, so the result follows
 * SIGNATURE_ORDER (Sun, Moon, Ascendant, …) and a merged card keeps the
 * position of its FIRST carrier. Every returned id is distinct, which is the
 * property the picker's 78-card contract depends on.
 */
export function mergeSignatureByCard(
  links: readonly SignatureLinkLike[] | null | undefined
): SignatureOption[] {
  const byCard = new Map<string, SignatureOption>();
  for (const l of links ?? []) {
    if (!l?.card?.id) continue;
    const hit = byCard.get(l.card.id);
    if (hit) {
      if (!hit.bodies.includes(l.body)) hit.bodies.push(l.body);
    } else {
      byCard.set(l.card.id, { id: l.card.id, name: l.card.name, bodies: [l.body] });
    }
  }
  return [...byCard.values()];
}

/** "The Star (North Node, Ascendant)" — one carrier or several, same shape. */
export function signatureOptionLabel(opt: SignatureOption): string {
  return `${opt.name} (${opt.bodies.join(", ")})`;
}
