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

export function clearCachedStats(): void {
  cached = null;
}
