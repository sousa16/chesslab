/**
 * Sliding-window rate limiter (in-process).
 *
 * Works for single-node dev and small deployments. On multi-instance
 * serverless each instance has its own bucket — still slows abuse per
 * instance. For strict global limits, add a shared store (e.g. Upstash).
 */

type Bucket = { count: number; windowStart: number };

const buckets = new Map<string, Bucket>();

/** Drop stale entries occasionally so the map doesn't grow forever. */
function pruneStale(now: number, windowMs: number) {
  if (buckets.size < 500) return;
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart > windowMs * 2) buckets.delete(key);
  }
}

export type RateLimitConfig = {
  /** Max requests allowed per window. */
  max: number;
  /** Window length in milliseconds. */
  windowMs: number;
};

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSeconds: number };

export function checkRateLimit(
  key: string,
  { max, windowMs }: RateLimitConfig,
): RateLimitResult {
  const now = Date.now();
  pruneStale(now, windowMs);

  let bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart >= windowMs) {
    bucket = { count: 0, windowStart: now };
    buckets.set(key, bucket);
  }

  bucket.count += 1;
  if (bucket.count <= max) return { ok: true };

  const retryAfterMs = windowMs - (now - bucket.windowStart);
  return {
    ok: false,
    retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
  };
}
