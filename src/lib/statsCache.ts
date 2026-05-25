/**
 * Tiny client-side cache for training stats.
 *
 * Lives in module state, so it survives client-side navigation within a
 * SPA session (e.g. /home → /tactics → /home). On the *second* and later
 * visits to /home, HomePanel renders with the cached numbers instantly
 * while a background revalidation fires — same stale-while-revalidate
 * pattern as SWR, but without the dependency.
 *
 * Personal app, single signed-in user per tab, so we don't key by user.
 * Cleared explicitly when the user signs out or when the stale data is
 * known to be wrong (e.g. delete-line response).
 */

import type { TrainingStats } from "@/lib/trainingStats";

let cached: TrainingStats | null = null;

export function getCachedStats(): TrainingStats | null {
  return cached;
}

export function setCachedStats(stats: TrainingStats): void {
  cached = stats;
}

export function patchCachedStats(patch: Partial<TrainingStats>): void {
  if (!cached) return;
  cached = { ...cached, ...patch };
}

/**
 * Apply a finished-review delta to the cache. Used by TrainingClient
 * (and TacticsClient) so the dashboard counters stay correct when the
 * user returns to /home, even though HomePanel itself is unmounted for
 * the duration of the training session.
 *
 * `wasDue` is the opening-side flag: a card that was due no longer is
 * after a review, so the "moves to practice" counter drops by one.
 * Puzzle reviews don't carry that flag (they don't affect repertoire
 * dueCount) — pass false / omit and only positionsReviewedToday moves.
 */
export function recordReview(opts: { wasDue: boolean }): void {
  if (!cached) return;
  cached = {
    ...cached,
    positionsReviewedToday: (cached.positionsReviewedToday ?? 0) + 1,
    dueCount: opts.wasDue
      ? Math.max(0, cached.dueCount - 1)
      : cached.dueCount,
  };
}

export function clearCachedStats(): void {
  cached = null;
}
