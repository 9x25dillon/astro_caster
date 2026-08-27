// plateCache.ts — one rendered card, shown everywhere it appears.
//
// Deck-art plates were already durable: the Studio writes each one to the
// Gallery (IndexedDB) under a stable `plate:{source}:{cardId}` id, so
// re-rendering replaces in place and the Vault export carries them. What was
// missing is that ONLY the Studio's own component state ever read them back.
// A plate you paid to render was invisible in the draw that prompted it, in
// chapter II's reading, and in the card of the day.
//
// This is the shared read side. It is deliberately:
//
//  · FREE and OFFLINE. Reading a plate costs nothing and touches no network —
//    the image is already on the device. Only *rendering* a new one is paid
//    and oracle-gated, so a reader who has rendered a card once keeps seeing
//    it forever, on every surface, including in airplane mode.
//  · SOURCE-AWARE BUT NOT SOURCE-STRICT. A card can hold one plate per deck
//    lineage (golden_dawn / rws / thoth / jungian). We prefer the lineage
//    being displayed and otherwise fall back to the most recent plate of any
//    lineage — a Thoth image of Death is a far better answer than no image,
//    and the alternative is asking the reader to pay again for a picture they
//    already own.
//  · LIVE. Rendering a plate anywhere updates every mounted surface at once
//    via `useSyncExternalStore`, so the card of the day fills in the moment
//    the Studio finishes, without a reload.
//
// There are only 78 cards, so this cache converges: the longer a reader uses
// the deck, the more often a draw is already illustrated.
import { useSyncExternalStore } from "react";
import { galleryByKind, type GalleryItem } from "./bookshelf";

export interface CachedPlate {
  cardId: string;
  /** Deck lineage this plate was rendered for, when it was recorded. */
  source: string | null;
  /** A self-contained `data:` URL — usable directly as an <img src>. */
  dataUrl: string;
  title: string;
  updatedAt: string;
}

/** cardId → its plates, newest first. */
let cache: Map<string, CachedPlate[]> = new Map();
let loaded = false;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const fn of listeners) fn();
}

function toPlate(it: GalleryItem): CachedPlate | null {
  if (!it.cardId || !it.data) return null;
  return {
    cardId: it.cardId,
    source: it.source,
    dataUrl: it.data,
    title: it.title,
    updatedAt: it.updatedAt,
  };
}

function insert(p: CachedPlate): void {
  const list = cache.get(p.cardId) ?? [];
  // One plate per (card, source): a re-render replaces rather than stacks,
  // mirroring the Gallery's own stable-id rule.
  const next = list.filter((x) => x.source !== p.source);
  next.unshift(p);
  next.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  cache.set(p.cardId, next);
}

/**
 * Read every stored plate once. Safe to call repeatedly and from many
 * components — the work happens once and later callers await the same promise.
 * Failure is silent by design: a device with no IndexedDB (private mode) simply
 * has no plates, which is the same as not having rendered any.
 */
export function loadPlates(): Promise<void> {
  if (loaded) return Promise.resolve();
  return (loading ??= galleryByKind("plate")
    .then((items) => {
      const next = new Map<string, CachedPlate[]>();
      cache = next;
      for (const it of items) {
        const p = toPlate(it);
        if (p) insert(p);
      }
      loaded = true;
      emit();
    })
    .catch(() => {
      loaded = true; // don't retry forever on a device that cannot store
    }));
}

/**
 * The best plate for a card: the requested lineage if it exists, otherwise the
 * most recent plate of any lineage. Null when the card has never been rendered.
 */
export function plateFor(cardId: string, source?: string | null): CachedPlate | null {
  const list = cache.get(cardId);
  if (!list?.length) return null;
  if (source) {
    const exact = list.find((p) => p.source === source);
    if (exact) return exact;
  }
  return list[0];
}

/** True when this card has any plate at all. */
export function hasPlate(cardId: string): boolean {
  return (cache.get(cardId)?.length ?? 0) > 0;
}

/** How many of the 78 have been illustrated — the Gallery's own progress. */
export function plateCount(): number {
  return cache.size;
}

/** Record a freshly rendered plate so every mounted surface shows it at once.
 *  Call this alongside `gallerySave`, not instead of it. */
export function rememberPlate(item: Omit<GalleryItem, "createdAt" | "updatedAt">): void {
  const p = toPlate({
    ...item,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as GalleryItem);
  if (!p) return;
  insert(p);
  emit();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  void loadPlates();
  return () => { listeners.delete(fn); };
}

// The snapshot must be referentially stable between emits or
// useSyncExternalStore loops forever, so the cached object itself is returned
// rather than a fresh wrapper.
const NO_PLATE = null;

/**
 * React binding. Returns the card's plate, or null. Triggers the one-time load
 * on first use, so no caller needs to remember to prime the cache.
 */
export function usePlate(
  cardId: string | null | undefined,
  source?: string | null,
): CachedPlate | null {
  return useSyncExternalStore(
    subscribe,
    () => (cardId ? plateFor(cardId, source) : NO_PLATE),
    () => NO_PLATE, // server/prerender: never a plate
  );
}

/** Test seam — drops the cache so a suite can start from empty. */
export function __resetPlateCache(): void {
  cache = new Map();
  loaded = false;
  loading = null;
  emit();
}
