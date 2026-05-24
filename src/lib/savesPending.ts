/**
 * Tracks in-flight save-line / family-delete writes that started in one
 * component and need to be reflected by another (RepertoirePanel /
 * HomePanel) that may not be mounted yet when the response lands.
 *
 * BuildClient navigates back optimistically — its fetch can resolve
 * before the panel even mounts. With only an event-based signal the
 * panel would miss the notification entirely and show stale data until
 * the next manual remount. A persistent counter lets the panel decide
 * on mount: "is there work outstanding I should wait for?".
 */

let pendingCount = 0;
const listeners = new Set<() => void>();

export function incrementPendingSave(): void {
  pendingCount++;
}

export function decrementPendingSave(): void {
  if (pendingCount > 0) pendingCount--;
  if (pendingCount === 0) {
    // Fan out to anyone waiting. Copy the set first so a listener that
    // unsubscribes itself doesn't trip the iterator.
    for (const cb of Array.from(listeners)) cb();
  }
}

export function hasPendingSave(): boolean {
  return pendingCount > 0;
}

/**
 * Run `cb` exactly once the moment all pending saves have settled (or
 * immediately if none are in flight). Returns an unsubscribe so a
 * caller that unmounts before settling stops getting called.
 */
export function whenAllSavesSettle(cb: () => void): () => void {
  if (pendingCount === 0) {
    cb();
    return () => {};
  }
  const wrapped = () => {
    listeners.delete(wrapped);
    cb();
  };
  listeners.add(wrapped);
  return () => listeners.delete(wrapped);
}
