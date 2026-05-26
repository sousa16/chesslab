/**
 * Tiny client-side module cache for the repertoire tree, mirroring
 * statsCache.ts. Survives client-side nav within a SPA session so that
 * going home → repertoire → home → repertoire renders the panel
 * instantly from cache while a background ETag revalidation fires.
 *
 * Personal app, single signed-in user per tab, so we don't key by user.
 * Per-color slot — most users have a primary color they iterate on.
 *
 * The cached value is the full root LineNode the API returns. Cleared
 * when the user signs out or when a known-stale event (delete-line)
 * fires.
 */

// Lazy type — RepertoirePanel defines its own LineNode locally. We just
// hold opaque data here and let the caller cast.
type LineNodeLike = unknown;

interface Slot {
  data: LineNodeLike;
  etag: string | null;
  ts: number;
}

const slots: Record<"white" | "black", Slot | null> = {
  white: null,
  black: null,
};

export function getCachedRepertoireSlot(
  color: "white" | "black",
): Slot | null {
  return slots[color];
}

export function setCachedRepertoireSlot(
  color: "white" | "black",
  data: LineNodeLike,
  etag: string | null,
): void {
  slots[color] = { data, etag, ts: Date.now() };
}

export function clearCachedRepertoire(color?: "white" | "black"): void {
  if (color) slots[color] = null;
  else {
    slots.white = null;
    slots.black = null;
  }
}
